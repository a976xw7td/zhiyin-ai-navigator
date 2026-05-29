/**
 * Background Service Worker — 编排中枢
 *
 * 唯一状态持有者 + 消息路由 + API 编排
 * ES Module，通过 import 加载 llm-client
 */

import { infer, inferMinimal, inferStream, MODELS, recoverPartialJson, composeStudyNoteWithLLM } from '../lib/llm-client.js';
import { transcribe } from '../lib/asr-client.js';
import { synthesize } from '../lib/tts-client.js';
import { detectLanguage, statusMsg } from '../lib/lang.js';
import { identifySite, buildSitePrompt } from '../lib/site-profiles.js';
import { checkEthicsRisk, buildEthicsPrompt } from '../lib/ethics-guard.js';
import { buildLearningPlan } from '../lib/learning-recommender.js';
import { shouldStartCollab, createCollabTask } from '../lib/collab-state.js';
import { findMatch, DEMO_SUGGESTIONS } from '../lib/demo-scenarios.js';
import { getWorkflowState, appendNoteSource, appendStudyNote, deleteNoteSource, clearNoteFolder, rememberCollectedSource, rememberStudyNote, rememberReport } from '../lib/workflow-state.js';
import { normalizePageSource } from '../lib/knowledge-extractor.js';
import { normalizeSelectionSource, normalizeViewportSource, normalizeFusedPageSource, fuseMultiSourceContext } from '../lib/context-fusion.js';
import { routeIntent, buildPageAwarePrompt } from '../lib/intent-router.js';
import { composeStudyNote } from '../lib/note-composer.js';
import { prepareMarkdownExport, prepareWordExport, preparePrintablePdfExport, prepareAnkiExport, preparePptxExport } from '../lib/exporter.js';

// --- 应用状态 (单一数据源) ---
// MV3 Service Worker 随时可能被 Chrome 回收，关键状态自动写入
// chrome.storage.session（内存级，SW 重启后恢复）
const _stateData = {
  apiKey: '',
  model: 'v4flash',
  asrApiKey: '',
  asrEndpoint: '',
  asrModel: 'FunAudioLLM/SenseVoiceSmall',
  language: 'zh',
  currentPage: null,
  currentPageUrl: null,
  animState: 'idle',
  isProcessing: false,
  isRecording: false,
  activeTabId: null,
  domDistillPromise: null,
  recordingTimer: null,
  streamAbortController: null,
  currentTask: null,
  isMuted: false,
  isDemoMode: false
};
// Proxy 自动拦截对关键字段的写入并持久化到 chrome.storage.session
const STATE = new Proxy(_stateData, {
  set(target, key, value) {
    const old = target[key];
    target[key] = value;
    const criticalFields = ['isProcessing', 'isRecording', 'activeTabId', 'animState', 'currentPageUrl', 'language', 'isMuted', 'isDemoMode'];
    if (criticalFields.includes(key) && old !== value) {
      chrome.storage.session.set({ swState: {
        isProcessing: target.isProcessing,
        isRecording: target.isRecording,
        activeTabId: target.activeTabId,
        animState: target.animState,
        currentPageUrl: target.currentPageUrl,
        language: target.language,
        isMuted: target.isMuted,
        isDemoMode: target.isDemoMode
      }}).catch(() => {});
    }
    return true;
  }
});

const _distillCache = new Map();
const DISTILL_CACHE_TTL = 5 * 60 * 1000;

let _settingsLoaded = false;

async function restoreCriticalState() {
  try {
    const data = await chrome.storage.session.get(['swState', 'distillCache']);
    if (data.swState) {
      // MV3 重启后，处理/录音必然已中断，重置标志防卡死
      _stateData.isRecording = false;
      _stateData.isProcessing = false;
      _stateData.activeTabId = null;
      _stateData.animState = data.swState.animState || 'idle';
      _stateData.currentPageUrl = data.swState.currentPageUrl || null;
      _stateData.language = data.swState.language || 'zh';
      _stateData.isMuted = data.swState.isMuted || false;
      _stateData.isDemoMode = data.swState.isDemoMode || false;
    }
    if (data.distillCache) {
      for (const [url, entry] of data.distillCache) {
        if (Date.now() - entry.time < DISTILL_CACHE_TTL) {
          _distillCache.set(url, entry);
        }
      }
    }
  } catch (_) {}
}

// --- 带重试的异步调用（TIMEOUT / RATE_LIMIT 时自动重试最多 2 次，指数退避）---
async function withRetry(fn, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      // 以下错误不重试：空响应 / JSON 解析失败 / 认证失败
      if (['API_EMPTY_RESPONSE', 'API_JSON_ERROR', 'API_AUTH_ERROR'].includes(e.message)) throw e;
      // TIMEOUT / RATE_LIMIT / NETWORK 才重试（ASR 和 LLM 错误码前缀不同）
      if (['API_TIMEOUT', 'API_RATE_LIMIT', 'ASR_TIMEOUT', 'ASR_NETWORK'].includes(e.message)) {
        if (attempt < maxRetries) {
          const delay = (attempt + 1) * 1000; // 第1次等1s，第2次等2s
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      throw e;
    }
  }
  throw lastError;
}

// --- 懒加载用户设置 ---
// MV3 Service Worker 随时可能被 Chrome 回收；onInstalled/onStartup 不覆盖任意重启
// 每次进入关键流程前从 storage 同步，确保用户保存的 key 生效
async function ensureSettings() {
  const stored = await chrome.storage.local.get(['apiKey', 'model', 'asrApiKey', 'asrEndpoint', 'language', 'asrModel', 'muted', 'demoMode']);
  if (stored.apiKey) STATE.apiKey = stored.apiKey;
  if (stored.model) STATE.model = stored.model;
  if (stored.asrApiKey !== undefined) STATE.asrApiKey = stored.asrApiKey;
  if (stored.asrEndpoint !== undefined) STATE.asrEndpoint = stored.asrEndpoint;
  if (stored.language !== undefined) STATE.language = stored.language;
  if (stored.asrModel) STATE.asrModel = stored.asrModel;
  if (stored.muted !== undefined) STATE.isMuted = stored.muted;
  if (stored.demoMode !== undefined) STATE.isDemoMode = stored.demoMode;
  // 自动检测演示模式：无 API Key 且非手动关闭
  if (!STATE.apiKey && stored.demoMode !== false) STATE.isDemoMode = true;
}

// --- 推送状态文本到侧边栏 ---
function pushStatus(state, text) {
  chrome.runtime.sendMessage({ type: 'STATUS_TEXT', payload: { state, text } }).catch(() => {});
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'STATUS_TEXT', payload: { state, text } }).catch(() => {});
  }).catch(() => {});
}

// Offscreen Document 管理（用于受限页面录音降级）
async function ensureOffscreen() {
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: '需要麦克风权限进行语音识别'
    });
  } catch (e) {
    // 如果已存在，Chrome 会报错，忽略
    if (!e.message?.includes('already exists')) {
      console.warn('[SW] Offscreen creation failed:', e.message);
    }
  }
}

// --- 初始化 ---
chrome.runtime.onInstalled.addListener(async () => {
  await ensureSettings();
  await restoreCriticalState();
  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'open-zy-sidepanel',
    title: '智引 AI 导航导师',
    contexts: ['page', 'selection', 'link']
  });
  chrome.contextMenus.create({
    id: 'zy-explain',
    title: '解释此内容',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'zy-search-related',
    title: '搜索相关内容',
    contexts: ['selection']
  });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureSettings();
  await restoreCriticalState();
});

// --- 页面导航自动注入 Content Script ---
// 确保用户在任何页面都能立即使用 Widget，无需手动触发
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome')) {
    ensureContentScript(tabId).catch(() => {});
  }
});

// --- 快捷键：聚焦 Widget 输入框 ---
chrome.commands.onCommand.addListener((command) => {
  if (command === 'focus-widget-input') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) {
        ensureContentScript(tab.id).then(() => {
          chrome.tabs.sendMessage(tab.id, { type: 'FOCUS_WIDGET_INPUT' }).catch(() => {});
        }).catch(() => {});
      }
    }).catch(() => {});
  }
});

// --- 工具栏图标点击 / 快捷键 → 打开侧边栏 + 预注入 content script ---
chrome.action.onClicked.addListener((tab) => {
  if (tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
  // 预注入 content script，确保侧边栏打开后录音/DOM 操作立即可用
  if (tab?.id) {
    ensureContentScript(tab.id).catch(() => {});
  }
});

// --- 右键菜单：打开侧边栏 + 预注入 content script ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.windowId) return;
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});

  // 预注入 content script，右键菜单触发 activeTab 权限
  if (tab?.id) {
    ensureContentScript(tab.id).catch(() => {});
  }

  if (!info.selectionText) return;

  var lang = STATE.language || 'zh';
  // 根据菜单项生成带上下文的查询
  var transcript;
  switch (info.menuItemId) {
    case 'zy-explain':
      transcript = (lang === 'zh' ? '请解释以下内容：\n\n' : 'Please explain the following:\n\n') + info.selectionText;
      break;
    case 'zy-search-related':
      transcript = (lang === 'zh' ? '在当前页面中搜索与以下内容相关的功能或入口：\n\n' : 'Search for features or entries related to the following:\n\n') + info.selectionText;
      break;
    default:
      transcript = info.selectionText;
  }

  // 直接调用 handleAsrResult（MV3 中 runtime.sendMessage 不会回到 SW 自身）
  setTimeout(() => {
    handleAsrResult(transcript, tab).catch(() => {});
  }, 500);
});

// --- 等待 Tab 加载完成 ---
// SPA 路由切换（页内跳转）不需要等待，只有整页导航需要
async function waitForTabReady(tabId) {
  try {
    for (let i = 0; i < 30; i++) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) return;
      // status: 'loading' (整页导航) 或 'complete'
      // SPA 路由切换不会改变 status，不影响
      if (tab.status === 'complete') return;
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (_) {}
}

// --- Content Script 存活检测 + 按需注入 ---
// 针对扩展安装前已打开的标签页（content script 未注入的情况）
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return; // 已注入，无需操作
  } catch (_) {
    // 需要注入
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'lib/dom-distiller.js',
        'lib/selector-engine.js',
        'lib/task-queue.js',
        'content/shared.js',
        'content/widget-content.js',
        'content/widget-ui.js',
        'content/highlight.js',
        'content/recording.js',
        'content/content.js'
      ]
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/content.css']
    });
    // 等待 Content Script 初始化完成：用 PING 轮询替代固定延迟
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        return;
      } catch (_) { /* still loading */ }
    }
    console.warn('[SW] Content script PING timeout after 2s');
    pushStatus('idle', '⚠️ 页面加载中，请刷新后重试');
  } catch (e) {
    console.warn('[SW] Content script inject failed:', e.message);
    pushStatus('idle', '⚠️ 无法注入导航助手，请刷新页面');
  }
}

function resetRecordingState() {
  STATE.isRecording = false;
  STATE.activeTabId = null;
  if (STATE.recordingTimer) {
    clearTimeout(STATE.recordingTimer);
    STATE.recordingTimer = null;
  }
}

function pageTextForEthics(tab, domResult) {
  const ctx = domResult?.pageContext || {};
  return [
    tab?.url || '',
    ctx.title || '',
    ctx.meta || '',
    ctx.headings ? ctx.headings.join(' ') : '',
    ctx.bodyText || ''
  ].join(' ');
}

async function getActiveWorkflowTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('NO_TAB');
  if (/^(chrome|about|data|javascript):/i.test(tab.url || '')) throw new Error('INVALID_TAB');
  return tab;
}

async function collectPageSourceFromTab(tab) {
  await waitForTabReady(tab.id);
  await ensureContentScript(tab.id);
  const pageText = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' });
  if (!pageText || pageText.error) throw new Error(pageText?.error || 'GET_PAGE_TEXT_FAILED');
  const viewport = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_VIEWPORT_CONTEXT' }).catch(() => null);
  const siteProfile = identifySite(tab.url);
  const pageSource = normalizePageSource(tab, pageText, siteProfile);
  const source = normalizeFusedPageSource(tab, pageSource, viewport && !viewport.error ? viewport : null, siteProfile);
  return enrichCollectionResult(await appendNoteSource(source));
}

async function getSelectionContextFromTab(tab) {
  await waitForTabReady(tab.id);
  await ensureContentScript(tab.id);
  const selection = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION_CONTEXT' });
  if (!selection || selection.error) throw new Error(selection?.error || 'GET_SELECTION_CONTEXT_FAILED');
  return selection;
}

async function getViewportContextFromTab(tab) {
  await waitForTabReady(tab.id);
  await ensureContentScript(tab.id);
  const viewport = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_VIEWPORT_CONTEXT' });
  if (!viewport || viewport.error) throw new Error(viewport?.error || 'CAPTURE_VIEWPORT_CONTEXT_FAILED');
  return viewport;
}

async function collectSelectionSourceFromTab(tab) {
  const selection = await getSelectionContextFromTab(tab);
  if (!selection.selectedText) throw new Error('NO_SELECTION');
  const siteProfile = identifySite(tab.url);
  const source = normalizeSelectionSource(tab, selection, siteProfile);
  return enrichCollectionResult(await appendNoteSource(source));
}

async function collectManualTextSource(payload) {
  const text = String(payload?.text || '').trim();
  if (!text) throw new Error('EMPTY_TEXT');
  let tab = null;
  try {
    tab = payload?.tabId ? await chrome.tabs.get(payload.tabId) : await getActiveWorkflowTab();
  } catch (_) {}
  const url = tab?.url || payload?.url || '';
  const titleBase = String(payload?.title || tab?.title || '手动输入文本').trim();
  let host = '';
  try { host = url ? new URL(url).hostname : ''; } catch (_) {}
  const source = {
    id: 'src_' + Date.now(),
    type: 'manual',
    title: '手动文本：' + titleBase.slice(0, 120),
    url,
    host,
    text: text.slice(0, 6000),
    selectedText: text.slice(0, 6000),
    excerpt: text.slice(0, 360),
    siteProfile: tab?.url ? identifySite(tab.url) : null,
    collectedAt: new Date().toISOString()
  };
  return enrichCollectionResult(await appendNoteSource(source));
}

async function collectFileSource(payload) {
  const text = String(payload?.text || '').trim();
  const filename = String(payload?.filename || '未命名文件').trim();
  if (!filename) throw new Error('EMPTY_FILENAME');
  const source = {
    id: 'src_' + Date.now(),
    type: 'file',
    title: '文件：' + filename.slice(0, 140),
    url: '',
    host: 'local-file',
    text: text.slice(0, 12000) || '文件已导入，但当前版本未能读取正文。',
    excerpt: (text || filename).slice(0, 420),
    fileName: filename,
    mimeType: payload?.mimeType || '',
    size: Number(payload?.size || 0) || 0,
    collectedAt: new Date().toISOString()
  };
  return enrichCollectionResult(await appendNoteSource(source));
}

function stripSearchHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function rankSearchCandidate(query, item) {
  const text = [item.name, item.url, item.snippet].join(' ').toLowerCase();
  const words = String(query || '').toLowerCase().split(/\s+|，|,|、/).filter(Boolean);
  let score = 0;
  words.forEach(word => { if (text.indexOf(word) !== -1) score += 2; });
  if (/docs|documentation|github|official|官网|wikipedia|ieee|arxiv|developer|learn|tutorial|course/i.test(text)) score += 2;
  if (/广告|adservice|doubleclick|login|signin/i.test(text)) score -= 4;
  return score;
}

async function webSearchResources(payload) {
  const query = String(payload?.query || '').trim();
  if (!query) throw new Error('EMPTY_QUERY');
  const url = 'https://duckduckgo.com/html/?q=' + encodeURIComponent(query);
  let html = '';
  try {
    const res = await fetch(url, { method: 'GET' });
    html = await res.text();
  } catch (_) {
    html = '';
  }
  const candidates = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && candidates.length < 8) {
    let target = match[1] || '';
    try {
      const u = new URL(target, 'https://duckduckgo.com');
      const uddg = u.searchParams.get('uddg');
      if (uddg) target = decodeURIComponent(uddg);
    } catch (_) {}
    candidates.push({
      name: stripSearchHtml(match[2]).slice(0, 90),
      url: target,
      snippet: stripSearchHtml(match[3]).slice(0, 260)
    });
  }
  if (!candidates.length) {
    candidates.push(
      { name: 'Google 搜索：' + query, url: 'https://www.google.com/search?q=' + encodeURIComponent(query), snippet: '通用搜索入口，可继续查找最相关资料。' },
      { name: 'GitHub 搜索：' + query, url: 'https://github.com/search?q=' + encodeURIComponent(query), snippet: '适合查找开源项目、代码示例和实践资料。' },
      { name: 'Bing 搜索：' + query, url: 'https://www.bing.com/search?q=' + encodeURIComponent(query), snippet: '通用搜索入口，可补充网页资料。' }
    );
  }
  const recommendations = candidates
    .map(item => Object.assign({}, item, { score: rankSearchCandidate(query, item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => ({
      name: item.name || item.url,
      url: item.url,
      reason: item.snippet || '与当前主题相关，可作为后续学习、导航和采集入口。'
    }));
  const sources = [];
  let latestFolder = null;
  for (const item of recommendations) {
    let host = '';
    try { host = new URL(item.url).hostname; } catch (_) {}
    const source = {
      id: 'src_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: 'search-result',
      title: '搜索结果：' + item.name,
      url: item.url,
      host,
      text: ['查询：' + query, '推荐网站：' + item.name, '网址：' + item.url, '推荐理由：' + item.reason].join('\n'),
      excerpt: item.reason,
      collectedAt: new Date().toISOString()
    };
    const result = await appendNoteSource(source);
    await rememberCollectedSource(result.source).catch(() => null);
    latestFolder = result.noteFolder;
    sources.push(result.source);
  }
  return { ok: true, query, recommendations, sources, noteFolder: latestFolder };
}

async function collectViewportSourceFromTab(tab) {
  const viewport = await getViewportContextFromTab(tab);
  const siteProfile = identifySite(tab.url);
  const source = normalizeViewportSource(tab, viewport, siteProfile);
  return enrichCollectionResult(await appendNoteSource(source));
}

async function enrichCollectionResult(result) {
  if (!result?.ok || !result.source) return result;
  const memoryResult = await rememberCollectedSource(result.source).catch(() => null);
  return Object.assign({}, result, {
    taskMemory: memoryResult?.taskMemory || null,
    suggestions: memoryResult?.suggestions || [],
    postCollectSuggestions: memoryResult?.suggestions || []
  });
}

async function getMultiSourceContextFromTab(tab) {
  await waitForTabReady(tab.id);
  await ensureContentScript(tab.id);
  const siteProfile = identifySite(tab.url);
  const pageText = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }).catch(() => null);
  const selection = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION_CONTEXT' }).catch(() => null);
  const viewport = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_VIEWPORT_CONTEXT' }).catch(() => null);
  const domSource = pageText && !pageText.error ? normalizePageSource(tab, pageText, siteProfile) : null;
  return fuseMultiSourceContext({
    domSource,
    selection: selection && !selection.error ? selection : null,
    viewport: viewport && !viewport.error ? viewport : null,
    siteProfile
  });
}

async function composeStudyNoteFromFolder(payload) {
  await ensureSettings().catch(() => {});
  const state = await getWorkflowState();
  const explicitSourceIds = Array.isArray(payload?.sourceIds) ? payload.sourceIds.filter(Boolean) : [];
  const sources = explicitSourceIds.length
    ? state.noteFolder.sources.filter(source => explicitSourceIds.includes(source.id))
    : state.noteFolder.sources.slice(0, 1);
  const composeInput = {
    title: payload?.title,
    goal: payload?.goal || payload?.prompt,
    sources
  };
  let note;
  if (STATE.apiKey && !STATE.isDemoMode && payload?.localOnly !== true) {
    try {
      note = await composeStudyNoteWithLLM(composeInput, STATE.apiKey, STATE.model);
    } catch (e) {
      console.warn('[Workflow] LLM note compose fallback:', e.message);
    }
  }
  if (!note) note = composeStudyNote(composeInput);
  if (sources[0]) {
    note.sourceUrl = note.sourceUrl || sources[0].url || '';
    note.host = note.host || sources[0].host || '';
    note.siteName = note.siteName || sources[0].siteProfile?.name || sources[0].site || sources[0].host || '';
  }
  const result = await appendStudyNote(note);
  const memoryResult = await rememberStudyNote(result.note).catch(() => null);
  return Object.assign({}, result, { taskMemory: memoryResult?.taskMemory || null });
}

async function exportLatestStudyNote(payload) {
  const state = await getWorkflowState();
  let note = null;
  if (payload?.noteId) {
    note = state.noteFolder.notes.find(item => item.id === payload.noteId) || null;
  }
  if (!note && payload?.markdown) {
    note = { title: payload.title || '学习笔记', markdown: payload.markdown, createdAt: new Date().toISOString() };
  }
  if (!note) note = getDefaultStudyNoteForExport(state);
  return prepareMarkdownExport(note);
}

async function getLatestStudyNote(payload) {
  const state = await getWorkflowState();
  let note = null;
  if (payload?.noteId) {
    note = state.noteFolder.notes.find(item => item.id === payload.noteId) || null;
  }
  if (!note && payload?.markdown) {
    note = { title: payload.title || '学习笔记', markdown: payload.markdown, createdAt: new Date().toISOString() };
  }
  if (!note) note = getDefaultStudyNoteForExport(state);
  return note;
}

function getDefaultStudyNoteForExport(state) {
  const folder = state?.noteFolder || {};
  const latestNote = Array.isArray(folder.notes) ? folder.notes[0] : null;
  const latestSource = Array.isArray(folder.sources) ? folder.sources[0] : null;
  if (latestNote && latestSource) {
    const noteTime = Date.parse(latestNote.createdAt || latestNote.updatedAt || 0) || 0;
    const sourceTime = Date.parse(latestSource.collectedAt || latestSource.createdAt || 0) || 0;
    if (noteTime >= sourceTime) {
      return Object.assign({
        sourceUrl: latestSource.url || '',
        host: latestSource.host || '',
        siteName: latestSource.siteProfile?.name || latestSource.site || latestSource.host || ''
      }, latestNote);
    }
    return composeStudyNote({
      title: latestSource.title || '学习笔记',
      sources: [latestSource]
    });
  }
  return latestNote || composeStudyNote({ sources: latestSource ? [latestSource] : [] });
}

async function exportLatestStudyNoteAsWord(payload) {
  const note = await getLatestStudyNote(payload);
  const result = prepareWordExport(note);
  rememberReport({ type: 'word', title: note?.title, noteTitle: note?.title }).catch(() => {});
  return result;
}

async function exportLatestStudyNoteAsPdfPage(payload) {
  const note = await getLatestStudyNote(payload);
  const result = preparePrintablePdfExport(note);
  rememberReport({ type: 'pdf', title: note?.title, noteTitle: note?.title }).catch(() => {});
  return result;
}

async function exportLatestStudyNoteAsAnki(payload) {
  const note = await getLatestStudyNote(payload);
  return prepareAnkiExport(note);
}

async function exportLatestStudyNoteAsPptx(payload) {
  const note = await getLatestStudyNote(payload);
  const result = preparePptxExport(note);
  rememberReport({ type: 'pptx', title: note?.title, noteTitle: note?.title }).catch(() => {});
  return result;
}

async function respondLocalAssistant(text, options) {
  const meta = options || {};
  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { taskId: Date.now(), text: '', isPartial: true }
  }).catch(() => {});
  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: {
      text,
      action: meta.action || 'describe',
      actionSuccess: meta.actionSuccess !== false,
      isPartial: false
    }
  }).catch(() => {});
  chrome.runtime.sendMessage({
    type: 'CHAT_ACTION',
    payload: {
      text,
      action: meta.action || 'describe',
      actionSuccess: meta.actionSuccess !== false
    }
  }).catch(() => {});
  setAnim(meta.actionSuccess === false ? 'error' : 'speaking', meta.tabId);
  await speakText(text.replace(/[#*`\[\]-]/g, '').slice(0, 260), meta.tabId);
  setAnim('idle', meta.tabId);
  return { success: meta.actionSuccess !== false, local: true };
}

// --- 消息路由 ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const { type, payload } = msg;

  switch (type) {
    case 'CTRL_START_REC': {
      interruptCurrentOutput(STATE.activeTabId);
      if (STATE.isRecording || STATE.isProcessing) {
        STATE.isProcessing = false;
      }
      STATE.isRecording = true;
      if (STATE.recordingTimer) clearTimeout(STATE.recordingTimer);
      STATE.recordingTimer = setTimeout(() => {
        if (STATE.isRecording) {
          const tabId = STATE.activeTabId;
          console.warn('[SW] Recording timeout, resetting');
          resetRecordingState();
          pushStatus('idle', statusMsg('recTimeout', STATE.language));
          setAnim('idle', tabId);
        }
      }, 30000);

      (async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || !tab.id) {
            resetRecordingState();
            sendResponse({ ok: false, error: 'NO_TAB' });
            pushStatus('idle', statusMsg('noTab', STATE.language));
            return;
          }
          if (/^(chrome|about|data|javascript):/i.test(tab.url || '')) {
            resetRecordingState();
            sendResponse({ ok: false, error: 'INVALID_TAB' });
            pushStatus('idle', statusMsg('invalidTab', STATE.language));
            return;
          }
          STATE.activeTabId = tab.id;

          // 确保页面加载完成 + content script 已注入
          await waitForTabReady(tab.id);
          await ensureContentScript(tab.id);

          // 按下麦克风时触发 DOM 预收集（与录音并行，不等结果）
          // ASR 完成后 distill 会直接用这份缓存，省去重复 DOM 扫描（~80-150ms）
          chrome.tabs.sendMessage(tab.id, { type: 'DOM_PRECOLLECT' }).catch(() => {});

          let recResult;
          try {
            recResult = await chrome.tabs.sendMessage(tab.id, { type: 'START_REC' });
          } catch (_) {
            resetRecordingState();
            pushStatus('idle', statusMsg('connectFailed', STATE.language));
            setAnim('idle', tab.id);
            sendResponse({ ok: false, error: 'CONNECTION_FAILED' });
            return;
          }
          if (!recResult || !recResult.ok) {
            // NotAllowedError -> try offscreen document as fallback
            if (recResult?.error === 'NotAllowedError') {
              try {
                await ensureOffscreen();
                chrome.runtime.sendMessage({ type: 'START_REC', target: 'offscreen' }).catch(() => {});
                sendResponse({ ok: true });
                return;
              } catch (_) { /* fall through to error */ }
            }
            resetRecordingState();
            const errMsg = recResult?.error === 'NotAllowedError'
              ? statusMsg('micPermission', STATE.language)
              : statusMsg('connectFailed', STATE.language);
            pushStatus('idle', errMsg);
            setAnim('idle', tab.id);
            sendResponse({ ok: false, error: recResult?.error || 'START_REC_FAILED' });
            return;
          }
          sendResponse({ ok: true });
        } catch (e) {
          const tabId = STATE.activeTabId;
          resetRecordingState();
          console.error('[SW] CTRL_START_REC error:', e.message);
          pushStatus('idle', '⚠️ 无法连接页面，请刷新后重试');
          setAnim('idle', tabId);
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }

    case 'CTRL_STOP_REC': {
      const tabId = STATE.activeTabId;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'STOP_REC' }).catch(() => {});
        chrome.runtime.sendMessage({ type: 'STOP_REC', target: 'offscreen' }).catch(() => {});
      } else {
        pushStatus('idle', statusMsg('ready', STATE.language));
      }
      sendResponse({ ok: true });
      break;
    }

    case 'RECORDING_DONE':
      resetRecordingState();
      if (payload.error === 'NO_AUDIO') {
        pushStatus('idle', statusMsg('noAudio', STATE.language));
        setAnim('idle');
      } else if (payload.error) {
        pushStatus('idle', statusMsg('recFailed', STATE.language));
        setAnim('idle');
      } else {
        handleVoiceInput(payload.audio, payload.mimeType).catch(() => {});
      }
      sendResponse({ ack: true });
      break;

    case 'RECOGNITION_FINAL':
      resetRecordingState();
      if (payload.text) {
        // 浏览器 SpeechRecognition 已返回文本，跳过 ASR API
        handleAsrResult(payload.text, sender.tab).catch(() => {});
      } else {
        pushStatus('idle', statusMsg('noAudio', STATE.language));
        setAnim('idle');
      }
      sendResponse({ ack: true });
      break;

    case 'RECORDING_ERROR': {
      resetRecordingState();
      const errMsg = payload.error === 'NotAllowedError'
        ? statusMsg('micPermission', STATE.language)
        : payload.error === 'NotFoundError'
          ? statusMsg('noMic', STATE.language)
          : statusMsg('recError', STATE.language) + ': ' + payload.message;
      console.error('[SW] Recording error:', payload.error, payload.message);
      pushStatus('idle', errMsg);
      setAnim('idle');
      sendResponse({ ack: true });
      break;
    }

    case 'VOICE_INPUT':
      handleVoiceInput(payload.audio, payload.mimeType).then(sendResponse).catch(function(e) {
        sendResponse({ error: e && e.message || 'VOICE_INPUT_FAILED' });
      });
      return true;

    case 'ASR_RESULT':
      var chatHistory = payload.history || [];
      handleAsrResult(payload.transcript, sender.tab, chatHistory, {
        contextScope: payload.contextScope || 'current-page',
        contextGroupKey: payload.contextGroupKey || '',
        contextSourceIds: Array.isArray(payload.contextSourceIds) ? payload.contextSourceIds : [],
        customSourceIds: Array.isArray(payload.customSourceIds) ? payload.customSourceIds : []
      }).then(sendResponse).catch(function(e) {
        sendResponse({ error: e && e.message || 'ASR_RESULT_FAILED' });
      });
      return true;

    case 'PAGE_CHANGED':
      STATE.currentPage = null;
      STATE.domDistillPromise = null;
      if (sender.tab?.url) _distillCache.delete(sender.tab.url);
      sendResponse({ ack: true });
      break;

    case 'OPEN_SIDE_PANEL':
      chrome.sidePanel.open({ windowId: sender.tab?.windowId }).catch(() => {});
      sendResponse({ ack: true });
      break;

    case 'SET_API_KEY':
      _settingsLoaded = false;
      setApiKey(payload.key).then(sendResponse).catch(function(e) {
        sendResponse({ success: false, error: e && e.message || 'SET_KEY_FAILED' });
      });
      return true;

    case 'SET_MODEL':
      _settingsLoaded = false;
      STATE.model = payload.model;
      chrome.storage.local.set({ model: payload.model });
      sendResponse({ success: true });
      break;

    case 'SET_ASR_CONFIG':
      _settingsLoaded = false;
      STATE.asrApiKey = payload.key || '';
      // 如果 endpoint 不是 URL（误填了 Key），自动清空以使用默认值
      var ep = (payload.endpoint || '').trim();
      if (ep && !ep.startsWith('http')) ep = '';
      STATE.asrEndpoint = ep;
      chrome.storage.local.set({ asrApiKey: STATE.asrApiKey, asrEndpoint: STATE.asrEndpoint });
      sendResponse({ success: true, message: statusMsg('asrSaved', STATE.language) });
      break;

    case 'SET_ASR_MODEL':
      _settingsLoaded = false;
      STATE.asrModel = payload.model || 'FunAudioLLM/SenseVoiceSmall';
      chrome.storage.local.set({ asrModel: STATE.asrModel });
      sendResponse({ success: true });
      break;

    case 'SET_LANGUAGE':
      STATE.language = payload.lang;
      chrome.storage.local.set({ language: payload.lang });
      sendResponse({ success: true });
      break;

    case 'GET_STATE':
      ensureSettings().then(function() {
        sendResponse({
          apiKeySet: !!STATE.apiKey,
          model: STATE.model,
          asrApiKeySet: !!STATE.asrApiKey,
          asrEndpoint: STATE.asrEndpoint,
          asrModel: STATE.asrModel,
          language: STATE.language,
          muted: STATE.isMuted,
          currentTask: STATE.currentTask,
          isDemoMode: STATE.isDemoMode || !STATE.apiKey
        });
      }).catch(function() {
        sendResponse({
          apiKeySet: false, asrApiKeySet: false,
          language: STATE.language, muted: STATE.isMuted, currentTask: STATE.currentTask
        });
      });
      return true;

    case 'GET_WORKFLOW_STATE':
      getWorkflowState().then(function(state) {
        const sources = state.noteFolder?.sources || [];
        const notes = state.noteFolder?.notes || [];
        const flows = state.agentFlows || [];
        sendResponse(Object.assign({}, state, {
          status: sources.length || notes.length ? '学习工作流就绪' : '空闲',
          steps: flows.length ? flows : [
            { owner: '资料采集', status: sources.length ? 'done' : 'pending', text: '把页面内容加入资料夹' },
            { owner: '页面理解', status: sources.length ? 'ready' : 'pending', text: '理解当前页面和资料重点' },
            { owner: '学习规划', status: state.taskMemory?.currentLearningTopic ? 'ready' : 'pending', text: '围绕当前学习主题安排路径' },
            { owner: '复习训练', status: notes.length ? 'ready' : 'pending', text: '生成自测题和记忆卡片' },
            { owner: '汇报生成', status: notes.length ? 'ready' : 'pending', text: '准备下载学习笔记和汇报材料' }
          ],
          agentTaskFlows: flows
        }));
      }).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'GET_WORKFLOW_STATE_FAILED' });
      });
      return true;

    case 'ROUTE_INTENT':
    case 'CLASSIFY_INTENT':
      sendResponse({ ok: true, route: routeIntent(payload?.intent || payload?.text || '') });
      break;

    case 'GET_SITE_PROFILE':
      (async () => {
        const tab = await getActiveWorkflowTab();
        const url = payload?.url || tab.url || '';
        const profile = identifySite(url);
        let host = '';
        try { host = new URL(url).hostname; } catch (_) {}
        sendResponse({
          ok: true,
          host,
          url,
          profile,
          title: profile?.name || tab.title || host,
          summary: profile
            ? profile.name + ' · ' + profile.category + ' · ' + profile.guidance
            : '通用网页 · 可进行导航、采集和学习笔记编排'
        });
      })().catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'GET_SITE_PROFILE_FAILED' });
      });
      return true;

    case 'COLLECT_PAGE_SOURCE':
      (async () => {
        const tab = payload?.tabId ? await chrome.tabs.get(payload.tabId) : await getActiveWorkflowTab();
        const result = await collectPageSourceFromTab(tab);
        sendResponse(result);
      })().catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'COLLECT_PAGE_SOURCE_FAILED' });
      });
      return true;

    case 'COLLECT_SELECTION_SOURCE':
      (async () => {
        const tab = payload?.tabId ? await chrome.tabs.get(payload.tabId) : await getActiveWorkflowTab();
        const result = await collectSelectionSourceFromTab(tab);
        sendResponse(result);
      })().catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'COLLECT_SELECTION_SOURCE_FAILED' });
      });
      return true;

    case 'COLLECT_MANUAL_TEXT_SOURCE':
      collectManualTextSource(payload).then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'COLLECT_MANUAL_TEXT_SOURCE_FAILED' });
      });
      return true;

    case 'COLLECT_FILE_SOURCE':
      collectFileSource(payload).then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'COLLECT_FILE_SOURCE_FAILED' });
      });
      return true;

    case 'WEB_SEARCH_RESOURCES':
      webSearchResources(payload).then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'WEB_SEARCH_RESOURCES_FAILED' });
      });
      return true;

    case 'COLLECT_VIEWPORT_SOURCE':
      (async () => {
        const tab = payload?.tabId ? await chrome.tabs.get(payload.tabId) : await getActiveWorkflowTab();
        const result = await collectViewportSourceFromTab(tab);
        sendResponse(result);
      })().catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'COLLECT_VIEWPORT_SOURCE_FAILED' });
      });
      return true;

    case 'GET_MULTISOURCE_CONTEXT':
      (async () => {
        const tab = payload?.tabId ? await chrome.tabs.get(payload.tabId) : await getActiveWorkflowTab();
        const result = await getMultiSourceContextFromTab(tab);
        sendResponse(result);
      })().catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'GET_MULTISOURCE_CONTEXT_FAILED' });
      });
      return true;

    case 'COMPOSE_STUDY_NOTE':
      composeStudyNoteFromFolder(payload).then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'COMPOSE_STUDY_NOTE_FAILED' });
      });
      return true;

    case 'EXPORT_NOTE_MD':
      exportLatestStudyNote(payload).then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'EXPORT_NOTE_MD_FAILED' });
      });
      return true;

    case 'EXPORT_NOTE_WORD':
      exportLatestStudyNoteAsWord(payload).then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'EXPORT_NOTE_WORD_FAILED' });
      });
      return true;

    case 'EXPORT_NOTE_PDF_PAGE':
      exportLatestStudyNoteAsPdfPage(payload).then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'EXPORT_NOTE_PDF_PAGE_FAILED' });
      });
      return true;

    case 'EXPORT_NOTE_ANKI':
      exportLatestStudyNoteAsAnki(payload).then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'EXPORT_NOTE_ANKI_FAILED' });
      });
      return true;

    case 'EXPORT_NOTE_PPTX':
      exportLatestStudyNoteAsPptx(payload).then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'EXPORT_NOTE_PPTX_FAILED' });
      });
      return true;

    case 'DELETE_NOTE_SOURCE':
      deleteNoteSource(payload?.sourceId || payload?.id).then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'DELETE_NOTE_SOURCE_FAILED' });
      });
      return true;

    case 'CLEAR_NOTE_FOLDER':
      clearNoteFolder().then(sendResponse).catch(function(e) {
        sendResponse({ ok: false, error: e && e.message || 'CLEAR_NOTE_FOLDER_FAILED' });
      });
      return true;

    case 'TASK_PROGRESS':
      // 任务进度：从 content script 发出，转发到 side panel 和 widget
      var progText = payload.finished
        ? payload.text
        : '🔍 ' + payload.text + ' (' + payload.step + '/' + payload.total + ')';
      chrome.runtime.sendMessage({
        type: 'TASK_PROGRESS',
        payload: { text: progText, finished: payload.finished }
      }).catch(() => {});
      // 同时推送到 Widget 气泡显示进度
      chrome.tabs.query({ active: true, currentWindow: true }).then(function(tabs) {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'TASK_PROGRESS',
            payload: {
              text: progText,
              finished: payload.finished,
              failed: payload.failed
            }
          }).catch(() => {});
        }
      }).catch(() => {});
      sendResponse({ ack: true });
      break;

    case 'STOP_STREAM':
      interruptCurrentOutput(payload?.tabId);
      sendResponse({ ack: true });
      break;

    case 'STOP_TTS':
      stopAllTts(payload?.tabId);
      sendResponse({ ok: true });
      break;

    case 'SET_MUTED':
      STATE.isMuted = !!payload.muted;
      chrome.storage.local.set({ muted: STATE.isMuted }).catch(() => {});
      if (STATE.isMuted) stopAllTts(payload?.tabId);
      sendResponse({ success: true });
      break;

    case 'SET_DEMO_MODE':
      STATE.isDemoMode = !!payload.enabled;
      chrome.storage.local.set({ demoMode: STATE.isDemoMode }).catch(() => {});
      sendResponse({ success: true, isDemoMode: STATE.isDemoMode });
      break;

    case 'COLLAB_USER_CHOICE':
      if (STATE.currentTask) {
        const completedTask = Object.assign({}, STATE.currentTask, {
          status: 'USER_RESPONDED',
          userChoice: payload.choice || ''
        });
        STATE.currentTask = null;
        sendResponse({ success: true, task: completedTask });
      } else {
        sendResponse({ success: false, error: 'NO_ACTIVE_TASK' });
      }
      break;

    default:
      sendResponse({ error: 'UNKNOWN_TYPE' });
  }
});

// --- 演示模式：离线场景处理（替代真实 LLM/ASR 调用）---
async function demoProcessTranscript(input, tab) {
  STATE.isProcessing = true;
  var _procTimer = setTimeout(function() {
    STATE.isProcessing = false;
  }, 30000);
  setAnim('thinking');

  // 如果 input 是 base64 音频（来自 handleVoiceInput），模拟 ASR
  if (input && input.length > 100 && /^[A-Za-z0-9+\/=]+$/.test(input)) {
    // 模拟 ASR 延迟
    await new Promise(r => setTimeout(r, 800));
    // 随机选择一个场景的转写文本
    var demoText = '演示场景：查找课程成绩';
    return await demoProcessTranscript(demoText, tab);
  }

  var transcript = typeof input === 'string' ? input : '';

  // 推送到侧边栏
  chrome.runtime.sendMessage({
    type: 'CHAT_USER_INPUT',
    payload: { text: transcript }
  }).catch(() => {});

  var scenario = findMatch(transcript);
  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { taskId: Date.now(), text: '', isPartial: true }
  }).catch(() => {});

  if (!scenario) {
    var msg = '🎪 演示模式 - 试试说：查找成绩、提交作业、查看课表、选课、学习助手';
    chrome.runtime.sendMessage({
      type: 'CHAT_STREAM',
      payload: { text: msg, action: 'describe', actionSuccess: true, isPartial: false }
    }).catch(() => {});
    setAnim('speaking');
    await speakText(msg);
    setAnim('idle');
    clearTimeout(_procTimer);
    STATE.isProcessing = false;
    return { success: true, demo: true };
  }

  // 执行演示步骤
  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { text: '🎪 ' + scenario.title + '  （演示模式）', isPartial: true }
  }).catch(() => {});

  setAnim('speaking');
  await speakText(scenario.ttsWelcome);

  for (var i = 0; i < scenario.steps.length; i++) {
    var step = scenario.steps[i];
    switch (step.action) {
      case 'tts':
        chrome.runtime.sendMessage({
          type: 'CHAT_STREAM',
          payload: { text: step.message, isPartial: true }
        }).catch(() => {});
        setAnim('speaking');
        await speakText(step.message);
        setAnim('thinking');
        await new Promise(r => setTimeout(r, 600));
        break;

      case 'highlight':
        chrome.runtime.sendMessage({
          type: 'CHAT_STREAM',
          payload: { text: '🔍 ' + step.ttsMessage, isPartial: true }
        }).catch(() => {});
        setAnim('speaking');
        await speakText(step.ttsMessage);
        setAnim('thinking');
        await new Promise(r => setTimeout(r, 800));
        break;

      case 'click':
        chrome.runtime.sendMessage({
          type: 'CHAT_STREAM',
          payload: { text: '👆 ' + step.ttsMessage, isPartial: true }
        }).catch(() => {});
        setAnim('speaking');
        await speakText(step.ttsMessage);
        setAnim('thinking');
        await new Promise(r => setTimeout(r, 600));
        break;

      case 'input':
        chrome.runtime.sendMessage({
          type: 'CHAT_STREAM',
          payload: { text: '✏️ ' + step.ttsMessage, isPartial: true }
        }).catch(() => {});
        setAnim('speaking');
        await speakText(step.ttsMessage);
        setAnim('thinking');
        await new Promise(r => setTimeout(r, 800));
        break;
    }
  }

  chrome.runtime.sendMessage({
    type: 'CHAT_ACTION',
    payload: { text: '✅ 演示完成', action: 'describe', actionSuccess: true }
  }).catch(() => {});

  var doneMsg = '✅ ' + scenario.title + ' 演示完成！🎪';
  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { text: doneMsg, action: 'describe', actionSuccess: true, isPartial: false }
  }).catch(() => {});

  setAnim('idle');
  clearTimeout(_procTimer);
  STATE.isProcessing = false;
  return { success: true, demo: true, scenario: scenario.id };
}

// --- 通用对话模式：跳过 DOM 蒸馏，直接调 LLM ---
function contextScopeLabel(scope) {
  if (scope === 'current-group') return '当前资料组';
  if (scope === 'custom-sources') return '自选资料';
  if (scope === 'all-sources') return '全部资料';
  return '当前页面';
}

function chatSourceHost(source) {
  if (source?.host) return source.host;
  try { return source?.url ? new URL(source.url).hostname : ''; } catch (_) { return ''; }
}

function chatSourceGroupKey(source) {
  const host = chatSourceHost(source) || 'unknown';
  try {
    if (host.indexOf('github.com') !== -1 && source?.url) {
      const parts = new URL(source.url).pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return 'github:' + (parts[0] + '/' + parts[1]).toLowerCase();
    }
  } catch (_) {}
  if (host.indexOf('gemini.google.com') !== -1) return 'site:gemini.google.com';
  return 'site:' + host;
}

function compactChatSource(source, index) {
  const body = source?.text || source?.selectedText || source?.visibleText || source?.excerpt || source?.description || '';
  return [
    '[' + (index + 1) + '] ' + (source?.title || '未命名资料'),
    '来源：' + (source?.url || source?.host || '未知来源'),
    '类型：' + (source?.type || '资料'),
    '内容摘录：' + String(body || '').replace(/\s+/g, ' ').trim().slice(0, 900)
  ].join('\n');
}

async function buildContextScopePrompt(meta, tab) {
  const scope = meta?.contextScope || 'current-page';
  if (scope === 'current-page') {
    return '当前问答范围：当前页面。你只能围绕当前网页标题、URL、DOM、视口和当前可见内容回答；不要混入资料库里其他页面的历史资料。信息不足时，请明确说明需要先采集当前页面。';
  }
  const state = await getWorkflowState().catch(() => null);
  const sources = Array.isArray(state?.noteFolder?.sources) ? state.noteFolder.sources : [];
  let selected = [];
  if (scope === 'all-sources') {
    selected = sources;
  } else if (scope === 'custom-sources') {
    const ids = (Array.isArray(meta?.contextSourceIds) && meta.contextSourceIds.length) ? meta.contextSourceIds : (Array.isArray(meta?.customSourceIds) ? meta.customSourceIds : []);
    selected = sources.filter(source => ids.includes(source.id || source.sourceId));
  } else if (scope === 'current-group') {
    const groupKey = meta?.contextGroupKey || '';
    const ids = Array.isArray(meta?.contextSourceIds) ? meta.contextSourceIds : [];
    selected = ids.length
      ? sources.filter(source => ids.includes(source.id || source.sourceId))
      : sources.filter(source => chatSourceGroupKey(source) === groupKey);
  }
  selected = selected.slice(0, scope === 'all-sources' ? 10 : 8);
  const scopeLine = '当前问答范围：' + contextScopeLabel(scope) + '。你只能使用下方允许资料和当前用户问题回答；禁止混入未选择资料或无关历史资料。';
  if (!selected.length) return scopeLine + '\n当前范围没有可用资料。请提示用户先采集资料或重新选择问答范围。';
  const evidence = selected.map(compactChatSource).join('\n\n');
  return scopeLine + '\n允许使用的资料如下：\n' + evidence + '\n\n如果用户只是寒暄，也要自然回应并主动提到当前正在处理这些资料，不要重新做通用自我介绍。回答末尾用一行“依据：...”简短列出实际使用的资料标题；如果完全没有使用资料，则不要写“依据：无”。';
}

async function processChat(transcript, tab, chatHistory, meta) {
  const route = routeIntent(transcript);
  if (route.pageAware && tab?.id && (!meta?.contextScope || meta.contextScope === 'current-page')) {
    return await processPageAwareChat(transcript, tab, chatHistory, route, meta);
  }

  const siteProfile = identifySite(tab?.url || '');
  const ethicsRisk = checkEthicsRisk(transcript, pageTextForEthics(tab, null));
  if (ethicsRisk.level === 'red') {
    return await respondLocalAssistant(ethicsRisk.speech, { actionSuccess: false, tabId: tab?.id });
  }

  const learningPlan = buildLearningPlan(transcript, siteProfile);
  if (learningPlan && (!meta?.contextScope || meta.contextScope === 'current-page')) {
    if (shouldStartCollab(transcript)) {
      STATE.currentTask = createCollabTask(transcript, siteProfile, learningPlan);
      return await respondLocalAssistant(STATE.currentTask.speech, { tabId: tab?.id });
    }
    const warning = ethicsRisk.level === 'yellow' ? ethicsRisk.speech + '\n\n' : '';
    return await respondLocalAssistant(warning + learningPlan.speech, { tabId: tab?.id });
  }

  if (!STATE.apiKey) {
    // 没有 API Key 时的兜底回复
    var noKeyMsg = STATE.language === 'zh'
      ? '请在设置中填入 DeepSeek API Key 后开始使用。你也可以试试说「查找成绩」「提交作业」等导航指令。'
      : 'Please configure your DeepSeek API Key in settings. You can also try navigation commands like "find grades" or "submit homework".';
    chrome.runtime.sendMessage({
      type: 'CHAT_STREAM',
      payload: { text: noKeyMsg, action: 'describe', actionSuccess: true, isPartial: false }
    }).catch(() => {});
    setAnim('speaking');
    await speakText(noKeyMsg);
    setAnim('idle');
    return { success: true, chat: true };
  }

  // 通知流式开始
  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { taskId: Date.now(), text: '', isPartial: true }
  }).catch(() => {});

  var prompt = STATE.language === 'zh'
    ? '你是「智引AI导航导师」，一个智能导航助手。\n\n你的角色：\n1. 帮助用户在各种平台（GitHub、学习通、智慧树、Canvas、Moodle、各类管理系统等）上快速找到功能入口和操作页面\n2. 回答关于如何使用这些平台的问题\n3. 也会进行一般性对话，但核心定位是「平台功能导航专家」\n\n自我介绍要点（第一次打招呼时使用）：\n- 我叫「智引」，是你的 AI 导航导师\n- 我可以帮你在各种平台上找到任何功能——GitHub 上的仓库、Issues、PR，学习平台的成绩、课表、作业，管理系统的各种入口\n- 按住麦克风说话或输入文字，告诉我你想去哪个页面或找什么功能\n\n回复要求：\n- 简洁自然，每次不超过 300 字\n- 第一次对话时做完整的自我介绍\n- 对于非导航类问题可以正常回答，但会顺便提一句可以帮你导航各种平台的功能'
    : 'You are "Zhiyin AI Navigation Tutor", an intelligent navigation assistant.\n\nYour role:\n1. Help users find features and pages on various platforms (GitHub, learning management systems, Canvas, Moodle, admin systems, etc.)\n2. Answer questions about how to use these platforms\n3. Also handle general conversation, but your core identity is a "Platform Navigation Expert"\n\nSelf-introduction (use on first greeting):\n- My name is "Zhiyin", your AI Navigation Tutor\n- I can help you find any feature on any platform — repositories, issues, PRs on GitHub; grades, schedules, homework on learning platforms; various entries in management systems\n- Hold the microphone or type to tell me where you want to go\n\nResponse rules:\n- Concise and natural, max 300 characters\n- Do a full self-introduction on first conversation\n- For non-navigation questions, answer normally but mention I can help navigate platform features';

  var fullResponse = '';
  try {
    var ethicsPrompt = buildEthicsPrompt(ethicsRisk);
    var sitePrompt = buildSitePrompt(siteProfile);
    var systemPrompt = STATE.language === 'zh'
      ? '你是「智引AI导航导师」，你的身份是用户的AI学习伙伴和平台导航专家。\n\n你的核心能力：\n1. 平台导航：帮用户在各种平台（GitHub、学习通、智慧树、Canvas等）上快速找到功能入口、操作页面\n2. 知识科普：用通俗易懂的方式解释概念、原理、技术知识\n3. 辅助学习：帮助理解课程内容、解答学习问题、提供学习建议\n\n回复要求：\n- 如果当前问答范围提供了资料，优先承接资料任务，不要回到通用自我介绍\n- 只有在没有资料上下文且用户明确第一次问候时，才做简短自我介绍\n- 简洁自然，每次不超过300字'
      : 'You are "Zhiyin AI Navigation Tutor", an AI learning companion and platform navigation expert.\n\nYour core abilities:\n1. Platform Navigation: Help users find features and pages on various platforms (GitHub, Canvas, learning management systems, etc.)\n2. Knowledge Sharing: Explain concepts, principles, and technical knowledge in an accessible way\n3. Learning Assistance: Help understand course content, answer study questions, provide learning advice\n\nSelf-introduction (use on first greeting):\n- Who you are: "Zhiyin", an AI navigation tutor and learning companion\n- What you can do: Navigate any platform to find features, explain knowledge, assist with learning\n- How to use: Hold the mic or type text, tell me if you want navigation or learning\n\nResponse rules:\n- Full self-introduction on first greeting (mention both navigation AND learning)\n- Concise and natural, max 300 characters';
    const contextScopePrompt = await buildContextScopePrompt(meta, tab);
    systemPrompt += '\n\n' + [contextScopePrompt, ethicsPrompt, sitePrompt].filter(Boolean).join('\n\n');

    var chatMessages = [
      { role: 'system', content: systemPrompt }
    ];
    for (var hi = 0; hi < (chatHistory || []).length; hi++) {
      chatMessages.push(chatHistory[hi]);
    }
    chatMessages.push({ role: 'user', content: transcript });

    var model = MODELS[STATE.model] || MODELS.chat;
    STATE.streamAbortController = new AbortController();
    var timeout = setTimeout(function() {
      if (STATE.streamAbortController) STATE.streamAbortController.abort();
    }, 25000);

    var res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + STATE.apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: chatMessages,
        temperature: 0.7,
        max_tokens: 500,
        stream: true
      }),
      signal: STATE.streamAbortController.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn('[智引] Chat API error:', res.status);
      throw new Error('API_HTTP_' + res.status);
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (var line of lines) {
        line = line.trim();
        if (!line || !line.startsWith('data: ')) continue;
        var data = line.slice(6);
        if (data === '[DONE]') break;
        try {
          var parsed = JSON.parse(data);
          var content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            chrome.runtime.sendMessage({
              type: 'CHAT_STREAM',
              payload: { text: fullResponse, isPartial: true }
            }).catch(function() {});
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    if (e.name === 'AbortError' && !STATE.streamAbortController) {
      return { success: true, cancelled: true };
    }
    console.warn('[智引] Chat stream failed (' + e.message + '), fallback...');
    if (!fullResponse) {
      fullResponse = STATE.language === 'zh'
        ? '抱歉，暂时无法回复。你可以试试说「查找成绩」「提交作业」等导航指令。'
        : 'Sorry, I cannot reply right now. Try navigation commands like "find grades" or "submit homework".';
    }
  } finally {
    clearTimeout(timeout);
    STATE.streamAbortController = null;
  }

  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { text: fullResponse, action: 'describe', actionSuccess: true, isPartial: false }
  }).catch(() => {});
  chrome.runtime.sendMessage({
    type: 'CHAT_ACTION',
    payload: { text: fullResponse, action: 'describe', actionSuccess: true }
  }).catch(() => {});

  setAnim('speaking');
  await speakText(fullResponse);
  setAnim('idle');
  return { success: true, chat: true, response: fullResponse };
}

async function processPageAwareChat(transcript, tab, chatHistory, route, meta) {
  const context = await getMultiSourceContextFromTab(tab);
  const ethicsRisk = checkEthicsRisk(transcript, [
    context.summary,
    context.domSource?.text,
    context.selection?.selectedText,
    context.viewport?.visibleText
  ].filter(Boolean).join('\n'));
  if (ethicsRisk.level === 'red') {
    return await respondLocalAssistant(ethicsRisk.speech, { actionSuccess: false, tabId: tab?.id });
  }

  if (!STATE.apiKey) {
    const fallback = buildLocalPageAwareAnswer(transcript, context, route);
    return await respondLocalAssistant(fallback, { tabId: tab?.id });
  }

  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { taskId: Date.now(), text: '', isPartial: true }
  }).catch(() => {});

  const contextScopePrompt = await buildContextScopePrompt(meta, tab);
  const systemPrompt = buildPageAwarePrompt(transcript, context, route) + '\n\n' + contextScopePrompt + '\n\n' + buildEthicsPrompt(ethicsRisk);
  const chatMessages = [{ role: 'system', content: systemPrompt }];
  for (var hi = 0; hi < (chatHistory || []).length; hi++) chatMessages.push(chatHistory[hi]);
  chatMessages.push({ role: 'user', content: transcript });

  let fullResponse = '';
  try {
    const model = MODELS[STATE.model] || MODELS.chat;
    STATE.streamAbortController = new AbortController();
    const timeout = setTimeout(function() {
      if (STATE.streamAbortController) STATE.streamAbortController.abort();
    }, 25000);
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + STATE.apiKey },
      body: JSON.stringify({ model, messages: chatMessages, temperature: 0.25, max_tokens: 700, stream: true }),
      signal: STATE.streamAbortController.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('API_HTTP_' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (let line of lines) {
        line = line.trim();
        if (!line || !line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            chrome.runtime.sendMessage({ type: 'CHAT_STREAM', payload: { text: fullResponse, isPartial: true } }).catch(() => {});
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    if (e.name === 'AbortError' && !STATE.streamAbortController) return { success: true, cancelled: true };
    console.warn('[智引] Page-aware chat failed:', e.message);
    if (!fullResponse) fullResponse = buildLocalPageAwareAnswer(transcript, context, route);
  } finally {
    STATE.streamAbortController = null;
  }

  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { text: fullResponse, action: 'describe', actionSuccess: true, isPartial: false }
  }).catch(() => {});
  chrome.runtime.sendMessage({
    type: 'CHAT_ACTION',
    payload: { text: fullResponse, action: 'describe', actionSuccess: true }
  }).catch(() => {});
  setAnim('speaking', tab?.id);
  await speakText(fullResponse, tab?.id);
  setAnim('idle', tab?.id);
  return { success: true, pageAware: true, response: fullResponse };
}

function buildLocalPageAwareAnswer(transcript, context, route) {
  const title = context?.title || '当前页面';
  const host = context?.host || '';
  const summary = String(context?.summary || context?.domSource?.excerpt || context?.viewport?.visibleText || '').replace(/\s+/g, ' ').trim();
  if (route?.type === 'learning_plan') {
    return '我会基于当前页面“' + title + '”来规划学习。建议先理解页面主题和目录结构，再提取 3-5 个关键词，接着选一个最小任务实践，最后把学习结果整理成笔记和自测题。可优先使用当前页面、B 站、中国大学 MOOC 和 GitHub 作为配套资源。';
  }
  if (route?.type === 'page_entries') {
    return '当前页面“' + title + '”' + (host ? '（' + host + '）' : '') + '的主要入口可从顶部导航、页面主体内容、资料列表和操作按钮入手。' + (summary ? '我读到的可见内容包括：' + summary.slice(0, 180) : '当前可见内容较少，可先采集页面后再细化。');
  }
  return '当前页面是“' + title + '”' + (host ? '（' + host + '）' : '') + '。' + (summary ? '主要内容可以概括为：' + summary.slice(0, 260) : '当前页面可见内容较少，我先基于已读取内容回答。');
}

const DANGEROUS_EXEC_RE = /删除|移除|清空|提交|支付|购买|下单|发布|确认|同意|授权|发送|转账|delete|remove|clear|submit|pay|buy|purchase|order|publish|confirm|agree|authorize|send|transfer/i;

function instructionNeedsUserConfirm(transcript, instruction) {
  const action = String(instruction?.action || '').toLowerCase();
  const text = [
    transcript,
    instruction?.target,
    instruction?.fallbackText,
    instruction?.speech,
    Array.isArray(instruction?.tasks) ? instruction.tasks.map(task => [task?.action, task?.target, task?.fallbackText, task?.text].filter(Boolean).join(' ')).join(' ') : ''
  ].filter(Boolean).join(' ');
  if (DANGEROUS_EXEC_RE.test(text)) return true;
  if (['click', 'input'].includes(action) && routeIntent(transcript).safety?.requiresUserConfirm) return true;
  if (Array.isArray(instruction?.tasks)) {
    return instruction.tasks.some(task => {
      const taskAction = String(task?.action || '').toLowerCase();
      const taskText = [task?.target, task?.fallbackText, task?.text, task?.value].filter(Boolean).join(' ');
      return ['click', 'input'].includes(taskAction) && DANGEROUS_EXEC_RE.test(taskText);
    });
  }
  return false;
}

// --- 共享：转录文本处理管道（handleVoiceInput 和 handleAsrResult 共用）---
// 负责: 语种检测 → DOM 蒸馏（带缓存）→ LLM 推理 → 执行 → TTS
// 整体超时 60s，防止 isProcessing 因 TTS 等卡死
const PROCESS_TIMEOUT_MS = 60000;

async function processTranscript(transcript, tab, chatHistory, meta) {
  STATE.isProcessing = true;
  var _procTimer = setTimeout(function() {
    STATE.isProcessing = false;
    console.warn('[智引] Process timeout, isProcessing reset');
  }, PROCESS_TIMEOUT_MS);
  setAnim('thinking');

  // 立即显示处理中提示，降低感知延迟
  var ackMsg = '🔄 ' + transcript.slice(0, 20) + (transcript.length > 20 ? '...' : '');
  pushStatus('thinking', ackMsg);

  // 推送用户输入到侧边栏对话
  chrome.runtime.sendMessage({
    type: 'CHAT_USER_INPUT',
    payload: { text: transcript }
  }).catch(() => {});

  try {
    if (!tab) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
    }
    if (!tab) throw new Error('NO_TAB');
    STATE.language = detectLanguage(transcript);
    const siteProfile = identifySite(tab.url);
    const routed = routeIntent(transcript);
    const earlyRisk = checkEthicsRisk(transcript, pageTextForEthics(tab, null));
    if (earlyRisk.level === 'red') {
      return await respondLocalAssistant(earlyRisk.speech, { actionSuccess: false, tabId: tab.id });
    }

    const earlyLearningPlan = buildLearningPlan(transcript, siteProfile);
    if (earlyLearningPlan && !routed.pageAware && !/(点击|打开|进入|高亮|找到|导航|where|find|open|click)/i.test(transcript)) {
      if (shouldStartCollab(transcript)) {
        STATE.currentTask = createCollabTask(transcript, siteProfile, earlyLearningPlan);
        return await respondLocalAssistant(STATE.currentTask.speech, { tabId: tab.id });
      }
      const warning = earlyRisk.level === 'yellow' ? earlyRisk.speech + '\n\n' : '';
      return await respondLocalAssistant(warning + earlyLearningPlan.speech, { tabId: tab.id });
    }

    // 检测用户意图 → 导航/内容分析/普通对话
    var navKeywords = ['找到','导航','去','打开','点击','查找','搜索','去哪儿','怎么找','在哪儿','如何','操作',
      'find','navigate','open','click','search','where','locate','how','goto','show','take me'];
    var contentKeywords = ['总结','内容','讲了','说什么','信息','数据','表格','列表','介绍','概述','摘要','有什么',
      'summarize','summary','content','what is on','tell me about','overview'];
    var isNav = navKeywords.some(function(kw) { return transcript.toLowerCase().includes(kw); });
    var isContent = contentKeywords.some(function(kw) { return transcript.toLowerCase().includes(kw); });
    var hasPagePattern = /页面|页面上|这个页面|当前页面|这里|这个|当前|这上面|这页|屏幕|这/i.test(transcript);

    if (routed.pageAware || (isContent && hasPagePattern)) {
      // 页面内容理解模式 → 走对话模式分析页面内容
      return await processChat(transcript, tab, chatHistory, meta);
    }

    if (!isNav && !hasPagePattern) {
      // 普通对话模式
      return await processChat(transcript, tab, chatHistory, meta);
    }

    // 导航模式：现有流程（DOM蒸馏 + LLM导航推理 + 执行）
    const cached = _distillCache.get(tab.url);
    if (cached && Date.now() - cached.time < DISTILL_CACHE_TTL) {
      STATE.currentPage = cached.result;
      return await processIntent(transcript, cached.result, tab);
    }
    // 确保 Tab 页面加载完成 + content script 已注入
    await waitForTabReady(tab.id);
    await ensureContentScript(tab.id);
    let domResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'DOM_DISTILL',
      payload: { intent: transcript }
    }).catch(() => null);
    // DOM 蒸馏失败时重试一次（含重新注入）
    if (!domResult || domResult.error) {
      console.warn('[SW] DOM_DISTILL failed, retrying with re-inject...');
      await ensureContentScript(tab.id);
      domResult = await chrome.tabs.sendMessage(tab.id, {
        type: 'DOM_DISTILL',
        payload: { intent: transcript }
      }).catch(() => null);
    }
    if (!domResult || domResult.error) throw new Error('DOM_DISTILL_FAILED');
    const risk = checkEthicsRisk(transcript, pageTextForEthics(tab, domResult));
    if (risk.level === 'red') {
      return await respondLocalAssistant(risk.speech, { actionSuccess: false, tabId: tab.id });
    }
    const ethicsPrompt = buildEthicsPrompt(risk);
    if (siteProfile) {
      domResult.siteProfile = siteProfile;
      domResult.prompt = buildSitePrompt(siteProfile) + '\n\n' + domResult.prompt;
    }
    if (ethicsPrompt) domResult.prompt = ethicsPrompt + '\n\n' + domResult.prompt;
    _distillCache.set(tab.url, { result: domResult, time: Date.now() });
    // 持久化 DOM 缓存到 storage.session，SW 重启后可恢复
    chrome.storage.session.set({ distillCache:
      Array.from(_distillCache.entries()).map(([k, v]) => [k, { result: v.result, time: v.time }])
    }).catch(() => {});
    STATE.currentPage = domResult;
    return await processIntent(transcript, domResult, tab);

  } catch (e) {
    console.error('[智引] processTranscript error:', e.message);
    setAnim('idle');

    const msgs = {
      'NO_TAB':               statusMsg('noTab', STATE.language),
      'DOM_DISTILL_FAILED':   statusMsg('domFailed', STATE.language),
      'API_EMPTY_RESPONSE':   statusMsg('apiEmpty', STATE.language),
      'API_JSON_ERROR':       statusMsg('apiJsonError', STATE.language),
      'API_TIMEOUT':          statusMsg('apiTimeout', STATE.language),
      'API_RATE_LIMIT':       statusMsg('apiRateLimit', STATE.language),
      'API_AUTH_ERROR':       statusMsg('apiAuthError', STATE.language),
      'API_KEY_MISSING':      statusMsg('apiKeyMissing', STATE.language),
      'API_QUOTA_EXCEEDED':   statusMsg('apiQuotaExceeded', STATE.language),
      'API_SERVER_ERROR':     statusMsg('apiServerError', STATE.language)
    };
    // content script 连接错误统一映射
    var eMsg = e.message;
    // API_HTTP_* 归一化（inferStream 和 infer 可能返回不同前缀）
    if (eMsg && eMsg.startsWith('API_HTTP_')) {
      var code = parseInt(eMsg.slice(9), 10);
      if (code === 429) eMsg = 'API_RATE_LIMIT';
      else if (code === 401) eMsg = 'API_AUTH_ERROR';
      else if (code === 402) eMsg = 'API_QUOTA_EXCEEDED';
      else if (code >= 500) eMsg = 'API_SERVER_ERROR';
      else eMsg = 'API_SERVER_ERROR';
    }
    const errKey = eMsg && (eMsg.includes('Receiving end') || eMsg.includes('Could not establish'))
      ? 'DOM_DISTILL_FAILED' : eMsg;
    const msg = msgs[errKey] || statusMsg('genericError', STATE.language);
    // DEBUG: 记录未映射的错误码
    if (!msgs[errKey]) console.error('[智引] UNMAPPED ERROR in processTranscript:', errKey);
    await speakText(msg);

    // 错误推送到 widget 气泡
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_SPEECH',
        payload: { text: msg }
      }).catch(() => {});
    }

    // 先发 start 信号，确保 ChatView.finishStreaming() 有 _streamingMsgId
    chrome.runtime.sendMessage({
      type: 'CHAT_STREAM',
      payload: { text: '', isPartial: true }
    }).catch(() => {});
    chrome.runtime.sendMessage({
      type: 'CHAT_STREAM',
      payload: { text: msg, action: 'describe', actionSuccess: false, isPartial: false }
    }).catch(() => {});

    return { error: e.message, speech: msg };

  } finally {
    clearTimeout(_procTimer);
    STATE.isProcessing = false;
  }
}

// --- 语音输入：ASR → processTranscript ---
async function handleVoiceInput(audioBase64, mimeType) {
  if (STATE.isProcessing) return { error: 'BUSY' };

  if (!_settingsLoaded) { await ensureSettings(); _settingsLoaded = true; }

  // 演示模式：跳过 ASR 和 API Key 检查
  if (STATE.isDemoMode) {
    setAnim('thinking');
    pushStatus('thinking', '🎪 演示模式');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { error: 'NO_TAB' };
    return await demoProcessTranscript(audioBase64, tab);
  }

  if (!STATE.asrApiKey) {
    setAnim('idle');
    pushStatus('idle', statusMsg('noAsrKey', STATE.language));
    await speakText(statusMsg('configAsrKey', STATE.language));
    return { error: 'NO_ASR_KEY' };
  }
  if (!STATE.apiKey) {
    setAnim('idle');
    pushStatus('idle', statusMsg('noApiKey', STATE.language));
    await speakText(statusMsg('configApiKey', STATE.language));
    return { error: 'NO_API_KEY' };
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('NO_TAB');

    // ASR 语音识别（先尝试 SW 直连）
    let asrResult;
    try {
      asrResult = await withRetry(() => transcribe(audioBase64, mimeType, STATE.asrApiKey, STATE.asrEndpoint, STATE.asrModel));
    } catch (swErr) {
      // SW 直连失败（代理问题），从侧边栏页面重试
      console.warn('[SW] ASR from SW failed, retry via side panel:', swErr.message);
      try {
        asrResult = await new Promise(function(resolve, reject) {
          chrome.runtime.sendMessage({
            type: 'TRANSCRIBE_AUDIO',
            payload: { audio: audioBase64, mimeType: mimeType, apiKey: STATE.asrApiKey, endpoint: STATE.asrEndpoint, model: STATE.asrModel }
          }, function(response) {
            if (response && response.text) resolve(response);
            else reject(new Error((response && response.error) || 'ASR_NETWORK'));
          });
        });
      } catch (spErr) {
        console.warn('[SW] Side panel ASR also failed:', spErr.message);
        throw swErr;
      }
    }

    const transcript = asrResult.text?.trim();
    if (!transcript) throw new Error('ASR_EMPTY');

    return await processTranscript(transcript, tab);

  } catch (e) {
    console.error('[智引] Voice error:', e.message);
    setAnim('idle');

    // API_HTTP_* 归一化
    var eMsg = e.message || '';
    if (eMsg.startsWith('ASR_HTTP_') || eMsg.startsWith('API_HTTP_')) {
      var code = parseInt(eMsg.split('_').pop(), 10);
      if (code === 429 || code === 402) eMsg = 'ASR_TIMEOUT';
      else if (code === 401 || code === 403) eMsg = 'ASR_AUTH_ERROR';
      else if (code === 400) eMsg = 'ASR_MODEL_ERROR';
      else if (code >= 500) eMsg = 'ASR_NETWORK';
    }
    // ASR_RATE_LIMIT 映射到 ASR_TIMEOUT
    if (eMsg === 'ASR_RATE_LIMIT') eMsg = 'ASR_TIMEOUT';

    const msgs = {
      'ASR_KEY_MISSING':  statusMsg('asrKeyMissing', STATE.language),
      'ASR_AUTH_ERROR':   statusMsg('asrAuthError', STATE.language),
      'ASR_TIMEOUT':      statusMsg('asrTimeout', STATE.language),
      'ASR_NETWORK':      statusMsg('asrNetwork', STATE.language),
      'ASR_EMPTY':        statusMsg('asrEmpty', STATE.language),
      'ASR_NO_AUDIO':     statusMsg('asrNoAudio', STATE.language),
      'ASR_MODEL_ERROR':  'ASR 模型不可用，请在设置中切换为 FunAudioLLM/SenseVoiceSmall',
      'NO_TAB':           statusMsg('noTab', STATE.language)
    };
    const msg = msgs[eMsg] || statusMsg('genericError', STATE.language);
    await speakText(msg);
    return { error: e.message, message: msg };
  }
}

// --- 文字输入 → processTranscript ---
async function handleAsrResult(transcript, tab, history, meta) {
  if (STATE.isProcessing) return { error: 'BUSY' };

  if (!_settingsLoaded) { await ensureSettings(); _settingsLoaded = true; }

  // 演示模式：跳过 API Key 检查
  if (STATE.isDemoMode) {
    setAnim('thinking');
    pushStatus('thinking', '🎪 演示模式');
    return await demoProcessTranscript(transcript, tab);
  }

  if (!STATE.apiKey) {
    setAnim('idle');
    pushStatus('idle', statusMsg('noApiKey', STATE.language));
    await speakText(statusMsg('configApiKey', STATE.language));
    return { error: 'NO_API_KEY' };
  }

  return await processTranscript(transcript, tab, history, meta || {});
}

// --- 共享: LLM 推理 → 执行 → TTS（流式版） ---
async function processIntent(transcript, domResult, tab) {
  const prompt = domResult.prompt.replace(
    /(## 用户意图\n)[\s\S]*?(\n请返回导航指令 JSON。)/,
    (_, p1, p2) => `${p1}${transcript}${p2}`
  );

  // 通知侧边栏开始流式输出
  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { taskId: Date.now(), text: '', isPartial: true }
  }).catch(() => {});

  // 1. 流式 LLM 推理：边收边推送，文本先到
  let fullResponse = '';
  let currentSpeech = '';
  let instruction;
  let streamCancelled = false;

  // 创建可取消的 AbortController
  STATE.streamAbortController = new AbortController();
  const streamSignal = STATE.streamAbortController.signal;

  try {
    const stream = inferStream(prompt, transcript, STATE.apiKey, STATE.model, streamSignal);

    for await (const token of stream) {
      if (token && typeof token === 'string' && token.includes('"cancelled"')) {
        streamCancelled = true;
        break;
      }
      fullResponse += token;

      // 尝试从部分 JSON 中提取 speech 字段 → 推送到侧边栏
      var speechMatch = fullResponse.match(/"speech"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (speechMatch && speechMatch[1] !== currentSpeech) {
        currentSpeech = speechMatch[1];
        chrome.runtime.sendMessage({
          type: 'CHAT_STREAM',
          payload: { text: currentSpeech, isPartial: true }
        }).catch(() => {});
        // 同时推送到 widget 气泡实时更新
        chrome.tabs.sendMessage(tab.id, {
          type: 'SPEECH_STREAM',
          payload: { text: currentSpeech }
        }).catch(() => {});
      }
    }

    // 流结束，清理 AbortController
    STATE.streamAbortController = null;

    // 用户取消生成
    if (streamCancelled) {
      var cancelMsg = STATE.language === 'zh' ? '⏹️ 已取消' : '⏹️ Cancelled';
      chrome.runtime.sendMessage({
        type: 'CHAT_STREAM',
        payload: { text: cancelMsg, action: 'describe', actionSuccess: false, isPartial: false }
      }).catch(() => {});
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_SPEECH',
        payload: { text: cancelMsg }
      }).catch(() => {});
      setAnim('idle', tab.id);
      STATE.isProcessing = false;
      return { success: true, cancelled: true };
    }

    // 2. 流结束 → 解析完整 JSON
    var jsonStr = fullResponse;
    var jsonMatch = fullResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    else {
      jsonMatch = fullResponse.match(/(\{[\s\S]*\})/);
      if (jsonMatch) jsonStr = jsonMatch[1];
    }
    try {
      instruction = JSON.parse(jsonStr.trim());
      // inferStream 的 error 字段（API_HTTP_401 等）转 throw，走正常错误处理
      if (instruction && instruction.error) throw new Error(instruction.error);
    } catch (_) {
      // 截断恢复
      var recovered = recoverPartialJson(fullResponse);
      if (recovered && (recovered.target || recovered.speech)) {
        console.warn('[SW] Partial JSON recovered from streamed response');
        instruction = recovered;
      } else {
        throw new Error('API_JSON_ERROR');
      }
    }
  } catch (e) {
    // 流式失败 → 回退到原有 infer / inferMinimal
    STATE.streamAbortController = null;
    console.warn('[SW] Stream LLM failed (' + e.message + '), falling back to infer');
    try {
      instruction = await withRetry(() => infer(prompt, transcript, STATE.apiKey, STATE.model));
    } catch (e2) {
      if (e2.message !== 'API_EMPTY_RESPONSE') throw e2;
      console.warn('[SW] API_EMPTY_RESPONSE, retrying with minimal prompt...');
      var regionSummary = domResult.regions.map(function(r) { return r.summary; }).join('\n');
      instruction = await inferMinimal(regionSummary, transcript, STATE.apiKey, STATE.model, domResult.pageContext);
    }
  }

  // 3. 推送最终文本到侧边栏（不含 action 状态，等执行后更新）
  var finalText = instruction.speech || currentSpeech ||
    (STATE.language === 'zh' ? '好的，已处理' : 'Done');
  chrome.runtime.sendMessage({
    type: 'CHAT_STREAM',
    payload: { text: finalText, isPartial: false }
  }).catch(() => {});
  // 同时推送到页面 Widget 显示（如果侧边栏没打开，用户也能看到回复）
  chrome.tabs.sendMessage(tab.id, {
    type: 'SHOW_SPEECH',
    payload: { text: finalText }
  }).catch(() => {});

  // 4. 执行导航操作（所有 sendMessage 加 catch 防零崩溃）
  let execResult;
  if (instructionNeedsUserConfirm(transcript, instruction)) {
    const guardText = STATE.language === 'zh'
      ? '这个操作可能涉及提交、删除、支付、授权或发送等高风险动作，我只帮你定位和说明，请你在页面上自行确认。'
      : 'This may involve a high-risk action such as submit, delete, payment, authorization, or send. I will only guide you; please confirm on the page yourself.';
    chrome.runtime.sendMessage({
      type: 'CHAT_ACTION',
      payload: { text: guardText, action: 'describe', actionSuccess: false, actionDetail: 'requires_user_confirm' }
    }).catch(() => {});
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_SPEECH',
      payload: { text: guardText }
    }).catch(() => {});
    setAnim('speaking', tab.id);
    await speakText(guardText, tab.id);
    setAnim('idle', tab.id);
    return { success: true, blocked: true, reason: 'REQUIRES_USER_CONFIRM', instruction };
  }
  if (instruction.tasks && instruction.tasks.length > 0) {
    execResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'EXEC_TASK_QUEUE',
      payload: { tasks: instruction.tasks }
    }).catch(() => ({ success: false, state: 'failed' }));
  } else if (instruction.action === 'highlight') {
    execResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'EXEC_HIGHLIGHT',
      payload: { selector: instruction.target, fallbackText: instruction.fallbackText }
    }).catch(() => ({ success: false }));
    if (instruction.verifyText && execResult?.success) {
      const verifyResult = await chrome.tabs.sendMessage(tab.id, {
        type: 'EXEC_VERIFY_HIGHLIGHT',
        payload: { verifyText: instruction.verifyText }
      }).catch(() => ({ success: false, verified: false }));
      execResult = Object.assign({}, execResult, {
        verified: verifyResult?.verified !== false,
        reHighlighted: !!verifyResult?.reHighlighted,
        verifyText: instruction.verifyText,
        verifyFailed: verifyResult?.success === false
      });
    }
  } else if (instruction.action === 'click') {
    execResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'EXEC_CLICK',
      payload: { selector: instruction.target, fallbackText: instruction.fallbackText }
    }).catch(() => ({ success: false }));
    if (instruction.verifyText && execResult?.success) {
      const verifyResult = await chrome.tabs.sendMessage(tab.id, {
        type: 'EXEC_VERIFY_HIGHLIGHT',
        payload: { verifyText: instruction.verifyText }
      }).catch(() => ({ success: false, verified: false }));
      execResult = Object.assign({}, execResult, {
        verified: verifyResult?.verified !== false,
        reHighlighted: !!verifyResult?.reHighlighted,
        verifyText: instruction.verifyText,
        verifyFailed: verifyResult?.success === false
      });
    }
  } else if (instruction.action === 'input') {
    execResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'EXEC_INPUT',
      payload: { selector: instruction.target, fallbackText: instruction.fallbackText, value: instruction.value }
    }).catch(() => ({ success: false }));
  } else if (instruction.action === 'scroll') {
    execResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'EXEC_SCROLL',
      payload: { selector: instruction.target, fallbackText: instruction.fallbackText }
    }).catch(() => ({ success: false }));
  } else if (instruction.action === 'describe') {
    execResult = { success: true };
  } else {
    if (instruction.target) {
      execResult = await chrome.tabs.sendMessage(tab.id, {
        type: 'EXEC_HIGHLIGHT',
        payload: { selector: instruction.target, fallbackText: instruction.fallbackText }
      }).catch(() => ({ success: false }));
    } else {
      execResult = { success: true };
    }
  }

  // 5. 更新最终执行结果
  chrome.runtime.sendMessage({
    type: 'CHAT_ACTION',
    payload: {
      text: finalText,
      action: instruction.action,
      actionSuccess: execResult?.success !== false && execResult?.verifyFailed !== true,
      actionDetail: execResult?.level === 'verbal' ? execResult.guidance : (execResult?.reHighlighted ? '已重新定位到更匹配的位置' : null)
    }
  }).catch(() => {});

  setAnim('speaking', tab.id);
  await speakText(finalText, tab.id);

  if (execResult && 'results' in execResult && Array.isArray(execResult.results)) {
    var verbalStep = execResult.results.find(function(r) { return r.level === 'verbal' && r.guidance; });
    if (verbalStep) await speakText(verbalStep.guidance, tab.id);
  }

  if (execResult && !execResult.success && execResult.level === 'verbal' && execResult.guidance) {
    await speakText(execResult.guidance, tab.id);
  }

  // 操作失败时显示错误动画
  var isFailed = execResult && (execResult.success === false || execResult.state === 'failed');
  if (isFailed) {
    var failMsg = STATE.language === 'zh' ? '⚠️ 操作失败，请稍后重试' : '⚠️ Operation failed';
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_SPEECH',
      payload: { text: failMsg }
    }).catch(function() {});
    setAnim('error', tab.id);
    await new Promise(function(r) { return setTimeout(r, 1200); });
  }

  setAnim('idle', tab.id);
  return { success: true, instruction, execResult };
}

// --- TTS 播报 ---
// 统一走 SiliconFlow CosyVoice2 TTS（claire 温柔女声），中英文均支持
// 失败时降级到 chrome.tts.speak（在 SW 内部播报，无需 content script）
let _enVoiceName = null;
let _ttsGeneration = 0;

function stopAllTts(tabId) {
  _ttsGeneration += 1;
  try { chrome.tts.stop(); } catch (_) {}
  chrome.runtime.sendMessage({ type: 'TTS_STOP' }).catch(() => {});
  const stopTab = function(id) {
    if (id) chrome.tabs.sendMessage(id, { type: 'TTS_STOP' }).catch(() => {});
  };
  if (tabId) {
    stopTab(tabId);
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }).then(function(tabs) {
      stopTab(tabs[0]?.id);
    }).catch(() => {});
  }
  setAnim('idle', tabId);
}

function interruptCurrentOutput(tabId) {
  if (STATE.streamAbortController) {
    STATE.streamAbortController.abort();
    STATE.streamAbortController = null;
  }
  stopAllTts(tabId);
  STATE.isProcessing = false;
}

async function speakText(text, tabId) {
  if (!text) return;
  if (STATE.isMuted) return;
  const ttsRunId = ++_ttsGeneration;

  // 方案1: 优先让侧边栏用 macOS Web Speech API 播报（零延迟、高品质、双语）
  // 侧边栏在对话场景下通常都是打开的
  try {
    if (ttsRunId !== _ttsGeneration) return;
    await chrome.runtime.sendMessage({ type: 'TTS_SPEAK', payload: { text: text } });
    return; // 发送成功（不管侧边栏是否实际播放了）
  } catch (_) {
    // 侧边栏未打开 → 走方案2/3
  }

  // 方案2: 有 API Key 且文本 > 8 字符 → 调 SiliconFlow CosyVoice
  if (text.length > 8 && STATE.asrApiKey) {
    try {
      if (ttsRunId !== _ttsGeneration) return;
      var audioBase64 = await Promise.race([
        synthesize(text, STATE.asrApiKey),
        new Promise(function(_, reject) { return setTimeout(function() { return reject(new Error("TTS_TIMEOUT")); }, 8000); })
      ]);
      if (ttsRunId !== _ttsGeneration) return;
      var targetTabId = tabId;
      if (!targetTabId) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        targetTabId = tabs[0]?.id;
      }
      if (targetTabId) {
        try {
          const ttsResult = await chrome.tabs.sendMessage(targetTabId, {
            type: 'TTS_PLAY',
            payload: { audioBase64, mimeType: 'audio/mp3' }
          });
          if (ttsResult?.ok) return;
        } catch (_) {}
      }
      // content script 不可用 → 降级
      console.warn('[智引] TTS content script unavailable, using chrome.tts');
    } catch (e) {
      console.warn('[智引] TTS SiliconFlow failed (' + e.message + '), fallback to chrome.tts');
    }
  }

  // 方案3: chrome.tts（SW 内部播报，无需 content script）
  if (ttsRunId !== _ttsGeneration) return;
  return _speakChromeTTS(text);
}

/** 在 Service Worker 内部用 chrome.tts 播报语音 */
function _speakChromeTTS(text) {
  if (!text) return Promise.resolve();
  var isEn = !/[一-鿿]/.test(text);
  return new Promise(function(resolve) {
    var opts = {
      lang: isEn ? 'en-US' : 'zh-CN',
      rate: isEn ? 0.85 : 0.91,
      pitch: isEn ? 1.0 : 1.1,
      volume: 1.0,
      onEvent: function(event) {
        if (['end', 'error', 'cancelled', 'interrupted'].includes(event.type)) resolve();
      }
    };
    // 英文尝试选取高质量语音
    if (isEn && _enVoiceName) opts.voiceName = _enVoiceName;
    chrome.tts.speak(text, opts);
  });
}

// 初始化英文语音名称（异步，无等待）
chrome.tts.getVoices().then(function(voices) {
  var good = voices.find(function(v) {
    return /Samantha|Karen|Alex|Ava|Allison|Susan/i.test(v.voiceName) && v.lang?.startsWith('en');
  }) || voices.find(function(v) { return v.lang?.startsWith('en-US'); });
  if (good) _enVoiceName = good.voiceName;
}).catch(function() {});

function setAnim(state, tabId) {
  STATE.animState = state;
  // 推送到侧边栏
  chrome.runtime.sendMessage({ type: 'ANIM_SET_STATE', payload: { state } }).catch(() => {});
  // 推送到页面内皮卡丘 Widget
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: 'ANIM_SET_STATE', payload: { state } }).catch(() => {});
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'ANIM_SET_STATE', payload: { state } }).catch(() => {});
    }).catch(() => {});
  }
}

// --- API Key 管理 ---
async function setApiKey(key) {
  STATE.apiKey = key;
  await chrome.storage.local.set({ apiKey: key });
  return { success: true, message: statusMsg('keySaved', STATE.language) };
}
