/**
 * Side Panel — 智引 AI 导航导师
 *
 * 集成：工作台 / 资料 / 复习 / 问智引，保留隐藏导航与设置绑定
 */

import { detectLanguage, statusMsg } from '../lib/lang.js';
import { ChatView } from './chat-view.js';
import { ChatStore } from './chat-store.js';
function getTranscribe() {
  return import('../lib/asr-client.js').then(function(m) { return m.transcribe; });
}

const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_MANUAL_SOURCE_CHARS = 20000;
const SUPPORTED_IMPORT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'html', 'htm', 'log', 'js', 'ts', 'py', 'java', 'css', 'pdf', 'docx', 'pptx']);

// ── DOM 引用 ──

// Tab
const tabBar = document.getElementById('tab-bar');
const tabContents = {
  workbench: document.getElementById('tab-workbench'),
  chat: document.getElementById('tab-chat'),
  nav: document.getElementById('tab-nav'),
  notes: document.getElementById('tab-notes'),
  review: document.getElementById('tab-review'),
  history: document.getElementById('tab-history'),
  settings: document.getElementById('tab-settings')
};
var currentTab = 'workbench';
var previousMainTab = 'workbench';
const settingsEntryBtn = document.getElementById('settings-entry-btn');
const settingsBackBtn = document.getElementById('settings-back-btn');

// 导航 Tab（原 UI）
const avatarContainer = document.getElementById('avatar-container');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const micBtn = document.getElementById('mic-btn');
const textInput = document.getElementById('text-input');
const apiKeyInput = document.getElementById('api-key-input');
const modelSelect = document.getElementById('model-select');
const saveKeyBtn = document.getElementById('save-key-btn');
const asrKeyInput = document.getElementById('asr-key-input');
const asrEndpointInput = document.getElementById('asr-endpoint-input');
const asrModelSelect = document.getElementById('asr-model-select');
const saveAsrBtn = document.getElementById('save-asr-btn');

// 对话 Tab
const chatMessages = document.getElementById('chat-messages');
const chatMicBtn = document.getElementById('chat-mic-btn');
const chatTextInput = document.getElementById('chat-text-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatMoreBtn = document.getElementById('chat-more-btn');
const chatMoreMenu = document.getElementById('chat-more-menu');
const chatUploadFileBtn = document.getElementById('chat-upload-file-btn');
const chatWebSearchBtn = document.getElementById('chat-web-search-btn');
const chatRecommendPlatformBtn = document.getElementById('chat-recommend-platform-btn');
const chatAddManualBtn = document.getElementById('chat-add-manual-btn');
const chatFileInput = document.getElementById('chat-file-input');
const chatNewBtn = document.getElementById('chat-new-btn');
const chatHistoryBtn = document.getElementById('chat-history-btn');
const chatShowWidgetBtn = document.getElementById('chat-show-widget-btn');
const chatMuteBtn = document.getElementById('chat-mute-btn');
const chatConvTitle = document.getElementById('chat-conv-title');
const chatContextScope = document.getElementById('chat-context-scope');
const chatContextLabel = document.getElementById('chat-context-label');
const chatContextDetail = document.getElementById('chat-context-detail');
const chatCustomManageBtn = document.getElementById('chat-custom-manage-btn');
const chatCustomPanel = document.getElementById('chat-custom-panel');
const chatCustomList = document.getElementById('chat-custom-list');
const chatCustomCount = document.getElementById('chat-custom-count');
const chatCustomConfirmBtn = document.getElementById('chat-custom-confirm-btn');
const chatCustomCloseBtn = document.getElementById('chat-custom-close-btn');
const chatRecentPanel = document.getElementById('chat-recent-panel');
const chatRecentToggleBtn = document.getElementById('chat-recent-toggle-btn');

// 历史 Tab
const historySearchInput = document.getElementById('history-search-input');
const historyList = document.getElementById('history-list');
const historyClearBtn = document.getElementById('history-clear-btn');

// 工作台 / 笔记 Tab
const workbenchSiteTitle = document.getElementById('workbench-site-title');
const workbenchSiteDesc = document.getElementById('workbench-site-desc');
const workbenchFlowStatus = document.getElementById('workbench-flow-status');
const workbenchFlowList = document.getElementById('workbench-flow-list');
const workbenchSuggestionsList = document.getElementById('workbench-suggestions-list');
const workbenchFolderList = document.getElementById('workbench-folder-list');
const workbenchRefreshBtn = document.getElementById('workbench-refresh-btn');
const workbenchFolderToggleBtn = document.getElementById('workbench-folder-toggle-btn');
const workbenchCollectBtn = document.getElementById('workbench-collect-btn');
const workbenchComposeBtn = document.getElementById('workbench-compose-btn');
const workbenchReviewBtn = document.getElementById('workbench-review-btn');
const workbenchDemoRunBtn = document.getElementById('workbench-demo-run-btn');
const workbenchShowWidgetBtn = document.getElementById('workbench-show-widget-btn');
const navCollectBtn = document.getElementById('nav-collect-btn');
const notesStatus = document.getElementById('notes-status');
const notesFolderList = document.getElementById('notes-folder-list');
const notesSiteTitle = document.getElementById('notes-site-title');
const notesSiteDesc = document.getElementById('notes-site-desc');
const notesSiteRefreshBtn = document.getElementById('notes-site-refresh-btn');
const notesPreview = document.getElementById('notes-preview');
const notesCollectBtn = document.getElementById('notes-collect-btn');
const notesCollectSelectionBtn = document.getElementById('notes-collect-selection-btn');
const notesCollectManualBtn = document.getElementById('notes-collect-manual-btn');
const notesComposeBtn = document.getElementById('notes-compose-btn');
const notesPracticeBtn = document.getElementById('notes-practice-btn');
const notesRefreshBtn = document.getElementById('notes-refresh-btn');
const notesDownloadBtn = document.getElementById('notes-download-btn');
const notesDownloadMenu = document.getElementById('notes-download-menu');
const notesExportBtn = document.getElementById('notes-export-btn');
const notesExportWordBtn = document.getElementById('notes-export-word-btn');
const notesExportPdfBtn = document.getElementById('notes-export-pdf-btn');
const notesExportPptxBtn = document.getElementById('notes-export-pptx-btn');
const notesExportAnkiBtn = document.getElementById('notes-export-anki-btn');
const notesClearBtn = document.getElementById('notes-clear-btn');
const reviewStatus = document.getElementById('review-status');
const reviewGenerateBtn = document.getElementById('review-generate-btn');
const reviewCards = document.getElementById('review-cards');
const reviewSelftestCount = document.getElementById('review-selftest-count');
const reviewWrongCount = document.getElementById('review-wrong-count');

// 演示模式
const demoBadge = document.getElementById('demo-badge');
const demoToggle = document.getElementById('demo-mode-toggle');
let currentCollabTask = null;

// ── 状态 ──
let animState = 'idle';
let synth = window.speechSynthesis;
let currentUtterance = null;
let currentLang = 'zh';
let isRecording = false;
let cachedVoices = [];
let _streamingActive = false;
let _skipNextUserMsg = false;  // 去重：本地已添加用户消息时跳过 SW 回传
let currentSiteHost = '';
let currentNoteSources = [];
let historyDocClickBound = false;
const collapsedNoteGroups = new Set();
const knownNoteGroups = new Set();
const customSourceSelection = new Set();
const CUSTOM_SOURCE_STORAGE_KEY = 'zhiyin_custom_source_ids';
const CHAT_SCOPE_STORAGE_KEY = 'zhiyin_chat_context_scope';
let pendingChatContext = null;
let workbenchGroupsCollapsed = true;
let reviewFilter = 'all';

// ── Tab 切换 ──
tabBar.addEventListener('click', function(e) {
  var btn = e.target.closest('.tab-btn');
  if (!btn) return;
  var tab = btn.dataset.tab;
  switchTab(tab);
});

function switchTab(tab) {
  if (!tabContents[tab]) return;
  var mainTabs = ['workbench', 'notes', 'review', 'chat'];
  if (mainTabs.indexOf(tab) !== -1) previousMainTab = tab;
  currentTab = tab;
  // 更新按钮状态
  tabBar.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  var activeBtn = tabBar.querySelector('[data-tab="' + tab + '"]');
  if (activeBtn) activeBtn.classList.add('active');
  if (settingsEntryBtn) settingsEntryBtn.classList.toggle('active', tab === 'settings');
  // 切换内容
  Object.keys(tabContents).forEach(function(key) {
    tabContents[key].classList.toggle('active', key === tab);
  });
  // 切换到历史时刷新列表
  if (tab === 'history') renderHistoryList();
  if (tab === 'workbench') refreshWorkbench();
  if (tab === 'notes') refreshNotesFolder();
  if (tab === 'review') refreshReviewPanel();
  // 切换到对话时聚焦输入框
  if (tab === 'chat') {
    renderHistoryList();
    setTimeout(function() {
      var input = document.getElementById('chat-text-input');
      if (input) input.focus();
    }, 100);
  }
}

if (settingsEntryBtn) {
  settingsEntryBtn.addEventListener('click', function() {
    switchTab('settings');
  });
}

if (settingsBackBtn) {
  settingsBackBtn.addEventListener('click', function() {
    switchTab(previousMainTab || 'workbench');
  });
}

// ── Toast 通知 ──
var _toastTimer = null;
function showToast(msg, type, duration) {
  var el = document.getElementById('sidepanel-toast') || document.getElementById('chat-toast');
  if (!el) return;
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
  el.textContent = msg;
  el.className = type || '';
  el.style.display = '';
  el.onclick = function() { el.style.display = 'none'; };
  if (duration !== 0) {
    _toastTimer = setTimeout(function() {
      el.style.display = 'none';
      _toastTimer = null;
    }, duration || 4000);
  }
}

function sendQuickQuery(query) {
  if (_streamingActive || !query) return;
  interruptCurrentOutput(false);
  ChatView.addUserMessage(query, { context: { scope: chatContextScope?.value || 'current-page' } });
  ChatView.startStreaming();
  _skipNextUserMsg = true;
  switchTab('chat');
  setUIState('thinking', currentLang === 'en' ? '🤔 Analyzing...' : '🤔 正在分析...');
  doSendText(query);
}

async function sendToolAction(action) {
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (action === 'clear-highlight') {
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_HIGHLIGHT' });
      showToast('已清除页面高亮', 'success', 1800);
      return;
    }
    if (action === 'focus-widget') {
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'FOCUS_WIDGET_INPUT' });
      showToast('已聚焦页面浮窗输入框', 'success', 1800);
      return;
    }
    if (action === 'show-widget') {
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_WIDGET' });
      showToast('数字人已显示', 'success', 1800);
      return;
    }
    if (action === 'site-policy') {
      var host = currentSiteHost;
      try {
        if (tab?.url) host = new URL(tab.url).hostname;
      } catch (_) {}
      sendQuickQuery('请说明当前网站 ' + host + ' 的专项学习导航策略、常见入口和注意事项');
    }
  } catch (e) {
    showToast('操作失败：' + (e.message || '请刷新页面后重试'), 'error', 3000);
  }
}

async function sendRuntimeMessage(type, payload) {
  try {
    var res = await chrome.runtime.sendMessage({ type: type, payload: payload || {} });
    if (res && res.error) throw new Error(res.error);
    return res || {};
  } catch (e) {
    throw new Error(e && e.message ? e.message : '后端暂未接入');
  }
}

function pickArray(value, keys) {
  if (Array.isArray(value)) return value;
  for (var i = 0; i < keys.length; i++) {
    if (Array.isArray(value?.[keys[i]])) return value[keys[i]];
  }
  return [];
}

function escapeHtml(value) {
  return ChatView._escapeHtml(String(value == null ? '' : value));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

async function refreshWorkbench() {
  if (workbenchFlowStatus) workbenchFlowStatus.textContent = '同步中';
  try {
    var state = await sendRuntimeMessage('GET_WORKFLOW_STATE');
    renderWorkbenchFolderSummary(state);
    renderWorkbenchFlow(state);
  } catch (e) {
    renderWorkbenchFolderSummary({});
    if (workbenchFlowStatus) workbenchFlowStatus.textContent = '未接入';
    if (workbenchFlowList) {
      workbenchFlowList.innerHTML = '<div class="empty-panel">任务流后端暂未接好：' + escapeHtml(e.message) + '</div>';
    }
  }
}

async function refreshNotesSiteProfile() {
  try {
    var profile = await sendRuntimeMessage('GET_SITE_PROFILE');
    var host = profile.host || profile.hostname || profile.site || currentSiteHost || window._currentSite || '当前页面';
    var desc = profile.summary || profile.description || profile.title || '已连接当前站点，可发起导航、采集和学习规划。';
    if (notesSiteTitle) notesSiteTitle.textContent = host;
    if (notesSiteDesc) notesSiteDesc.textContent = desc;
  } catch (e) {
    if (notesSiteTitle) notesSiteTitle.textContent = currentSiteHost || '当前页面';
    if (notesSiteDesc) notesSiteDesc.textContent = '站点画像暂不可用：' + e.message;
  }
}

function renderWorkbenchFolderSummary(state) {
  var folder = state?.noteFolder || state?.folder || state || {};
  var items = pickArray(folder, ['items', 'sources', 'pages', 'folder']);
  currentNoteSources = items;
  updateChatContextCard();
  var groups = groupNoteSources(items);
  var sourceCount = items.length;
  if (workbenchSiteTitle) workbenchSiteTitle.textContent = sourceCount ? ('已归档 ' + sourceCount + ' 条资料') : '学习资料夹';
  if (workbenchSiteDesc) workbenchSiteDesc.textContent = groups.length ? ('共 ' + groups.length + ' 个资料组，默认收起，点击可查看详情。') : '采集页面后会按站点、仓库和主题自动归档。';
  if (!workbenchFolderList) return;
  if (!groups.length) {
    workbenchFolderList.innerHTML = '<div class="empty-panel">资料夹为空。先去资料页采集当前页面。</div>';
    return;
  }
  var groupsMarkup = groups.map(function(group) {
    return '<div class="folder-group collapsed workbench-folder-group" data-group-key="' + escapeAttr(group.key) + '">' +
      '<div class="folder-group-head">' +
        '<button class="folder-group-toggle" data-group-key="' + escapeAttr(group.key) + '" title="展开或收起资料组" aria-label="展开或收起资料组"><i data-lucide="chevron-right"></i></button>' +
        '<div><strong>' + escapeHtml(group.label) + '</strong><p>' + escapeHtml(group.items.length + ' 条资料 · ' + group.host) + '</p></div>' +
        '<button class="folder-group-export" data-group-key="' + escapeAttr(group.key) + '" title="将本组资料生成报告并导出 PDF"><i data-lucide="file-down"></i> PDF</button>' +
      '</div>' +
      '<div class="folder-group-body">' +
        group.items.slice(0, 4).map(function(item, index) {
          var title = item.title || item.name || item.url || ('资料 ' + (index + 1));
          var timeText = formatSourceTime(item.collectedAt || item.createdAt);
          var sourceId = item.id || item.sourceId || '';
          return '<div class="folder-mini-item">' +
            '<div><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml([sourceTypeLabel(item), timeText].filter(Boolean).join(' · ')) + '</span></div>' +
            '<button class="folder-mini-link" data-source-id="' + escapeAttr(sourceId) + '" title="打开原网站" aria-label="打开原网站" ' + (item.url ? '' : 'disabled') + '><i data-lucide="external-link"></i></button>' +
            '<button class="folder-mini-delete" data-source-id="' + escapeAttr(sourceId) + '" title="删除资料" aria-label="删除资料" ' + (sourceId ? '' : 'disabled') + '><i data-lucide="trash-2"></i></button>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }).join('');
  workbenchFolderList.innerHTML =
    '<div class="folder-summary-card' + (workbenchGroupsCollapsed ? ' collapsed' : '') + '">' +
      '<button class="folder-summary-head" id="workbench-folder-summary-toggle" type="button">' +
        '<span><strong>资料分组</strong><em>已归档 ' + sourceCount + ' 条资料 · ' + groups.length + ' 个主题组</em></span>' +
        '<i data-lucide="' + (workbenchGroupsCollapsed ? 'chevron-right' : 'chevron-down') + '"></i>' +
      '</button>' +
      '<div class="folder-summary-body">' + groupsMarkup + '</div>' +
    '</div>';
  var totalIcon = workbenchFolderToggleBtn?.querySelector('i');
  if (totalIcon) totalIcon.setAttribute('data-lucide', workbenchGroupsCollapsed ? 'chevrons-down-up' : 'chevrons-up-down');
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  if (chatCustomPanel && chatCustomPanel.style.display !== 'none') renderCustomSourcePicker();
}

function renderWorkbenchFlow(state) {
  var steps = pickArray(state, ['agentFlows', 'agentTaskFlows', 'steps', 'tasks', 'agents', 'workflow']);
  var status = state.status || state.phase || (steps.length ? '运行中' : '空闲');
  if (workbenchFlowStatus) workbenchFlowStatus.textContent = status;
  if (!workbenchFlowList) return;
  if (!steps.length) {
    workbenchFlowList.innerHTML = '<div class="empty-panel">暂无进行中的团队任务。</div>';
    renderWorkbenchSuggestions(state);
    return;
  }
  workbenchFlowList.innerHTML = steps.map(function(step, index) {
    var owner = step.owner || step.agent || step.role || ('智能体 ' + (index + 1));
    var text = step.text || step.title || step.name || step.description || '等待任务';
    var stepStatus = step.status || step.state || 'pending';
    return '<div class="flow-item">' +
      '<span class="flow-index">' + (index + 1) + '</span>' +
      '<div><strong>' + escapeHtml(owner) + '</strong><p>' + escapeHtml(text) + '</p></div>' +
      '<em>' + escapeHtml(stepStatus) + '</em>' +
    '</div>';
  }).join('');
  renderWorkbenchSuggestions(state);
}

function renderWorkbenchSuggestions(state) {
  if (!workbenchSuggestionsList) return;
  var memory = state?.taskMemory || {};
  var suggestions = pickArray(memory.lastSuggestions || state?.postCollectSuggestions, ['suggestions', 'items']);
  if (!suggestions.length) {
    suggestions = [
      { id: 'summary', title: '总结当前页面', text: '先理解当前网页，再决定是否采集为学习资料。', action: 'ASK_PAGE_SUMMARY' },
      { id: 'collect', title: '采集为资料', text: '把当前页面加入资料库，后续可生成笔记、复习题和汇报。', action: 'COLLECT_PAGE_SOURCE' },
      { id: 'plan', title: '生成学习路径', text: '围绕当前主题规划本科生可执行的学习步骤。', action: 'START_LEARNING_PLAN' }
    ];
  }
  workbenchSuggestionsList.innerHTML = suggestions.slice(0, 4).map(function(item) {
    return '<button class="suggestion-item" data-action="' + escapeAttr(item.action || '') + '" data-title="' + escapeAttr(item.title || '') + '">' +
      '<strong>' + escapeHtml(item.title || '下一步建议') + '</strong>' +
      '<span>' + escapeHtml(item.text || item.description || '') + '</span>' +
    '</button>';
  }).join('');
}

function renderNotesFolder(data) {
  var folder = data?.noteFolder || data?.folder || data || {};
  var items = pickArray(folder, ['items', 'sources', 'pages', 'folder']);
  currentNoteSources = items;
  updateChatContextCard();
  if (!notesFolderList) {
    if (chatCustomPanel && chatCustomPanel.style.display !== 'none') renderCustomSourcePicker();
    return;
  }
  if (!items.length) {
    notesFolderList.innerHTML = '<div class="empty-panel">资料夹为空。先采集当前页面。</div>';
    return;
  }
  var groups = groupNoteSources(items);
  groups.forEach(function(group) {
    if (!knownNoteGroups.has(group.key)) {
      knownNoteGroups.add(group.key);
      collapsedNoteGroups.add(group.key);
    }
  });
  notesFolderList.innerHTML = groups.map(function(group) {
    var collapsed = collapsedNoteGroups.has(group.key);
    return '<div class="folder-group' + (collapsed ? ' collapsed' : '') + '">' +
      '<div class="folder-group-head">' +
        '<button class="folder-group-toggle" data-group-key="' + escapeAttr(group.key) + '" title="展开或收起资料组" aria-label="展开或收起资料组"><i data-lucide="' + (collapsed ? 'chevron-right' : 'chevron-down') + '"></i></button>' +
        '<div><strong>' + escapeHtml(group.label) + '</strong><p>' + escapeHtml(group.items.length + ' 条资料 · ' + group.host) + '</p></div>' +
        '<button class="folder-group-export" data-group-key="' + escapeAttr(group.key) + '" title="将本组资料生成报告并导出 PDF"><i data-lucide="file-down"></i> PDF</button>' +
      '</div>' +
      '<div class="folder-group-body">' +
      group.items.map(function(item, index) {
        var title = item.title || item.name || item.url || ('资料 ' + (index + 1));
        var sourceTime = formatSourceTime(item.collectedAt || item.createdAt);
        var meta = [sourceTypeLabel(item), item.host || item.site || item.url || '', sourceTime].filter(Boolean).join(' · ');
        var sourceId = item.id || item.sourceId || '';
        return '<div class="folder-item" data-source-id="' + escapeAttr(sourceId) + '">' +
          '<i data-lucide="file-text"></i>' +
          '<button class="folder-item-body folder-item-open" data-source-id="' + escapeAttr(sourceId) + '" title="查看资料内容">' +
            '<strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(meta) + '</p>' +
          '</button>' +
          '<button class="folder-item-link" data-source-id="' + escapeAttr(sourceId) + '" title="打开原网页" aria-label="打开原网页" ' + (item.url ? '' : 'disabled') + '><i data-lucide="external-link"></i></button>' +
          '<button class="folder-item-delete" data-source-id="' + escapeAttr(sourceId) + '" title="删除资料" aria-label="删除资料" ' + (sourceId ? '' : 'disabled') + '><i data-lucide="trash-2"></i></button>' +
        '</div>';
      }).join('') +
      '</div>' +
    '</div>';
  }).join('');
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  if (chatCustomPanel && chatCustomPanel.style.display !== 'none') renderCustomSourcePicker();
}

function syncNoteFolderState(data) {
  var folder = data?.noteFolder || data?.folder || data || {};
  var items = pickArray(folder, ['items', 'sources', 'pages', 'folder']);
  var validIds = new Set(items.map(function(item) { return item.id || item.sourceId; }).filter(Boolean));
  Array.from(customSourceSelection).forEach(function(id) {
    if (!validIds.has(id)) customSourceSelection.delete(id);
  });
  saveCustomSourceSelection();
  renderWorkbenchFolderSummary({ noteFolder: { sources: items } });
  renderNotesFolder({ sources: items, notes: folder.notes || [] });
  updateChatContextCard();
  if (chatCustomPanel && chatCustomPanel.style.display !== 'none') renderCustomSourcePicker();
}

function formatSourceTime(value) {
  if (!value) return '';
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  var pad = n => String(n).padStart(2, '0');
  return [
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()),
    pad(date.getHours()) + ':' + pad(date.getMinutes())
  ].join(' ');
}

function loadCustomSourceSelection() {
  try {
    var saved = JSON.parse(localStorage.getItem(CUSTOM_SOURCE_STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) saved.forEach(id => { if (id) customSourceSelection.add(id); });
  } catch (_) {}
}

function saveCustomSourceSelection() {
  try {
    localStorage.setItem(CUSTOM_SOURCE_STORAGE_KEY, JSON.stringify(Array.from(customSourceSelection)));
  } catch (_) {}
}

function saveChatScope() {
  try {
    if (chatContextScope) localStorage.setItem(CHAT_SCOPE_STORAGE_KEY, chatContextScope.value || 'current-page');
  } catch (_) {}
}

function restoreChatScope() {
  if (!chatContextScope) return;
  try {
    var saved = localStorage.getItem(CHAT_SCOPE_STORAGE_KEY);
    if (saved && Array.from(chatContextScope.options).some(function(option) { return option.value === saved; })) {
      chatContextScope.value = saved;
    }
  } catch (_) {}
}

function currentGroupKeyForChat() {
  var groups = groupNoteSources(currentNoteSources || []);
  if (!groups.length) return '';
  var currentHost = currentSiteHost || window._currentSite || '';
  if (currentHost) {
    var matched = groups.find(group => String(group.host || '').indexOf(currentHost) !== -1 || currentHost.indexOf(String(group.host || '')) !== -1);
    if (matched) return matched.key;
  }
  return groups[0].key;
}

function sourceIdsForChatScope(scope) {
  if (scope === 'custom-sources') return Array.from(customSourceSelection);
  if (scope === 'current-group') return sourceIdsForGroup(currentGroupKeyForChat());
  if (scope === 'all-sources') return currentNoteSources.map(item => item.id || item.sourceId).filter(Boolean);
  return [];
}

function sourceTitleById(id) {
  var source = (currentNoteSources || []).find(function(item) {
    return (item.id || item.sourceId) === id;
  });
  return source?.title || source?.fileName || source?.url || '已选资料';
}

function sourceById(id) {
  return (currentNoteSources || []).find(function(item) {
    return (item.id || item.sourceId) === id;
  }) || null;
}

function buildRecommendTopicFromSources() {
  var typed = (chatTextInput?.value || '').trim();
  if (typed) return typed;
  var ids = activeTaskSourceIds();
  var candidates = ids.map(sourceById).filter(Boolean);
  if (!candidates.length && customSourceSelection.size) {
    candidates = Array.from(customSourceSelection).map(sourceById).filter(Boolean);
  }
  if (!candidates.length) {
    candidates = (currentNoteSources || []).filter(function(item) { return item.type === 'file'; }).slice(0, 1);
  }
  if (!candidates.length && currentNoteSources.length) {
    candidates = [currentNoteSources[0]];
  }
  var source = candidates[0] || {};
  var title = cleanTopicText(source.title || source.fileName || source.name || source.url || '');
  var excerpt = cleanTopicText(source.description || source.excerpt || source.text || '');
  var keywords = (excerpt.match(/[\u4e00-\u9fa5A-Za-z0-9][\u4e00-\u9fa5A-Za-z0-9+#._-]{1,20}/g) || [])
    .filter(function(word, index, arr) {
      var key = word.toLowerCase();
      return word.length > 1 && arr.findIndex(function(item) { return item.toLowerCase() === key; }) === index;
    })
    .slice(0, 3)
    .join(' ');
  var topic = [title, keywords].filter(Boolean).join(' ').trim();
  return topic ? (topic + ' 相关学习资源 平台') : '';
}

function activeTaskSourceIds() {
  var scope = chatContextScope?.value || 'current-page';
  if (scope === 'current-page') return [];
  var ids = sourceIdsForChatScope(scope);
  if (ids.length) return ids;
  if (customSourceSelection.size) return Array.from(customSourceSelection);
  var latestFile = (currentNoteSources || []).find(function(item) { return item.type === 'file'; });
  return latestFile?.id ? [latestFile.id] : [];
}

function hasExplicitPageIntent(text) {
  return /当前页面|这个页面|本页|网页|页面主要内容/.test(String(text || ''));
}

function hasExplicitFileIntent(text) {
  return /文件|资料|自选资料|当前资料组|全部资料|刚才上传|上传的|这份/.test(String(text || ''));
}

function isGreetingText(text) {
  return /^(你好|您好|哈喽|hello|hi|嗨)[、，。!！\s]*$/i.test(String(text || '').trim());
}

function parseLearningAssetCommand(text) {
  var raw = String(text || '').trim();
  var wantsSummary = /生成.*(?:资料)?笔记|学习笔记|整理.*笔记|资料总结/.test(raw);
  var wantsRecommend = /推荐平台|推荐网站|找平台|找资源|联网搜索/.test(raw);
  var wantsPractice = /自测|测试题|复习|题目/.test(raw);
  var wantsExport = /导出|学习成果|报告|pdf|word|ppt|markdown/i.test(raw);
  var followsFileHint = /总结.*推荐.*自测|推荐.*自测.*导出|总结.*导出|学习成果/.test(raw);
  if (!(wantsSummary || wantsRecommend || wantsPractice || wantsExport || followsFileHint)) return null;
  return {
    summary: wantsSummary || followsFileHint,
    recommend: wantsRecommend || followsFileHint,
    practice: wantsPractice || followsFileHint,
    export: wantsExport || followsFileHint
  };
}

function updateChatContextCard() {
  if (!chatContextScope) return;
  var scope = chatContextScope.value || 'current-page';
  var groups = groupNoteSources(currentNoteSources || []);
  var groupKey = currentGroupKeyForChat();
  var group = groups.find(item => item.key === groupKey);
  var customCount = customSourceSelection.size;
  var label = '正在基于：当前页面';
  var detail = '优先读取当前网页标题、DOM、视口和 URL。';
  if (scope === 'current-group') {
    label = '正在基于：当前资料组';
    detail = group ? (group.label + ' · ' + group.items.length + ' 条资料') : '还没有匹配到当前资料组，可先在资料页采集。';
  } else if (scope === 'custom-sources') {
    label = '正在基于：自选资料';
    detail = customCount ? (customCount + ' 条资料 · 只围绕已勾选内容回答') : '请先选择至少 1 条资料。';
  } else if (scope === 'all-sources') {
    label = '正在基于：全部资料';
    detail = currentNoteSources.length ? ('资料库共 ' + currentNoteSources.length + ' 条资料，可跨来源总结和对比。') : '资料库为空，可先采集当前页面。';
  }
  if (chatContextLabel) chatContextLabel.textContent = label;
  if (chatContextDetail) chatContextDetail.textContent = detail;
  if (chatCustomManageBtn) chatCustomManageBtn.style.display = scope === 'custom-sources' ? '' : 'none';
  if (chatCustomCount) chatCustomCount.textContent = '已选择 ' + customCount + ' 条资料';
}

function renderCustomSourcePicker() {
  if (!chatCustomList) return;
  var groups = groupNoteSources(currentNoteSources || []);
  if (!groups.length) {
    chatCustomList.innerHTML = '<div class="empty-panel">暂无资料。请先到资料页采集当前页面或自定义内容。</div>';
    updateChatContextCard();
    return;
  }
  chatCustomList.innerHTML = groups.map(function(group) {
    return '<div class="custom-source-group">' +
      '<strong>' + escapeHtml(group.label) + '<span>' + escapeHtml(group.items.length + ' 条') + '</span></strong>' +
      group.items.map(function(item, index) {
        var id = item.id || item.sourceId || '';
        var title = item.title || item.name || item.url || ('资料 ' + (index + 1));
        var checked = id && customSourceSelection.has(id) ? ' checked' : '';
        return '<label class="custom-source-item">' +
          '<input type="checkbox" data-source-id="' + escapeAttr(id) + '"' + checked + (id ? '' : ' disabled') + '>' +
          '<span><b>' + escapeHtml(title) + '</b><em>' + escapeHtml([sourceTypeLabel(item), formatSourceTime(item.collectedAt || item.createdAt)].filter(Boolean).join(' · ')) + '</em></span>' +
        '</label>';
      }).join('') +
    '</div>';
  }).join('');
  updateChatContextCard();
}

function sourceTypeLabel(item) {
  var type = item?.type || '';
  if (type === 'selection') return '选区';
  if (type === 'manual') return '手动文本';
  if (type === 'file') return '文件';
  if (type === 'search-result') return '搜索结果';
  if (type === 'viewport') return '视口';
  if (type === 'page') return '页面';
  return '资料';
}

function groupNoteSources(items) {
  var map = {};
  items.forEach(function(item) {
    var group = sourceGroupInfo(item);
    var key = group.key;
    if (!map[key]) map[key] = { key: key, host: group.host, label: group.label, items: [] };
    map[key].items.push(item);
  });
  return Object.keys(map).map(function(key) { return map[key]; });
}

function normalizeSourceHost(item) {
  if (item?.host) return item.host;
  try { return item?.url ? new URL(item.url).hostname : ''; } catch (_) { return ''; }
}

function cleanTopicText(text) {
  return String(text || '')
    .replace(/\.(pdf|docx|pptx|md|txt|csv|tsv|json|html?)$/i, '')
    .replace(/^搜索结果[：:]\s*/i, '')
    .replace(/^(Bing|Google|GitHub|IEEE|B站|中国大学MOOC|中国大学 MOOC)\s*搜索[：:]\s*/i, '')
    .replace(/^文件[：:]\s*/i, '')
    .replace(/\s*相关学习资源\s*平台\s*$/i, '')
    .replace(/\s*相关资料\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function topicFromSearchResult(item) {
  var text = [item?.title, item?.text, item?.excerpt, item?.description].filter(Boolean).join('\n');
  var patterns = [
    /搜索结果[：:]\s*(?:Bing|Google|GitHub|IEEE|B站|中国大学MOOC|中国大学 MOOC)?\s*搜索[：:]\s*文件[：:]\s*([^\n]+?)(?:\s*相关学习资源\s*平台|\s*相关资料|$)/i,
    /查询[：:]\s*文件[：:]\s*([^\n]+?)(?:\s*相关学习资源\s*平台|\s*相关资料|$)/i,
    /文件[：:]\s*([^\n]+?)(?:\s*相关学习资源\s*平台|\s*相关资料|$)/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = text.match(patterns[i]);
    if (match && match[1]) return cleanTopicText(match[1]);
  }
  return cleanTopicText(item?.title || '');
}

function platformTopicFromHost(host) {
  var h = String(host || '').toLowerCase();
  if (h.indexOf('github.com') !== -1) return { key: 'platform:github', label: 'GitHub 学习资料' };
  if (h.indexOf('ieee') !== -1) return { key: 'platform:ieee', label: 'IEEE 学术资料' };
  if (h.indexOf('chaoxing') !== -1 || h.indexOf('xuexitong') !== -1) return { key: 'platform:xuexitong', label: '学习通资料' };
  if (h.indexOf('icourse163') !== -1) return { key: 'platform:mooc', label: '中国大学 MOOC 资料' };
  if (h.indexOf('bilibili') !== -1) return { key: 'platform:bilibili', label: 'B站学习资料' };
  if (h.indexOf('blackboard') !== -1 || h.indexOf('globalbb') !== -1) return { key: 'platform:blackboard', label: 'Blackboard 资料' };
  return null;
}

function platformTopicFromSearchText(item, host) {
  var text = [item?.title, item?.text, item?.excerpt, item?.description].filter(Boolean).join('\n');
  if (/GitHub\s*搜索/i.test(text) || /github/i.test(host || '')) return { key: 'platform:github', label: 'GitHub 学习资料' };
  if (/IEEE\s*搜索/i.test(text) || /ieee/i.test(host || '')) return { key: 'platform:ieee', label: 'IEEE 学术资料' };
  if (/学习通|超星|chaoxing|xuexitong/i.test(text + ' ' + (host || ''))) return { key: 'platform:xuexitong', label: '学习通资料' };
  if (/中国大学\s*MOOC|icourse163/i.test(text + ' ' + (host || ''))) return { key: 'platform:mooc', label: '中国大学 MOOC 资料' };
  if (/B站|哔哩哔哩|bilibili/i.test(text + ' ' + (host || ''))) return { key: 'platform:bilibili', label: 'B站学习资料' };
  return null;
}

function sourceGroupInfo(item) {
  var host = normalizeSourceHost(item) || '未识别来源';
  var url = null;
  try { if (item?.url) url = new URL(item.url); } catch (_) {}
  if (item?.type === 'file' || host === 'local-file') {
    var fileTopic = cleanTopicText(item?.fileName || item?.title || item?.name || '文件资料');
    return { key: 'topic:' + fileTopic.toLowerCase(), host: '文件 / 本地资料', label: fileTopic || '文件资料' };
  }
  if (item?.type === 'search-result') {
    var searchPlatform = platformTopicFromSearchText(item, host);
    if (searchPlatform) return { key: searchPlatform.key, host: host, label: searchPlatform.label };
    var topic = topicFromSearchResult(item);
    if (topic) return { key: 'topic:' + topic.toLowerCase(), host: sourceGroupLabel(item, host), label: topic };
    var platform = platformTopicFromHost(host);
    if (platform) return { key: platform.key, host: host, label: platform.label };
    return { key: 'search:' + host, host: host, label: sourceGroupLabel(item, host) + ' · 搜索结果' };
  }
  if (host.indexOf('github.com') !== -1 && url) {
    var parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      var repo = parts[0] + '/' + parts[1];
      return {
        key: 'github:' + repo.toLowerCase(),
        host: 'github.com/' + repo,
        label: 'GitHub：' + repo
      };
    }
  }
  if (host.indexOf('gemini.google.com') !== -1) {
    return { key: 'site:gemini.google.com', host: host, label: 'Google Gemini 资料' };
  }
  var platformGroup = platformTopicFromHost(host);
  if (platformGroup) {
    return { key: platformGroup.key, host: host, label: platformGroup.label };
  }
  if (item?.siteProfile?.name) {
    return { key: 'site:' + host, host: host, label: item.siteProfile.name };
  }
  return { key: 'site:' + host, host: host, label: sourceGroupLabel(item, host) };
}

function sourceGroupLabel(item, host) {
  if (host && host.indexOf('github.com') !== -1) return 'GitHub 学习资料';
  if (host && host.indexOf('gemini.google.com') !== -1) return 'Google Gemini 资料';
  if (item?.siteProfile?.name) return item.siteProfile.name;
  return host || '其他资料';
}

function findNoteSource(sourceId) {
  return currentNoteSources.find(function(item) {
    return (item.id || item.sourceId || '') === sourceId;
  }) || null;
}

function previewNoteSource(sourceId) {
  var item = findNoteSource(sourceId);
  if (!item || !notesPreview) return;
  var text = item.text || item.selectedText || item.visibleText || item.excerpt || item.description || '';
  notesPreview.textContent = [
    '# ' + (item.title || '资料预览'),
    '',
    '类型：' + sourceTypeLabel(item),
    '来源：' + (item.url || item.host || ''),
    '采集时间：' + (item.collectedAt || ''),
    '',
    text || '这条资料没有保存正文，但保留了标题和来源。'
  ].join('\n');
}

function openNoteSource(sourceId) {
  var item = findNoteSource(sourceId);
  if (!item || !item.url) return;
  chrome.tabs.create({ url: item.url }).catch(function() {
    showToast('无法打开原网页', 'error', 2200);
  });
}

function sourceIdsForGroup(groupKey) {
  return currentNoteSources.filter(function(item) {
    return sourceGroupInfo(item).key === groupKey;
  }).map(function(item) {
    return item.id || item.sourceId;
  }).filter(Boolean);
}

async function refreshNotesFolder() {
  if (notesStatus) notesStatus.textContent = '刷新中';
  refreshNotesSiteProfile().catch(function() {});
  try {
    var state = await sendRuntimeMessage('GET_WORKFLOW_STATE');
    renderNotesFolder(state.notes || state.noteFolder || state.folder || state);
    if (notesStatus) notesStatus.textContent = '已刷新';
  } catch (e) {
    renderNotesFolder({});
    if (notesStatus) notesStatus.textContent = '刷新失败';
    showToast('刷新资料夹失败：' + e.message, 'error', 2500);
  }
}

function renderCollectedSource(res, fallbackTitle) {
  renderNotesFolder(res.noteFolder || res.folder || res);
  if (notesPreview && res.source) {
    notesPreview.textContent = [
      '# ' + (fallbackTitle || '已采集资料'),
      '',
      '标题：' + (res.source.title || ''),
      '来源：' + (res.source.url || ''),
      '',
      res.source.excerpt || res.source.description || res.source.text || '已加入学习资料夹。'
    ].join('\n');
  } else if (notesPreview && (res.preview || res.text || res.summary)) {
    notesPreview.textContent = res.preview || res.summary || res.text;
  }
}

async function collectSource(type, successText, fallbackTitle) {
  if (notesStatus) notesStatus.textContent = '采集中';
  try {
    var res = await sendRuntimeMessage(type);
    if (notesStatus) notesStatus.textContent = '已采集';
    showToast(successText, 'success', 2000);
    renderCollectedSource(res, fallbackTitle);
  } catch (e) {
    if (notesStatus) notesStatus.textContent = '采集失败';
    showToast('采集失败：' + e.message, 'error', 3000);
  }
}

function collectPageSource() {
  return collectSource('COLLECT_PAGE_SOURCE', '已采集当前页面', '已采集页面');
}

function collectSelectionSource() {
  if (notesStatus) notesStatus.textContent = '采集中';
  return sendRuntimeMessage('COLLECT_SELECTION_SOURCE').then(function(res) {
    if (notesStatus) notesStatus.textContent = '已采集';
    showToast('已采集选中文本', 'success', 2000);
    renderCollectedSource(res, '已采集选中文本');
  }).catch(function(e) {
    if (notesStatus) notesStatus.textContent = '采集失败';
    showToast(e.message === 'NO_SELECTION' ? '请先在网页中选中文本，或使用“自定义内容”。' : ('采集失败：' + e.message), 'error', 3000);
  });
}

function collectManualSource() {
  var text = prompt('请输入或粘贴要加入资料库的自定义内容：');
  if (!text || !text.trim()) {
    if (notesStatus) notesStatus.textContent = '已取消';
    showToast('未添加内容', 'info', 1800);
    return Promise.resolve();
  }
  if (text.length > MAX_MANUAL_SOURCE_CHARS) {
    showToast('自定义内容过长，请控制在 2 万字以内。', 'error', 2600);
    return Promise.resolve();
  }
  if (notesStatus) notesStatus.textContent = '添加中';
  return sendRuntimeMessage('COLLECT_MANUAL_TEXT_SOURCE', { text: text.trim() }).then(function(res) {
    if (notesStatus) notesStatus.textContent = '已添加';
    showToast('已将自定义内容加入资料库', 'success', 2200);
    renderCollectedSource(res, '已添加自定义内容');
  }).catch(function(err) {
    if (notesStatus) notesStatus.textContent = '添加失败';
    showToast('添加失败：' + err.message, 'error', 3000);
  });
}

function readFileAsText(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() {
      var text = String(reader.result || '');
      resolve(text);
    };
    reader.onerror = function() { reject(reader.error || new Error('FILE_READ_FAILED')); };
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = function() { reject(reader.error || new Error('FILE_READ_FAILED')); };
    reader.readAsArrayBuffer(file);
  });
}

function normalizeExtractedText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdfText(arrayBuffer) {
  if (!window.pdfjsLib) throw new Error('PDF_PARSER_NOT_READY');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
  var loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  var pdf = await loadingTask.promise;
  var pages = [];
  var maxPages = Math.min(pdf.numPages || 0, 80);
  for (var pageNo = 1; pageNo <= maxPages; pageNo++) {
    var page = await pdf.getPage(pageNo);
    var content = await page.getTextContent();
    var text = (content.items || []).map(function(item) { return item.str || ''; }).join(' ');
    if (text.trim()) pages.push('第 ' + pageNo + ' 页\n' + text.trim());
  }
  var suffix = pdf.numPages > maxPages ? '\n\n[提示] 文件页数较多，已优先解析前 ' + maxPages + ' 页。' : '';
  return normalizeExtractedText(pages.join('\n\n') + suffix);
}

async function extractDocxText(arrayBuffer) {
  if (!window.mammoth) throw new Error('DOCX_PARSER_NOT_READY');
  var result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
  var warnings = (result.messages || []).map(function(msg) { return msg.message; }).filter(Boolean);
  var text = normalizeExtractedText(result.value || '');
  if (warnings.length) text += '\n\n[解析提示]\n' + warnings.slice(0, 5).join('\n');
  return text;
}

async function extractPptxText(arrayBuffer) {
  if (!window.JSZip) throw new Error('PPTX_PARSER_NOT_READY');
  var zip = await window.JSZip.loadAsync(arrayBuffer);
  var slideFiles = Object.keys(zip.files)
    .filter(function(name) { return /^ppt\/slides\/slide\d+\.xml$/i.test(name); })
    .sort(function(a, b) {
      var ai = Number((a.match(/slide(\d+)\.xml/i) || [0, 0])[1]);
      var bi = Number((b.match(/slide(\d+)\.xml/i) || [0, 0])[1]);
      return ai - bi;
    });
  var parser = new DOMParser();
  var slides = [];
  for (var i = 0; i < slideFiles.length; i++) {
    var xml = await zip.files[slideFiles[i]].async('text');
    var doc = parser.parseFromString(xml, 'application/xml');
    var texts = Array.from(doc.getElementsByTagName('a:t')).map(function(node) {
      return node.textContent || '';
    }).filter(Boolean);
    if (texts.length) slides.push('第 ' + (i + 1) + ' 页\n' + texts.join('\n'));
  }
  return normalizeExtractedText(slides.join('\n\n'));
}

async function extractOfficeFileText(file) {
  var ext = (file.name.split('.').pop() || '').toLowerCase();
  if (/^(txt|md|csv|tsv|json|html|htm|log|js|ts|py|java|css)$/i.test(ext) || /^text\//i.test(file.type || '')) {
    return normalizeExtractedText(await readFileAsText(file));
  }
  var arrayBuffer = await readFileAsArrayBuffer(file);
  if (ext === 'pdf' || file.type === 'application/pdf') return extractPdfText(arrayBuffer);
  if (ext === 'docx') return extractDocxText(arrayBuffer);
  if (ext === 'pptx') return extractPptxText(arrayBuffer);
  return '';
}

async function collectFileSource(file) {
  if (!file) return null;
  if (notesStatus) notesStatus.textContent = '读取文件';
  var ext = (file.name.split('.').pop() || '').toLowerCase();
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('文件过大，请控制在 25MB 以内，比赛演示建议使用精简版 PDF/DOCX/PPTX。');
  }
  if (ext && !SUPPORTED_IMPORT_EXTENSIONS.has(ext)) {
    throw new Error('暂不支持 .' + ext + ' 文件，请使用 PDF、DOCX、PPTX、Markdown 或文本文件。');
  }
  var provisionalContext = { scope: 'file', files: [{ name: file.name, size: file.size || 0 }] };
  ChatView.addUserMessage('输入文件：' + file.name, { context: provisionalContext });
  ChatView.startStreaming();
  ChatView.appendStreamText('正在读取并解析文件内容...');
  var text = '';
  try {
    text = await extractOfficeFileText(file);
  } catch (err) {
    text = '';
  }
  if (!text) {
    text = '文件已导入：' + file.name + '\n类型：' + (file.type || ext || '未知') + '\n大小：' + file.size + ' 字节。\n暂未从该格式中解析到正文，请尝试上传 PDF、DOCX、PPTX、Markdown 或文本文件。';
  }
  ChatView.appendStreamText('已解析文件，正在加入资料库...');
  var res = await sendRuntimeMessage('COLLECT_FILE_SOURCE', {
    filename: file.name,
    mimeType: file.type || '',
    size: file.size || 0,
    text: text.slice(0, 12000)
  });
  if (notesStatus) notesStatus.textContent = '已导入';
  renderCollectedSource(res, '已导入文件');
  if (res?.source?.id) {
    customSourceSelection.add(res.source.id);
    saveCustomSourceSelection();
    if (chatContextScope) {
      chatContextScope.value = 'custom-sources';
      saveChatScope();
    }
    updateChatContextCard();
    var fileContext = {
      scope: 'custom-sources',
      sourceIds: [res.source.id],
      customSourceIds: [res.source.id],
      files: [{ id: res.source.id, name: file.name, size: file.size || 0 }]
    };
    ChatView.finishStreaming('已将文件加入资料库，可继续让我总结、推荐平台、生成自测或导出学习成果。', {
      action: 'describe',
      actionSuccess: true,
      context: fileContext
    });
  } else {
    ChatView.finishStreaming('文件已读取，但加入资料库时没有返回有效资料编号。请重新上传一次，或换成 PDF、DOCX、PPTX、Markdown、TXT 格式。', {
      action: 'describe',
      actionSuccess: false,
      context: provisionalContext
    });
  }
  showToast('文件已加入资料库', 'success', 2200);
  return res;
}

async function runWebSearch(query) {
  var q = (query || chatTextInput?.value || '').trim();
  if (!q) q = prompt('请输入要联网搜索的主题或问题：') || '';
  q = q.trim();
  if (!q) return null;
  if (notesStatus) notesStatus.textContent = '搜索中';
  var res = await sendRuntimeMessage('WEB_SEARCH_RESOURCES', { query: q });
  if (notesStatus) notesStatus.textContent = '已搜索';
  if (res?.noteFolder) renderNotesFolder(res.noteFolder);
  var ids = (res?.sources || []).map(source => source.id).filter(Boolean);
  var searchResults = (res?.sources || []).map(source => ({ id: source.id, title: source.title, url: source.url }));
  if (ids.length) {
    ids.forEach(id => customSourceSelection.add(id));
    saveCustomSourceSelection();
    if (chatContextScope) {
      chatContextScope.value = 'custom-sources';
      saveChatScope();
    }
    updateChatContextCard();
  }
  var summary = (res?.recommendations || []).map(function(item, index) {
    return (index + 1) + '. ' + item.name + '\n网址：' + item.url + '\n理由：' + item.reason;
  }).join('\n\n') || '未找到足够可靠的推荐结果。';
  var searchContext = { scope: 'custom-sources', sourceIds: ids, customSourceIds: ids, searchResults: searchResults };
  ChatView.addUserMessage('联网搜索：' + q, { context: searchContext });
  ChatView.finishStreaming('已完成联网搜索，并推荐以下 1-3 个相关网站（含网址）：\n\n' + summary + '\n\n这些结果已加入资料库，可继续导航、采集、生成笔记或自测复习。', {
    action: 'describe',
    actionSuccess: true,
    context: searchContext
  });
  showToast('联网搜索结果已加入资料库', 'success', 2600);
  return res;
}

async function recommendPlatformsFromCurrentContext() {
  var topic = buildRecommendTopicFromSources();
  if (!topic) {
    topic = prompt('请输入要推荐平台的学习主题，或先上传文件/采集资料：') || '';
  }
  topic = topic.trim();
  if (!topic) return;
  await runWebSearch(topic);
}

function extractMarkdownSection(markdown, heading) {
  var text = String(markdown || '');
  var pattern = new RegExp('(^|\\n)##\\s+' + heading + '\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)');
  var match = text.match(pattern);
  return match ? match[2].trim() : '';
}

function renderPracticePreview(markdown) {
  var selfTest = extractMarkdownSection(markdown, '自测问题');
  var blocks = [];
  if (selfTest) blocks.push('## 自测问题\n' + selfTest);
  if (notesPreview) notesPreview.textContent = blocks.join('\n\n') || '暂未生成自测题。';
}

function splitReviewLines(text) {
  return String(text || '').split('\n').map(function(line) {
    return line.replace(/^[-*]\s*/, '').replace(/^\d+[.)、]\s*/, '').trim();
  }).filter(Boolean);
}

function parseFlashcardLines(text) {
  var lines = splitReviewLines(text);
  var cards = [];
  var pending = null;
  lines.forEach(function(line) {
    var qa = line.match(/^Q\d*\s*[：:]\s*(.+)$/i);
    var answer = line.match(/^A\s*[：:]\s*(.+)$/i);
    if (qa) {
      if (pending) cards.push(pending);
      pending = { front: qa[1].trim(), back: '' };
      return;
    }
    if (answer && pending) {
      pending.back = answer[1].trim();
      cards.push(pending);
      pending = null;
      return;
    }
    var parts = line.split(/\t|::|：/);
    if (parts.length >= 2) {
      cards.push({ front: (parts[0] || '').trim(), back: parts.slice(1).join('：').trim() });
    } else if (line) {
      cards.push({ front: line, back: '' });
    }
  });
  if (pending) cards.push(pending);
  return cards.filter(function(card) { return card.front || card.back; });
}

function updateReviewStats(counts) {
  var cards = reviewCards ? Array.from(reviewCards.querySelectorAll('.review-card')) : [];
  var pending = cards.filter(function(card) { return !card.dataset.reviewState; }).length;
  var wrongTotal = cards.filter(function(card) { return card.dataset.reviewState === 'again'; }).length;
  var selfTests = counts?.selfTests ?? pending;
  var wrong = counts?.wrong ?? wrongTotal;
  if (reviewSelftestCount) reviewSelftestCount.textContent = selfTests + ' 题';
  if (reviewWrongCount) reviewWrongCount.textContent = wrong + ' 条';
  if (reviewStatus && cards.length) {
    reviewStatus.textContent = pending ? ('剩余 ' + pending + ' 题') : '本轮完成';
  }
}

function applyReviewFilter(filter) {
  reviewFilter = filter || 'all';
  if (!reviewCards) return;
  var cards = Array.from(reviewCards.querySelectorAll('.review-card'));
  reviewCards.querySelector('.review-filter-empty')?.remove();
  var visibleCount = 0;
  cards.forEach(function(card) {
    var state = card.dataset.reviewState || '';
    var show = reviewFilter === 'wrong' ? state === 'again' : !state;
    card.style.display = show ? '' : 'none';
    if (show) card.classList.remove('review-removing');
    if (show) visibleCount += 1;
  });
  document.querySelectorAll('[data-review-filter]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.reviewFilter === reviewFilter);
  });
  if (cards.length && visibleCount === 0) {
    var empty = document.createElement('div');
    empty.className = 'empty-panel review-filter-empty';
    empty.textContent = reviewFilter === 'wrong' ? '暂无错题，继续保持。' : '本轮自测已完成，可重新生成一组题。';
    reviewCards.appendChild(empty);
  }
  updateReviewStats();
}

function renderReviewCardsFromMarkdown(markdown) {
  if (!reviewCards) return;
  var selfTest = splitReviewLines(extractMarkdownSection(markdown, '自测问题'));
  var items = [];
  selfTest.forEach(function(line, index) {
    items.push({ type: '自测题', title: '问题 ' + (index + 1), text: line });
  });
  updateReviewStats({ selfTests: selfTest.length, wrong: 0 });
  if (reviewStatus) reviewStatus.textContent = items.length ? ('已生成 ' + items.length + ' 题') : '无内容';
  if (!items.length) {
    reviewCards.innerHTML = '<div class="empty-panel">暂未从笔记中识别到自测题，可先在资料页生成资料笔记。</div>';
    return;
  }
  reviewCards.innerHTML = items.map(function(item) {
    return '<div class="review-card" data-review-type="' + escapeAttr(item.type) + '">' +
      '<div class="review-card-head"><span>' + escapeHtml(item.type) + '</span><em>' + escapeHtml(item.title) + '</em></div>' +
      '<p>' + escapeHtml(item.text) + '</p>' +
      '<div class="review-card-actions"><button data-review-mark="again">还不熟</button><button data-review-mark="known">已掌握</button></div>' +
    '</div>';
  }).join('');
  applyReviewFilter(reviewFilter);
}

async function refreshReviewPanel() {
  try {
    var state = await sendRuntimeMessage('GET_WORKFLOW_STATE');
    var notes = state?.noteFolder?.notes || [];
    var latest = notes[0] || {};
    if (latest.markdown) renderReviewCardsFromMarkdown(latest.markdown);
    else updateReviewStats({ flashcards: 0, selfTests: 0, wrong: 0 });
  } catch (_) {}
}

function setNotesComposeLoading(loading, message) {
  if (notesStatus) notesStatus.textContent = loading ? '整理中' : (message || '准备就绪');
  if (notesComposeBtn) {
    notesComposeBtn.disabled = !!loading;
    notesComposeBtn.classList.toggle('is-loading', !!loading);
    notesComposeBtn.innerHTML = loading
      ? '<i data-lucide="loader-circle"></i> 正在生成...'
      : '<i data-lucide="wand-sparkles"></i> 生成资料笔记';
  }
  if (notesPreview && loading) {
    notesPreview.classList.add('notes-generating');
    notesPreview.textContent = [
      '正在生成资料笔记...',
      '',
      '1. 汇总当前资料库内容',
      '2. 提炼页面主题、关键概念和学习目标',
      '3. 编排成可导出的学习笔记',
      '',
      '请稍等，生成完成后会自动显示在这里。'
    ].join('\n');
  } else if (notesPreview) {
    notesPreview.classList.remove('notes-generating');
  }
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

async function composeStudyNote() {
  setNotesComposeLoading(true);
  try {
    var res = await sendRuntimeMessage('COMPOSE_STUDY_NOTE');
    var noteObj = res.note || {};
    var note = res.markdown || noteObj.markdown || res.content || res.text || '已生成学习笔记。';
    if (notesPreview) notesPreview.textContent = note;
    renderNotesFolder(res.noteFolder || res.folder || res);
    setNotesComposeLoading(false, '已生成');
    showToast('学习笔记已生成', 'success', 2000);
  } catch (e) {
    setNotesComposeLoading(false, '生成失败');
    if (notesPreview) {
      notesPreview.textContent = '资料笔记生成失败：' + (e.message || '请检查网络、模型配置或资料内容后重试。');
    }
    showToast('生成失败：' + e.message, 'error', 3000);
  }
}

async function runSelectedSourceTaskChain(text) {
  var command = parseLearningAssetCommand(text);
  var sourceIds = activeTaskSourceIds();
  if (!command || !sourceIds.length) return false;

  hideStopBtn();
  var titles = sourceIds.slice(0, 3).map(sourceTitleById);
  var title = titles[0] || '已选学习资料';
  var lines = ['我会基于当前选中的资料继续处理：' + title];
  var latestNote = null;

  if (notesStatus) notesStatus.textContent = '处理中';

  if (command.summary || command.export || command.practice) {
    ChatView.appendStreamText('正在基于已选资料生成学习笔记...');
    var composed = await sendRuntimeMessage('COMPOSE_STUDY_NOTE', {
      sourceIds: sourceIds,
      title: title + ' 学习成果',
      goal: '请围绕用户上传或选中的资料生成学习成果，覆盖资料概览、核心要点、时间/要求/任务清单、学习价值、推荐平台与下一步、自测问题。不要生成数字人讲解脚本。'
    });
    latestNote = composed.note || {};
    renderNotesFolder(composed.noteFolder || composed.folder || composed);
    if (notesPreview) notesPreview.textContent = latestNote.markdown || composed.markdown || '已生成学习笔记。';
    lines.push('已生成资料总结和学习笔记。');
  }

  if (command.recommend) {
    ChatView.appendStreamText('正在联网搜索并推荐相关平台...');
    var query = title.replace(/\.(pdf|docx|pptx|md|txt)$/i, '') + ' 相关学习资源 平台';
    var searchRes = await sendRuntimeMessage('WEB_SEARCH_RESOURCES', { query: query });
    if (searchRes?.noteFolder) renderNotesFolder(searchRes.noteFolder);
    var recs = (searchRes?.recommendations || []).slice(0, 3);
    if (recs.length) {
      lines.push('推荐平台：');
      recs.forEach(function(item, index) {
        lines.push((index + 1) + '. ' + item.name + '：' + item.url);
      });
    } else {
      lines.push('暂未搜索到稳定的平台结果，可换一个更具体的关键词再试。');
    }
  }

  if (command.practice) {
    ChatView.appendStreamText('正在生成自测题...');
    var practice = latestNote?.markdown || '';
    if (!practice) {
      var practiceRes = await sendRuntimeMessage('COMPOSE_STUDY_NOTE', {
        sourceIds: sourceIds,
        title: title + ' 自测复习',
        goal: '请基于已选资料生成自测题，题目要围绕关键概念、时间节点、任务要求和应用场景。'
      });
      practice = practiceRes.note?.markdown || practiceRes.markdown || '';
      renderNotesFolder(practiceRes.noteFolder || practiceRes.folder || practiceRes);
    }
    renderPracticePreview(practice);
    renderReviewCardsFromMarkdown(practice);
    lines.push('已生成自测题，可到“复习”页查看。');
  }

  if (command.export) {
    lines.push('学习成果已准备好，可在“资料”页下载 Markdown、PDF 报告、Word 文档或汇报幻灯片。');
  }

  if (notesStatus) notesStatus.textContent = '已完成';
  ChatView.finishStreaming(lines.join('\n'), {
    action: 'describe',
    actionSuccess: true,
    context: {
      scope: chatContextScope?.value || 'custom-sources',
      sourceIds: sourceIds,
      customSourceIds: sourceIds
    }
  });
  refreshWorkbench();
  renderHistoryList();
  return true;
}

function answerGreetingWithCurrentTask(text) {
  if (!isGreetingText(text)) return false;
  var sourceIds = activeTaskSourceIds();
  if (!sourceIds.length) return false;
  hideStopBtn();
  var titles = sourceIds.slice(0, 2).map(sourceTitleById).join('、');
  ChatView.finishStreaming('你好，我已经记住当前学习任务：' + titles + '。你可以直接说“总结这份文件”“推荐相关平台”“生成自测题”或“导出学习成果”，我会基于这些已选资料继续处理。', {
    action: 'describe',
    actionSuccess: true,
    context: {
      scope: chatContextScope?.value || 'custom-sources',
      sourceIds: sourceIds,
      customSourceIds: sourceIds
    }
  });
  return true;
}

async function composePracticePreview() {
  if (notesStatus) notesStatus.textContent = '生成中';
  if (reviewStatus) reviewStatus.textContent = '生成中';
  try {
    var res = await sendRuntimeMessage('COMPOSE_STUDY_NOTE', { preview: 'practice' });
    var noteObj = res.note || {};
    var note = res.markdown || noteObj.markdown || res.content || res.text || '';
    renderPracticePreview(note);
    renderReviewCardsFromMarkdown(note);
    renderNotesFolder(res.noteFolder || res.folder || res);
    if (notesStatus) notesStatus.textContent = '已生成';
    if (reviewStatus && !note) reviewStatus.textContent = '未生成';
    showToast('自测题已生成', 'success', 2000);
  } catch (e) {
    if (notesStatus) notesStatus.textContent = '生成失败';
    if (reviewStatus) reviewStatus.textContent = '生成失败';
    showToast('自测题生成失败：' + e.message, 'error', 3000);
  }
}

async function deleteNoteSource(sourceId) {
  if (!sourceId) return;
  if (!confirm('确定删除这条资料吗？删除后工作台、资料页和问智引自选资料都会同步移除。')) return;
  if (notesStatus) notesStatus.textContent = '删除中';
  try {
    var res = await sendRuntimeMessage('DELETE_NOTE_SOURCE', { sourceId: sourceId });
    syncNoteFolderState(res.noteFolder || res.folder || res);
    if (notesStatus) notesStatus.textContent = '已删除';
    showToast('资料已删除', 'success', 1800);
  } catch (e) {
    if (notesStatus) notesStatus.textContent = '删除失败';
    showToast('删除失败：' + e.message, 'error', 3000);
  }
}

async function exportNoteMarkdown() {
  if (notesStatus) notesStatus.textContent = '导出中';
  try {
    var res = await sendRuntimeMessage('EXPORT_NOTE_MD');
    if (res.markdown && notesPreview) notesPreview.textContent = res.markdown;
    if (res.markdown) {
      var blob = new Blob([res.markdown], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = res.filename || ('智引学习笔记_' + Date.now() + '.md');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    if (notesStatus) notesStatus.textContent = '已导出';
    showToast('Markdown 已导出', 'success', 2500);
  } catch (e) {
    if (notesStatus) notesStatus.textContent = '导出失败';
    showToast('导出失败：' + e.message, 'error', 3000);
  }
}

function downloadTextFile(filename, content, mimeType) {
  var blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename || ('智引学习笔记_' + Date.now());
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadBase64File(filename, base64, mimeType) {
  var binary = atob(base64 || '');
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  var blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename || ('智引学习成果_' + Date.now());
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openPrintableHtml(filename, html) {
  var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var win = window.open(url, '_blank');
  setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
  if (!win) {
    downloadTextFile((filename || '智引学习报告.html').replace(/\.pdf$/i, '.html'), html, 'text/html;charset=utf-8');
    showToast('浏览器拦截了打印页，已改为下载 HTML 打印版', 'info', 3500);
  }
}

async function exportNoteWord() {
  if (notesStatus) notesStatus.textContent = '导出中';
  try {
    var res = await sendRuntimeMessage('EXPORT_NOTE_WORD');
    if (res.html) {
      downloadTextFile(res.filename || ('智引学习笔记_' + Date.now() + '.doc'), res.html, res.mimeType || 'application/msword;charset=utf-8');
    }
    if (notesStatus) notesStatus.textContent = '已导出';
    showToast('Word 兼容文档已导出', 'success', 2500);
  } catch (e) {
    if (notesStatus) notesStatus.textContent = '导出失败';
    showToast('Word 导出失败：' + e.message, 'error', 3000);
  }
}

async function exportNotePdfPage(payload) {
  if (notesStatus) notesStatus.textContent = '导出中';
  try {
    var res = await sendRuntimeMessage('EXPORT_NOTE_PDF_PAGE', payload || {});
    if (res.html) {
      openPrintableHtml(res.filename || ('智引学习报告_' + Date.now() + '.pdf'), res.html);
    } else if (res.base64) {
      downloadBase64File(res.filename || ('智引学习报告_' + Date.now() + '.pdf'), res.base64, res.mimeType || 'application/pdf');
    }
    if (notesStatus) notesStatus.textContent = '已导出';
    showToast(res.instruction || '已打开高质量 PDF 打印版', 'success', 3500);
  } catch (e) {
    if (notesStatus) notesStatus.textContent = '导出失败';
    showToast('PDF 导出失败：' + e.message, 'error', 3000);
  }
}

async function exportSourceGroupPdf(groupKey) {
  var sourceIds = sourceIdsForGroup(groupKey);
  if (!sourceIds.length) return;
  if (notesStatus) notesStatus.textContent = '编排中';
  try {
    var group = groupNoteSources(currentNoteSources).find(function(item) { return item.key === groupKey; });
    var title = (group?.label || '学习资料') + '报告';
    var composed = await sendRuntimeMessage('COMPOSE_STUDY_NOTE', {
      sourceIds: sourceIds,
      title: title,
      goal: '请把这个网站分组下所有已采集资料整合成一份总总结报告。需要覆盖本组访问过的所有页面/选区/视口内容，按资料概览、核心内容、共性主题、学习价值、学习路径、自测复习和下一步建议组织。不要生成数字人讲解脚本或演讲稿章节。'
    });
    var note = composed.note || {};
    if (notesPreview) notesPreview.textContent = note.markdown || composed.markdown || '已生成本组资料报告。';
    renderNotesFolder(composed.noteFolder || composed.folder || composed);
    await exportNotePdfPage({ noteId: note.id, markdown: note.markdown, title: note.title || title });
  } catch (e) {
    if (notesStatus) notesStatus.textContent = '导出失败';
    showToast('本组 PDF 导出失败：' + e.message, 'error', 3200);
  }
}

async function exportNoteAnki() {
  if (notesStatus) notesStatus.textContent = '导出中';
  try {
    var res = await sendRuntimeMessage('EXPORT_NOTE_ANKI');
    if (res.tsv) {
      downloadTextFile(res.filename || ('智引闪卡_' + Date.now() + '.tsv'), res.tsv, res.mimeType || 'text/tab-separated-values;charset=utf-8');
    }
    if (notesStatus) notesStatus.textContent = '已导出';
    showToast('Anki 闪卡 TSV 已导出', 'success', 2500);
  } catch (e) {
    if (notesStatus) notesStatus.textContent = '导出失败';
    showToast('Anki 导出失败：' + e.message, 'error', 3000);
  }
}

async function exportNotePptx() {
  if (notesStatus) notesStatus.textContent = '导出中';
  try {
    var res = await sendRuntimeMessage('EXPORT_NOTE_PPTX');
    if (res.base64) {
      downloadBase64File(res.filename || ('智引学习汇报_' + Date.now() + '.pptx'), res.base64, res.mimeType || 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    } else if (res.html) {
      downloadTextFile(res.filename || ('智引学习汇报_' + Date.now() + '-slides.html'), res.html, res.mimeType || 'text/html;charset=utf-8');
    }
    if (notesStatus) notesStatus.textContent = '已导出';
    showToast(res.instruction || 'PPTX 已导出', 'success', 3000);
  } catch (e) {
    if (notesStatus) notesStatus.textContent = '导出失败';
    showToast('PPTX 导出失败：' + e.message, 'error', 3000);
  }
}

async function clearNoteFolder() {
  if (!confirm('确定要清空资料夹吗？')) return;
  if (notesStatus) notesStatus.textContent = '清空中';
  try {
    await sendRuntimeMessage('CLEAR_NOTE_FOLDER');
    collapsedNoteGroups.clear();
    knownNoteGroups.clear();
    renderNotesFolder({});
    if (notesPreview) notesPreview.textContent = '资料夹已清空。';
    if (notesStatus) notesStatus.textContent = '已清空';
    showToast('资料夹已清空', 'success', 2000);
  } catch (e) {
    if (notesStatus) notesStatus.textContent = '清空失败';
    showToast('清空失败：' + e.message, 'error', 3000);
  }
}

async function runContestDemoFlow() {
  if (workbenchDemoRunBtn) workbenchDemoRunBtn.disabled = true;
  showToast('演示链路开始：采集页面 → 生成笔记 → 生成复习卡', 'info', 2500);
  try {
    await collectPageSource();
    switchTab('notes');
    await composeStudyNote();
    switchTab('review');
    await composePracticePreview();
    showToast('演示链路已完成，可展示资料、复习和下载成果', 'success', 3200);
  } catch (e) {
    showToast('演示链路中断：' + (e.message || '请检查当前页面和 API 设置'), 'error', 3500);
  } finally {
    if (workbenchDemoRunBtn) workbenchDemoRunBtn.disabled = false;
    refreshWorkbench().catch(function() {});
  }
}

function renderCollabTask(task) {
  currentCollabTask = task || null;
  var old = document.getElementById('collab-task-panel');
  if (old) old.remove();
  if (!task || !chatHeader) return;
  var panel = document.createElement('div');
  panel.id = 'collab-task-panel';
  panel.style.cssText = 'padding:8px 10px;border-bottom:1px solid var(--border);background:rgba(16,185,129,0.08);font-size:12px;color:var(--text-sec);';
  panel.innerHTML = '<div style="font-weight:600;color:var(--text);margin-bottom:4px;">协同任务：等待你选择</div>' +
    task.steps.map(function(step) {
      return '<div style="margin:2px 0;">[' + ChatView._escapeHtml(step.status) + '] ' +
        ChatView._escapeHtml(step.owner) + '：' + ChatView._escapeHtml(step.text) + '</div>';
    }).join('') +
    '<div style="display:flex;gap:6px;margin-top:6px;">' +
      '<input id="collab-choice-input" placeholder="输入你选择的平台或资源" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:12px;">' +
      '<button id="collab-choice-send" style="padding:6px 8px;background:#10b981;color:white;border-radius:6px;font-size:12px;">确认</button>' +
    '</div>';
  chatHeader.parentNode.insertBefore(panel, chatHeader.nextSibling);
  panel.querySelector('#collab-choice-send').addEventListener('click', function() {
    var input = panel.querySelector('#collab-choice-input');
    var choice = input.value.trim();
    if (!choice) return;
    chrome.runtime.sendMessage({ type: 'COLLAB_USER_CHOICE', payload: { choice: choice } }).then(function() {
      showToast('已记录你的选择，可以继续让智引细化学习计划', 'success', 2500);
      panel.remove();
      currentCollabTask = null;
    ChatView.addUserMessage('我选择：' + choice, { context: pendingChatContext || {} });
      ChatView.startStreaming();
      _skipNextUserMsg = true;
      doSendText('我选择：' + choice + '，请继续细化学习计划');
    }).catch(function() {
      showToast('协同任务状态更新失败', 'error', 2500);
    });
  });
}

// ── 停止生成按钮 ──
var chatStopBtn = document.getElementById('chat-stop-btn');
var chatHeader = document.getElementById('chat-header');

// 处理计时器
var _processingTimerInterval = null;
var _processingStartTime = null;

function showProcessingTimer() {
  _processingStartTime = Date.now();
  var timerEl = document.getElementById('processing-timer');
  if (!timerEl) {
    timerEl = document.createElement('span');
    timerEl.id = 'processing-timer';
    timerEl.style.cssText = 'font-size:11px;color:var(--text-mute);margin-left:auto;padding:2px 6px;border-radius:4px;background:rgba(59,130,246,0.08);';
    chatHeader.appendChild(timerEl);
  }
  timerEl.style.display = '';
  updateProcessingTimer();
  if (_processingTimerInterval) clearInterval(_processingTimerInterval);
  _processingTimerInterval = setInterval(updateProcessingTimer, 1000);
}

function updateProcessingTimer() {
  var el = document.getElementById('processing-timer');
  if (!el || !_processingStartTime) return;
  var sec = Math.floor((Date.now() - _processingStartTime) / 1000);
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  el.textContent = '⏳ ' + m + ':' + (s < 10 ? '0' : '') + s;
}

function hideProcessingTimer() {
  if (_processingTimerInterval) { clearInterval(_processingTimerInterval); _processingTimerInterval = null; }
  var el = document.getElementById('processing-timer');
  if (el) el.style.display = 'none';
  _processingStartTime = null;
}

function showStopBtn() {
  chatStopBtn.style.display = '';
  showProcessingTimer();
}
function hideStopBtn() {
  chatStopBtn.style.display = 'none';
  hideProcessingTimer();
}

function setChatMicIcon(recording) {
  if (!chatMicBtn) return;
  chatMicBtn.innerHTML = recording
    ? '<i data-lucide="radio" style="width:16px;height:16px;display:block"></i>'
    : '<i data-lucide="mic" style="width:16px;height:16px;display:block"></i>';
  if (typeof lucide !== 'undefined' && lucide.createIcons) { lucide.createIcons(); }
}

function stopLocalTts() {
  try { if (synth) synth.cancel(); } catch (_) {}
  if (_currentTtsAudio) {
    try { _currentTtsAudio.pause(); } catch (_) {}
    try { _currentTtsAudio.remove(); } catch (_) {}
    _currentTtsAudio = null;
  }
  currentUtterance = null;
}

async function interruptCurrentOutput(showStopped) {
  stopLocalTts();
  hideStopBtn();
  chrome.runtime.sendMessage({ type: 'STOP_STREAM' }).catch(function() {});
  chrome.runtime.sendMessage({ type: 'STOP_TTS' }).catch(function() {});
  _streamingActive = false;
  if (showStopped) {
    ChatView.finishStreaming(
      currentLang === 'en' ? '⏹️ Stopped' : '⏹️ 已停止',
      { action: 'describe', actionSuccess: false }
    );
  }
  setUIState('idle', currentLang === 'en' ? 'Ready' : '准备就绪');
}

chatStopBtn.addEventListener('click', function() {
  interruptCurrentOutput(true);
});

// ── 录音控制（导航 + 对话 Tab 共用） ──
function startRecording() {
  if (isRecording) return;
  interruptCurrentOutput(false);
  isRecording = true;
  var text = currentLang === 'en' ? '🔴 Release to send' : '🔴 松开发送';
  micBtn.textContent = text;
  setChatMicIcon(true);
  micBtn.classList.add('recording');
  chatMicBtn.classList.add('recording');
  setUIState('listening', currentLang === 'en' ? '🎤 Listening...' : '🎤 正在聆听...');

  chrome.runtime.sendMessage({ type: 'CTRL_START_REC' }).then(function(res) {
    if (res && res.error === 'BUSY') {
      isRecording = false;
      var idleText = currentLang === 'en' ? '🎤 Hold to speak' : '🎤 按住说话';
      micBtn.textContent = idleText;
      setChatMicIcon(false);
      micBtn.classList.remove('recording');
      chatMicBtn.classList.remove('recording');
      setUIState('idle', statusMsg('processing', currentLang));
    }
  }).catch(function() {
    isRecording = false;
    var idleText = currentLang === 'en' ? '🎤 Hold to speak' : '🎤 按住说话';
    micBtn.textContent = idleText;
    setChatMicIcon(false);
    micBtn.classList.remove('recording');
    chatMicBtn.classList.remove('recording');
    setUIState('idle', currentLang === 'en' ? '⚠️ Communication failed' : '⚠️ 通信失败，请重试');
  });
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  var idleText = currentLang === 'en' ? '🎤 Hold to speak' : '🎤 按住说话';
  micBtn.textContent = idleText;
  setChatMicIcon(false);
  micBtn.classList.remove('recording');
  chatMicBtn.classList.remove('recording');
  setUIState('thinking', currentLang === 'en' ? '🤔 Recognizing...' : '🤔 正在识别语音...');
  chrome.runtime.sendMessage({ type: 'CTRL_STOP_REC' }).catch(function() {});
}

// ── 文字输入（导航 + 对话 Tab 共用） ──
function sendTextInput(text) {
  if (!text) return;
  interruptCurrentOutput(false);
  setUIState('thinking', currentLang === 'en' ? '🤔 Analyzing...' : '🤔 正在分析...');
  doSendText(text);
}

function doSendText(text) {
  _streamingActive = true;
  showStopBtn();
  if (answerGreetingWithCurrentTask(text)) {
    _streamingActive = false;
    return;
  }
  var selectedScope = chatContextScope?.value || 'current-page';
  var explicitPageIntent = hasExplicitPageIntent(text) && !hasExplicitFileIntent(text);
  var scope = explicitPageIntent ? 'current-page' : selectedScope;
  if (explicitPageIntent && chatContextScope && chatContextScope.value !== 'current-page') {
    chatContextScope.value = 'current-page';
    updateChatContextCard();
  }
  var localTask = parseLearningAssetCommand(text);
  if (scope !== 'current-page' && localTask && activeTaskSourceIds().length) {
    runSelectedSourceTaskChain(text).catch(function(e) {
      hideStopBtn();
      _streamingActive = false;
      ChatView.finishStreaming('处理当前资料任务失败：' + (e && e.message || '未知错误'), {
        action: 'describe',
        actionSuccess: false
      });
      showToast('资料任务处理失败：' + (e && e.message || '未知错误'), 'error', 3000);
    }).finally(function() {
      _streamingActive = false;
    });
    return;
  }
  var customSourceIds = sourceIdsForChatScope('custom-sources');
  if (scope === 'custom-sources' && !customSourceIds.length) {
    hideStopBtn();
    _streamingActive = false;
    var warning = '请先在“自选资料”里选择至少 1 条资料，或切换到当前页面/全部资料。';
    ChatView.finishStreaming(warning, { action: 'describe', actionSuccess: false });
    setUIState('idle', warning);
    return;
  }
  pendingChatContext = {
    scope: scope,
    groupKey: currentGroupKeyForChat(),
    sourceIds: sourceIdsForChatScope(scope),
    customSourceIds: customSourceIds
  };
  var conv = ChatStore.getCurrentConv();
  if (conv) {
    ChatStore.updateConversationContext(conv.id, pendingChatContext).catch(function() {});
  }

  chrome.runtime.sendMessage({
    type: 'ASR_RESULT',
    payload: {
      transcript: text,
      contextScope: scope,
      contextGroupKey: currentGroupKeyForChat(),
      contextSourceIds: sourceIdsForChatScope(scope),
      customSourceIds: customSourceIds
    }
  }).then(function(response) {
    if (response?.error) {
      var msgs = {
        'NO_API_KEY': currentLang === 'en' ? '请先填入 DeepSeek API Key（设置区域）' : '请先填入 DeepSeek API Key（设置区域）',
        'BUSY': currentLang === 'en' ? 'Processing' : '正在处理中',
        'NO_TAB': currentLang === 'en' ? 'Cannot access current page' : '无法获取当前页面',
        'DOM_DISTILL_FAILED': currentLang === 'en' ? 'Page analysis failed' : '页面分析失败'
      };
      hideStopBtn();
      _streamingActive = false;
      var errText = '⚠️ ' + (msgs[response.error] || response.speech || response.error);
      ChatView.finishStreaming(errText, { action: 'describe', actionSuccess: false });
      setUIState('idle', errText);
    }
  }).catch(function() {
    hideStopBtn();
    _streamingActive = false;
    var errText = '⚠️ 通信失败，请刷新扩展';
    ChatView.finishStreaming(errText, { action: 'describe', actionSuccess: false });
    setUIState('idle', errText);
  });
}

// ── 对话视图 ──

// 暴露给 ChatView 的重试函数
window.__retrySend = function(text) {
  if (!text) return;
  setUIState('thinking', currentLang === 'en' ? '🤔 Retrying...' : '🤔 正在重试...');
  doSendText(text);
};

async function initChatView() {
  await ChatView.init(chatMessages);

  // 欢迎页提示点击 → 发送查询（防重复）
  ChatView._onWelcomeTip = function(query) {
    sendQuickQuery(query);
  };

  // 新建对话
  chatNewBtn.addEventListener('click', function() {
    ChatView.showWelcome();
    ChatStore._currentConvId = null;
    chatConvTitle.textContent = '新对话';
    switchTab('chat');
  });

  if (chatHistoryBtn && chatRecentPanel) {
    chatHistoryBtn.addEventListener('click', function() {
      var collapsed = chatRecentPanel.classList.toggle('collapsed');
      if (chatRecentToggleBtn) chatRecentToggleBtn.textContent = '收起';
      chatHistoryBtn.classList.toggle('active', !collapsed);
      if (!collapsed) renderHistoryList();
    });
  }

  if (chatShowWidgetBtn) {
    chatShowWidgetBtn.addEventListener('click', function() {
      sendToolAction('show-widget');
    });
  }

  // 语音播报开关
  chrome.storage.local.get(['muted'], function(d) {
    if (d.muted) {
      chatMuteBtn.innerHTML = '<i data-lucide="volume-x" style="width:11px;height:11px;display:block"></i>';
      chatMuteBtn.classList.add('muted');
    }
  });
  chatMuteBtn.addEventListener('click', function() {
    var isMuted = chatMuteBtn.classList.toggle('muted');
    chatMuteBtn.innerHTML = isMuted ? '<i data-lucide="volume-x" style="width:11px;height:11px;display:block"></i>' : '<i data-lucide="volume-2" style="width:11px;height:11px;display:block"></i>';
    if (isMuted) stopLocalTts();
    chrome.storage.local.set({ muted: isMuted }).catch(function() {});
    chrome.runtime.sendMessage({ type: 'SET_MUTED', payload: { muted: isMuted } }).catch(function() {});
    showToast(isMuted ? '已关闭语音播报' : '已开启语音播报', 'success', 1300);
    if (typeof lucide !== 'undefined' && lucide.createIcons) { lucide.createIcons(); }
  });

  // 导出对话
  var chatExportBtn = document.getElementById('chat-export-btn');
  if (chatExportBtn) chatExportBtn.addEventListener('click', function() {
    var conv = ChatStore.getCurrentConv();
    if (!conv) {
      showToast(currentLang === 'en' ? 'No conversation to export' : '没有可导出的对话', 'info', 2000);
      return;
    }
    ChatView.exportConversation(conv.id).then(function(success) {
      if (success) {
        showToast(currentLang === 'en' ? 'Conversation exported' : '对话已导出', 'success', 2000);
      } else {
        showToast(currentLang === 'en' ? 'Export failed' : '导出失败', 'error', 2000);
      }
    });
  });

  // 快捷操作按钮（防重复）
  document.querySelectorAll('.quick-action').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (btn.classList.contains('tool-action')) {
        sendToolAction(btn.dataset.tool);
        return;
      }
      var query = btn.dataset.query;
      sendQuickQuery(query);
    });
  });

  document.querySelectorAll('[data-workbench-query]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      sendQuickQuery(btn.dataset.workbenchQuery);
    });
  });

  document.querySelectorAll('.action-tile.tool-action').forEach(function(btn) {
    btn.addEventListener('click', function() {
      sendToolAction(btn.dataset.tool);
    });
  });

  document.querySelectorAll('.utility-action.tool-action').forEach(function(btn) {
    btn.addEventListener('click', function() {
      sendToolAction(btn.dataset.tool);
    });
  });

  if (workbenchSuggestionsList) {
    workbenchSuggestionsList.addEventListener('click', function(e) {
      var btn = e.target.closest('.suggestion-item');
      if (!btn) return;
      var action = btn.dataset.action || '';
      var title = btn.dataset.title || btn.textContent.trim();
      if (action === 'COLLECT_PAGE_SOURCE') {
        collectPageSource().then(refreshWorkbench);
      } else if (action === 'COMPOSE_STUDY_NOTE') {
        switchTab('notes');
        composeStudyNote().then(refreshWorkbench);
      } else if (action === 'START_REVIEW_DRILL' || action === 'EXPORT_NOTE_ANKI') {
        switchTab('review');
        composePracticePreview();
      } else if (action === 'EXPORT_NOTE_PPTX') {
        switchTab('notes');
        exportNotePptx();
      } else if (action === 'START_LEARNING_PLAN') {
        sendQuickQuery('请基于当前学习资料生成本科生可执行的学习路径和资源推荐');
      } else {
        sendQuickQuery(title || '请给我当前页面的下一步学习建议');
      }
    });
  }

  if (reviewGenerateBtn) {
    reviewGenerateBtn.addEventListener('click', function() {
      composePracticePreview();
    });
  }
  if (reviewCards) {
    reviewCards.addEventListener('click', function(e) {
      var mark = e.target.closest('[data-review-mark]');
      if (!mark) return;
      var card = mark.closest('.review-card');
      if (!card || card.dataset.reviewState) return;
      var nextState = mark.dataset.reviewMark === 'known' ? 'known' : 'again';
      mark.classList.add('review-action-selected');
      card.dataset.reviewState = nextState;
      card.classList.toggle('review-known', nextState === 'known');
      card.classList.toggle('review-again', nextState === 'again');
      window.setTimeout(function() {
        card.classList.add('review-removing');
      }, 120);
      window.setTimeout(function() {
        applyReviewFilter(reviewFilter);
      }, 320);
      showToast(nextState === 'known' ? '已掌握，本题已移出今日自测' : '已加入错题回看，本题已移出今日自测', 'success', 1800);
    });
  }

  document.querySelectorAll('[data-review-filter]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      applyReviewFilter(btn.dataset.reviewFilter || 'all');
    });
  });

  if (chatMoreBtn && chatMoreMenu) {
    chatMoreBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var open = chatMoreMenu.classList.toggle('open');
      chatMoreBtn.classList.toggle('active', open);
      if (typeof lucide !== 'undefined' && lucide.createIcons) { lucide.createIcons(); }
    });
    document.addEventListener('click', function(e) {
      if (!chatMoreMenu.classList.contains('open')) return;
      if (e.target.closest('#chat-more-menu') || e.target.closest('#chat-more-btn')) return;
      chatMoreMenu.classList.remove('open');
      chatMoreBtn.classList.remove('active');
    });
  }

  if (chatUploadFileBtn && chatFileInput) {
    chatUploadFileBtn.addEventListener('click', function() {
      chatMoreMenu?.classList.remove('open');
      chatMoreBtn?.classList.remove('active');
      chatFileInput.click();
    });
    chatFileInput.addEventListener('change', function() {
      var file = chatFileInput.files && chatFileInput.files[0];
      chatFileInput.value = '';
      if (!file) return;
      collectFileSource(file).then(function() {
        renderHistoryList();
        refreshWorkbench();
      }).catch(function(e) {
        if (notesStatus) notesStatus.textContent = '导入失败';
        ChatView.finishStreaming('文件导入失败：' + (e && e.message || '未知错误'), {
          action: 'describe',
          actionSuccess: false
        });
        showToast('文件导入失败：' + (e && e.message || '未知错误'), 'error', 3000);
      });
    });
  }

  if (chatWebSearchBtn) {
    chatWebSearchBtn.addEventListener('click', function() {
      chatMoreMenu?.classList.remove('open');
      chatMoreBtn?.classList.remove('active');
      runWebSearch().then(function() {
        renderHistoryList();
        refreshWorkbench();
      }).catch(function(e) {
        if (notesStatus) notesStatus.textContent = '搜索失败';
        showToast('联网搜索失败：' + (e && e.message || '未知错误'), 'error', 3000);
      });
    });
  }

  if (chatRecommendPlatformBtn) {
    chatRecommendPlatformBtn.addEventListener('click', function() {
      chatMoreMenu?.classList.remove('open');
      chatMoreBtn?.classList.remove('active');
      recommendPlatformsFromCurrentContext().then(function() {
        renderHistoryList();
        refreshWorkbench();
      }).catch(function(e) {
        if (notesStatus) notesStatus.textContent = '推荐失败';
        showToast('推荐平台失败：' + (e && e.message || '未知错误'), 'error', 3000);
      });
    });
  }

  if (chatAddManualBtn) {
    chatAddManualBtn.addEventListener('click', function() {
      chatMoreMenu?.classList.remove('open');
      chatMoreBtn?.classList.remove('active');
      collectManualSource().then(function() {
        refreshWorkbench();
      });
    });
  }

  var demoScenarioSelect = document.getElementById('demo-scenario-select');
  if (demoScenarioSelect) {
    demoScenarioSelect.addEventListener('change', function() {
      var query = demoScenarioSelect.value;
      demoScenarioSelect.value = '';
      sendQuickQuery(query);
    });
  }

  // 发送文本（防重复）
  chatSendBtn.addEventListener('click', function() {
    var text = chatTextInput.value.trim();
    if (!text) return;
    interruptCurrentOutput(false);
    chatTextInput.value = '';
    chatTextInput.style.height = 'auto';
    // 立即显示用户消息 + AI 打字指示器（不等 SW 来回，提高响应感）
    ChatView.addUserMessage(text, { context: {
      scope: chatContextScope?.value || 'current-page',
      groupKey: currentGroupKeyForChat(),
      sourceIds: sourceIdsForChatScope(chatContextScope?.value || 'current-page')
    } });
    ChatView.startStreaming();
    _skipNextUserMsg = true;
    setUIState('thinking', currentLang === 'en' ? '🤔 Analyzing...' : '🤔 正在分析...');
    doSendText(text);
  });

  chatTextInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatSendBtn.click();
    }
  });

  // 自动调整 textarea 高度
  chatTextInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // 对话 Tab 的麦克风
  chatMicBtn.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    startRecording();
  });
  chatMicBtn.addEventListener('pointerup', function(e) {
    e.preventDefault();
    stopRecording();
  });
  chatMicBtn.addEventListener('pointerleave', function(e) {
    if (isRecording) stopRecording();
  });
}

// ── 历史记录 ──

async function renderHistoryList() {
  await ChatStore.load();
  var conversations = ChatStore._conversations;
  var query = historySearchInput.value.trim().toLowerCase();

  if (query) {
    // 先按标题 / 站点搜索
    var matched = conversations.filter(function(c) {
      return c.title.toLowerCase().indexOf(query) !== -1 ||
        (c.site && c.site.toLowerCase().indexOf(query) !== -1);
    });
    // 标题匹配不足 20 个时，补充搜索消息内容（最多搜索前 100 条消息）
    if (matched.length < 20) {
      var titleMatchedIds = matched.map(function(c) { return c.id; });
      for (var i = 0; i < conversations.length && matched.length < 20; i++) {
        var conv = conversations[i];
        if (titleMatchedIds.indexOf(conv.id) !== -1) continue;
        try {
          var msgs = await ChatStore.loadMessages(conv.id);
          var found = msgs.slice(0, 100).some(function(m) {
            return m.content && m.content.toLowerCase().indexOf(query) !== -1;
          });
          if (found) matched.push(conv);
        } catch (_) {}
      }
    }
    conversations = matched;
  }

  if (conversations.length === 0) {
    historyList.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-mute);font-size:13px;">' +
      (query ? '未找到匹配的对话' : '暂无对话记录') + '</div>';
    return;
  }

  historyList.innerHTML = '';
  conversations.forEach(function(conv) {
    var item = document.createElement('div');
    item.className = 'history-item';
    if (conv.id === ChatStore._currentConvId) item.classList.add('active');

    var date = new Date(conv.createdAt);
    var dateStr = date.toLocaleDateString(currentLang === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    item.innerHTML =
      '<div class="history-item-info">' +
        '<div class="history-item-title">' + ChatView._escapeHtml(conv.title) + '</div>' +
        '<div class="history-item-meta">' + ChatView._escapeHtml(dateStr) +
          (conv.site ? ' · ' + ChatView._escapeHtml(conv.site) : '') +
          ' · ' + conv.msgCount + ' 条消息' +
          ((conv.sourceIds || []).length ? ' · ' + (conv.sourceIds || []).length + ' 条资料' : '') +
          ((conv.files || []).length ? ' · ' + (conv.files || []).length + ' 个文件' : '') +
          ((conv.searchResults || []).length ? ' · ' + (conv.searchResults || []).length + ' 条搜索' : '') +
          '</div>' +
      '</div>' +
      '<div class="history-item-actions">' +
        '<button class="history-item-menu" data-id="' + conv.id + '">⋮</button>' +
        '<div class="history-menu-popup" data-id="' + conv.id + '">' +
          '<button class="history-menu-rename" data-id="' + conv.id + '">✏️ 修改名称</button>' +
          '<button class="history-menu-delete" data-id="' + conv.id + '">🗑 删除</button>' +
        '</div>' +
      '</div>';

    item.addEventListener('click', function(e) {
      if (e.target.closest('.history-item-actions')) return;
      ChatView.switchConversation(conv.id).then(function() {
        switchTab('chat');
      });
    });

    historyList.appendChild(item);
  });

  // 点击 ⋮ 切换弹出菜单
  if (!historyDocClickBound) {
    document.addEventListener('click', function(e) {
      // 点击其他地方时关闭所有菜单
      if (!e.target.closest('.history-item-actions')) {
        document.querySelectorAll('.history-menu-popup').forEach(function(p) {
          p.classList.remove('open');
        });
      }
    });
    historyDocClickBound = true;
  }

  historyList.querySelectorAll('.history-item-menu').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var popup = btn.parentNode.querySelector('.history-menu-popup');
      if (!popup) return;
      // 关闭其他菜单
      document.querySelectorAll('.history-menu-popup.open').forEach(function(p) {
        if (p !== popup) p.classList.remove('open');
      });
      popup.classList.toggle('open');
    });
  });

  // 修改名称
  historyList.querySelectorAll('.history-menu-rename').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var popup = btn.closest('.history-menu-popup');
      if (popup) popup.classList.remove('open');

      var conv = ChatStore._conversations.find(function(c) { return c.id === btn.dataset.id; });
      if (!conv) return;
      var newTitle = prompt('请输入新的对话名称：', conv.title);
      if (newTitle && newTitle.trim()) {
        ChatStore.setConvTitle(btn.dataset.id, newTitle.trim()).then(function() {
          renderHistoryList();
        });
      }
    });
  });

  // 删除（带确认）
  historyList.querySelectorAll('.history-menu-delete').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('确定要删除这条对话吗？此操作不可恢复。')) {
        ChatStore.deleteConversation(btn.dataset.id).then(function() {
          renderHistoryList();
        });
      }
    });
  });
}

historySearchInput.addEventListener('input', function() {
  renderHistoryList();
});

historyClearBtn.addEventListener('click', async function() {
  await ChatStore.clearAll();
  ChatView.showWelcome();
  chatConvTitle.textContent = '新对话';
  renderHistoryList();
});

// ── UI 状态（导航 Tab + 对话 Tab） ──
function setUIState(state, text) {
  animState = state;
  statusDot.className = state;
  if (text) statusText.textContent = text;
  avatarContainer.className = state;
}

// ── 消息监听（SW → Side Panel） ──
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'TTS_SPEAK') {
    // 优先用 SiliconFlow API 播高质量 AI 语音，失败再 fallback 到 system speech
    speakSiliconFlow(msg.payload.text).then(function() {
      sendResponse({ ok: true });
    }).catch(function() {
      try {
        speakLocal(msg.payload.text);
        sendResponse({ ok: true, fallback: true });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message || 'TTS_FAILED' });
      }
    });
    return true;
  }

  if (msg.type === 'TTS_STOP') {
    stopLocalTts();
    setUIState('idle', currentLang === 'en' ? 'Ready' : '准备就绪');
    return;
  }

  if (msg.type === 'ANIM_SET_STATE') {
    var text = msg.payload.state === 'idle' ? statusMsg('ready', currentLang) : null;
    setUIState(msg.payload.state, text);
    return;
  }

  if (msg.type === 'STATUS_TEXT') {
    isRecording = false;
    var idleText = currentLang === 'en' ? '🎤 Hold to speak' : '🎤 按住说话';
    micBtn.textContent = idleText;
    setChatMicIcon(false);
    micBtn.classList.remove('recording');
    chatMicBtn.classList.remove('recording');
    setUIState(msg.payload.state, msg.payload.text);
    // 错误状态显示 toast
    if (msg.payload.text && (msg.payload.text.includes('⚠️') || msg.payload.state === 'error')) {
      showToast(msg.payload.text, 'error');
    }
    return;
  }

  // ── 从侧边栏转发 ASR（绕过 SW 代理限制）──
  if (msg.type === 'TRANSCRIBE_AUDIO') {
    (async function() {
      try {
        var t = await getTranscribe();
        var result = await t(msg.payload.audio, msg.payload.mimeType, msg.payload.apiKey, msg.payload.endpoint, msg.payload.model);
        sendResponse({ text: result.text });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  // ── 对话流式消息 ──
  if (msg.type === 'CHAT_STREAM') {
    var p = msg.payload;

    if (p.isPartial && !p.text) {
      // 开始流式，清理旧进度条
      var oldBar = document.getElementById('task-progress-bar');
      if (oldBar) oldBar.remove();
      ChatView.startStreaming();
      if (currentTab !== 'chat') switchTab('chat');
    } else if (p.isPartial && p.text) {
      // 流式过程中
      ChatView.appendStreamText(p.text);
    } else if (!p.isPartial) {
      // 流式结束
      hideStopBtn();
      ChatView.finishStreaming(p.text, { action: p.action, actionSuccess: p.actionSuccess, context: pendingChatContext || {} });
      pendingChatContext = null;
      _streamingActive = false;
    }
    return;
  }

  if (msg.type === 'CHAT_USER_INPUT') {
    // 去重：聊天框直接输入时本地已添加，跳过 SW 回传
    if (_skipNextUserMsg) { _skipNextUserMsg = false; return; }
    ChatView.addUserMessage(msg.payload.text);
    return;
  }

  if (msg.type === 'TASK_PROGRESS') {
    // 任务进度提示：在最后一条助手消息后追加进度文本
    var lastMsg = chatMessages.querySelector('.chat-msg.assistant:last-child');
    var progBar = document.getElementById('task-progress-bar');
    if (!progBar) {
      progBar = document.createElement('div');
      progBar.id = 'task-progress-bar';
      progBar.className = 'chat-task-progress';
      if (lastMsg && lastMsg.parentNode) {
        lastMsg.parentNode.insertBefore(progBar, lastMsg.nextSibling);
      } else {
        chatMessages.appendChild(progBar);
      }
    }
    if (msg.payload.finished) {
      progBar.textContent = '✅ ' + msg.payload.text;
      progBar.classList.add('done');
      setTimeout(function() { if (progBar) progBar.remove(); }, 3000);
    } else {
      progBar.textContent = msg.payload.text;
      progBar.classList.remove('done');
    }
    return;
  }

  if (msg.type === 'CHAT_ACTION') {
    // 更新已存在的助手消息的操作结果
    var el = chatMessages.querySelector('.chat-msg.assistant:last-child');
    if (el) {
      var existing = el.querySelector('.chat-action-badge');
      if (existing) existing.remove();
      var bubble = el.querySelector('.chat-bubble');
      if (bubble) {
        var icon = msg.payload.actionSuccess ? '✅' : '⚠️';
        var labels = {
          highlight: msg.payload.actionSuccess ? '已标注位置' : '标注失败',
          click: '已点击', input: '已填入', scroll: '已滚动', describe: '回答完毕'
        };
        var badge = document.createElement('span');
        badge.className = 'chat-action-badge';
        badge.textContent = icon + ' ' + (labels[msg.payload.action] || '已完成');
        bubble.appendChild(badge);
      }
    }
    // 更新持久化
    var conv = ChatStore.getCurrentConv();
    if (conv) {
      ChatStore.updateLastAssistantMessage(conv.id, msg.payload.text || '', {
        action: msg.payload.action, actionSuccess: msg.payload.actionSuccess
      }).catch(function() {});
    }
    return;
  }
});

// ── TTS 本地播放 ──
/** 用 SiliconFlow CosyVoice API 播放高质量 AI 语音 */
var _currentTtsAudio = null;

async function speakSiliconFlow(text) {
  if (!text) return;
  // 从 storage 读取 API Key
  var data = await chrome.storage.local.get('asrApiKey');
  var apiKey = data.asrApiKey || '';
  if (!apiKey) throw new Error('NO_API_KEY');

  setUIState('speaking', '🔊 正在合成语音...');

  var res = await fetch('https://api.siliconflow.cn/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'FunAudioLLM/CosyVoice2-0.5B',
      input: text,
      voice: 'FunAudioLLM/CosyVoice2-0.5B:claire',
      response_format: 'mp3'
    })
  });

  if (!res.ok) throw new Error('HTTP_' + res.status);

  var blob = await res.blob();
  var url = URL.createObjectURL(blob);

  return new Promise(function(resolve, reject) {
    // 取消之前的 TTS 音频
    if (_currentTtsAudio) {
      _currentTtsAudio.pause();
      _currentTtsAudio.remove();
      _currentTtsAudio = null;
    }

    var audio = new Audio(url);
    _currentTtsAudio = audio;
    audio.volume = 0.9;

    audio.onended = function() {
      URL.revokeObjectURL(url);
      _currentTtsAudio = null;
      setUIState('idle', statusMsg('ready', currentLang));
      resolve();
    };
    audio.onerror = function() {
      URL.revokeObjectURL(url);
      _currentTtsAudio = null;
      reject(new Error('PLAY_FAILED'));
    };
    audio.play().then(function() {
      setUIState('speaking', '🔊 ' + Array.from(text).slice(0, 30).join(''));
    }).catch(function(e) {
      URL.revokeObjectURL(url);
      _currentTtsAudio = null;
      reject(e);
    });
  });
}

function speakLocal(text) {
  if (!synth) return;
  synth.cancel();
  var u = new SpeechSynthesisUtterance(text);
  var isEn = !/[一-鿿]/.test(text);
  u.lang = isEn ? 'en-US' : 'zh-CN';
  u.rate = isEn ? 0.82 : 0.88;
  u.pitch = isEn ? 1.0 : 1.05;
  u.volume = 1.0;
  var voices = cachedVoices.length > 0 ? cachedVoices : synth.getVoices();
  var preferred = isEn
    ? voices.find(function(v) { return /Samantha|Karen|Alex|Daniel/i.test(v.name) && v.lang.startsWith('en'); })
      || voices.find(function(v) { return v.lang.startsWith('en'); })
    : voices.find(function(v) { return /Tingting|Sin-Ji|Mei-Jia|Mei-Ling/i.test(v.name); })
      || voices.find(function(v) { return v.lang.startsWith('zh-CN'); })
      || voices.find(function(v) { return v.lang.startsWith('zh'); });
  if (preferred) u.voice = preferred;
  u.onstart = function() { setUIState('speaking', '🔊 ' + Array.from(text).slice(0, 30).join('')); };
  u.onend = function() { setUIState('idle', statusMsg('ready', currentLang)); currentUtterance = null; };
  u.onerror = function() { setUIState('idle', currentLang === 'en' ? 'Ready' : '准备就绪'); currentUtterance = null; };
  currentUtterance = u;
  synth.speak(u);
}

if (synth) {
  cachedVoices = synth.getVoices();
  synth.onvoiceschanged = function() { cachedVoices = synth.getVoices(); };
}

// ── 导航 Tab UI 事件（原逻辑保持不变） ──
micBtn.addEventListener('pointerdown', function(e) {
  e.preventDefault();
  micBtn.setPointerCapture(e.pointerId);
  startRecording();
});

micBtn.addEventListener('pointerup', function(e) {
  e.preventDefault();
  stopRecording();
});

micBtn.addEventListener('pointerleave', function(e) {
  if (isRecording) stopRecording();
});

micBtn.addEventListener('touchstart', function(e) {
  e.preventDefault();
  startRecording();
}, { passive: false });

micBtn.addEventListener('touchend', function(e) {
  e.preventDefault();
  stopRecording();
});

textInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    if (_streamingActive) return;
    var text = textInput.value.trim();
    if (!text) return;
    textInput.value = '';
    ChatView.addUserMessage(text, { context: {
      scope: chatContextScope?.value || 'current-page',
      groupKey: currentGroupKeyForChat(),
      sourceIds: sourceIdsForChatScope(chatContextScope?.value || 'current-page')
    } });
    _skipNextUserMsg = true;
    sendTextInput(text);
  }
});

saveKeyBtn.addEventListener('click', async function() {
  var key = apiKeyInput.value.trim();
  if (!key) return;
  try {
    var res = await chrome.runtime.sendMessage({ type: 'SET_API_KEY', payload: { key: key } });
    setUIState('idle', res.message || statusMsg('keySaved', currentLang));
    apiKeyInput.value = '';
  } catch (_) {
    setUIState('idle', statusMsg('saveFailed', currentLang));
  }
});

modelSelect.addEventListener('change', function() {
  chrome.runtime.sendMessage({ type: 'SET_MODEL', payload: { model: modelSelect.value } });
});

asrModelSelect.addEventListener('change', function() {
  chrome.runtime.sendMessage({ type: 'SET_ASR_MODEL', payload: { model: asrModelSelect.value } });
});

saveAsrBtn.addEventListener('click', async function() {
  var key = asrKeyInput.value.trim();
  var endpoint = asrEndpointInput.value.trim();
  if (!key && !endpoint) return;
  try {
    var res = await chrome.runtime.sendMessage({
      type: 'SET_ASR_CONFIG',
      payload: { key: key, endpoint: endpoint }
    });
    setUIState('idle', res.message || statusMsg('asrSaved', currentLang));
    asrKeyInput.value = '';
    asrEndpointInput.value = '';
  } catch (_) {
    setUIState('idle', statusMsg('saveFailed', currentLang));
  }
});

// ── 初始加载 ──
chrome.runtime.sendMessage({ type: 'GET_STATE', payload: {} }).then(function(res) {
  if (res?.language) currentLang = res.language;
  if (res?.isDemoMode) {
    setUIState('idle', '🎪 演示模式 — 无需 API Key');
    if (demoBadge) { demoBadge.style.display = 'inline-flex'; demoBadge.classList.remove('demo-badge-hidden'); }
    if (demoToggle) demoToggle.checked = true;
  } else if (res?.apiKeySet && res?.asrApiKeySet) {
    setUIState('idle', statusMsg('ready', currentLang));
  } else if (!res?.apiKeySet) {
    setUIState('idle', statusMsg('needKey', currentLang));
    showToast('请先在设置中填入 DeepSeek API Key', 'info', 0);
  } else if (!res?.asrApiKeySet) {
    setUIState('idle', statusMsg('needAsrKey', currentLang));
  } else {
    setUIState('idle', statusMsg('ready', currentLang));
  }
  if (res?.model) modelSelect.value = res.model;
  if (res?.asrEndpoint) asrEndpointInput.value = res.asrEndpoint;
  if (res?.asrModel) asrModelSelect.value = res.asrModel;
  if (res?.muted) {
    chatMuteBtn.innerHTML = '<i data-lucide="volume-x" style="width:11px;height:11px;display:block"></i>';
    chatMuteBtn.classList.add('muted');
    if (typeof lucide !== 'undefined' && lucide.createIcons) { lucide.createIcons(); }
  }
  if (res?.currentTask && res.currentTask.status === 'WAIT_FOR_USER') renderCollabTask(res.currentTask);
});

// ── 演示模式切换 ──
if (demoToggle) {
  demoToggle.addEventListener('change', function() {
    var enabled = demoToggle.checked;
    chrome.runtime.sendMessage({
      type: 'SET_DEMO_MODE',
      payload: { enabled: enabled }
    }).then(function(res) {
      if (res?.success) {
        if (enabled) {
          setUIState('idle', '🎪 演示模式已启用');
          if (demoBadge) { demoBadge.style.display = 'inline-flex'; demoBadge.classList.remove('demo-badge-hidden'); }
          showToast('🎪 演示模式 — 离线使用，无需 API Key', 'info', 3000);
        } else {
          setUIState('idle', statusMsg('ready', currentLang));
          if (demoBadge) demoBadge.style.display = 'none';
          showToast('演示模式已关闭', 'info', 2000);
        }
      }
    }).catch(function() {});
  });
}

if (workbenchFolderToggleBtn) workbenchFolderToggleBtn.addEventListener('click', function() {
  workbenchGroupsCollapsed = !workbenchGroupsCollapsed;
  renderWorkbenchFolderSummary({ noteFolder: { sources: currentNoteSources } });
});
if (notesSiteRefreshBtn) notesSiteRefreshBtn.addEventListener('click', refreshNotesSiteProfile);
if (workbenchCollectBtn) workbenchCollectBtn.addEventListener('click', collectPageSource);
if (workbenchComposeBtn) workbenchComposeBtn.addEventListener('click', function() {
  switchTab('notes');
  composeStudyNote();
});
if (workbenchReviewBtn) workbenchReviewBtn.addEventListener('click', function() {
  switchTab('review');
  composePracticePreview();
});
if (workbenchDemoRunBtn) workbenchDemoRunBtn.addEventListener('click', runContestDemoFlow);
if (workbenchShowWidgetBtn) workbenchShowWidgetBtn.addEventListener('click', function() {
  sendToolAction('show-widget');
});
if (navCollectBtn) navCollectBtn.addEventListener('click', collectPageSource);
if (notesCollectBtn) notesCollectBtn.addEventListener('click', collectPageSource);
if (notesCollectSelectionBtn) notesCollectSelectionBtn.addEventListener('click', collectSelectionSource);
if (notesCollectManualBtn) notesCollectManualBtn.addEventListener('click', collectManualSource);
if (notesComposeBtn) notesComposeBtn.addEventListener('click', composeStudyNote);
if (notesPracticeBtn) notesPracticeBtn.addEventListener('click', composePracticePreview);
if (notesRefreshBtn) notesRefreshBtn.addEventListener('click', refreshNotesFolder);
if (notesDownloadBtn && notesDownloadMenu) {
  notesDownloadBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    notesDownloadMenu.classList.toggle('open');
  });
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.download-menu-wrap')) notesDownloadMenu.classList.remove('open');
  });
}
if (notesExportBtn) notesExportBtn.addEventListener('click', exportNoteMarkdown);
if (notesExportWordBtn) notesExportWordBtn.addEventListener('click', exportNoteWord);
if (notesExportPdfBtn) notesExportPdfBtn.addEventListener('click', exportNotePdfPage);
if (notesExportPptxBtn) notesExportPptxBtn.addEventListener('click', exportNotePptx);
if (notesExportAnkiBtn) notesExportAnkiBtn.addEventListener('click', exportNoteAnki);
if (notesClearBtn) notesClearBtn.addEventListener('click', clearNoteFolder);
if (chatContextScope) {
  chatContextScope.addEventListener('change', function() {
    saveChatScope();
    updateChatContextCard();
    if (chatContextScope.value === 'custom-sources' && chatCustomPanel) {
      renderCustomSourcePicker();
      chatCustomPanel.style.display = '';
    } else if (chatCustomPanel) {
      chatCustomPanel.style.display = 'none';
    }
  });
}
if (chatCustomManageBtn) chatCustomManageBtn.addEventListener('click', function() {
  renderCustomSourcePicker();
  if (chatCustomPanel) chatCustomPanel.style.display = '';
});
if (chatCustomCloseBtn) chatCustomCloseBtn.addEventListener('click', function() {
  if (chatCustomPanel) chatCustomPanel.style.display = 'none';
});
if (chatCustomConfirmBtn) chatCustomConfirmBtn.addEventListener('click', function() {
  saveCustomSourceSelection();
  updateChatContextCard();
  if (chatCustomPanel) chatCustomPanel.style.display = 'none';
  showToast('自选资料已更新', 'success', 1600);
});
if (chatCustomList) {
  chatCustomList.addEventListener('change', function(e) {
    var input = e.target.closest('input[data-source-id]');
    if (!input) return;
    var id = input.dataset.sourceId || '';
    if (!id) return;
    if (input.checked) customSourceSelection.add(id);
    else customSourceSelection.delete(id);
    saveCustomSourceSelection();
    updateChatContextCard();
  });
}
if (chatRecentToggleBtn && chatRecentPanel) {
  chatRecentToggleBtn.addEventListener('click', function() {
    chatRecentPanel.classList.add('collapsed');
    if (chatHistoryBtn) chatHistoryBtn.classList.remove('active');
    chatRecentToggleBtn.textContent = '展开';
  });
}
if (notesFolderList) {
  notesFolderList.addEventListener('click', function(e) {
    var toggleBtn = e.target.closest('.folder-group-toggle');
    if (toggleBtn) {
      var groupKey = toggleBtn.dataset.groupKey || '';
      if (collapsedNoteGroups.has(groupKey)) collapsedNoteGroups.delete(groupKey);
      else collapsedNoteGroups.add(groupKey);
      renderNotesFolder({ sources: currentNoteSources });
      return;
    }
    var exportBtn = e.target.closest('.folder-group-export');
    if (exportBtn) {
      exportSourceGroupPdf(exportBtn.dataset.groupKey || '');
      return;
    }
    var openBtn = e.target.closest('.folder-item-open');
    if (openBtn) {
      previewNoteSource(openBtn.dataset.sourceId || '');
      return;
    }
    var linkBtn = e.target.closest('.folder-item-link');
    if (linkBtn && !linkBtn.disabled) {
      openNoteSource(linkBtn.dataset.sourceId || '');
      return;
    }
    var btn = e.target.closest('.folder-item-delete');
    if (btn && !btn.disabled) deleteNoteSource(btn.dataset.sourceId || '');
  });
}
if (workbenchFolderList) {
  workbenchFolderList.addEventListener('click', function(e) {
    var summaryToggle = e.target.closest('#workbench-folder-summary-toggle');
    if (summaryToggle) {
      workbenchGroupsCollapsed = !workbenchGroupsCollapsed;
      renderWorkbenchFolderSummary({ noteFolder: { sources: currentNoteSources } });
      return;
    }
    var miniLink = e.target.closest('.folder-mini-link');
    if (miniLink && !miniLink.disabled) {
      openNoteSource(miniLink.dataset.sourceId || '');
      return;
    }
    var miniDelete = e.target.closest('.folder-mini-delete');
    if (miniDelete && !miniDelete.disabled) {
      deleteNoteSource(miniDelete.dataset.sourceId || '');
      return;
    }
    var toggleBtn = e.target.closest('.folder-group-toggle');
    if (toggleBtn) {
      var group = toggleBtn.closest('.folder-group');
      var collapsed = group ? group.classList.toggle('collapsed') : true;
      var icon = toggleBtn.querySelector('i');
      if (icon) icon.setAttribute('data-lucide', collapsed ? 'chevron-right' : 'chevron-down');
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      return;
    }
    var exportBtn = e.target.closest('.folder-group-export');
    if (exportBtn) exportSourceGroupPdf(exportBtn.dataset.groupKey || '');
  });
}

// ── 首次使用引导 ──
const onbOverlay = document.getElementById('onboarding-overlay');
const onbDialog = document.getElementById('onboarding-dialog');
const onbClose = document.getElementById('onb-close');
const onbSkipAll = document.getElementById('onb-skip-all');
const onbShowGuide = document.getElementById('show-guide-btn');
var onbCurrentStep = 0;

function onbShow() {
  if (onbOverlay) onbOverlay.style.display = 'flex';
  onbCurrentStep = 0;
  onbGoStep(0);
}

function onbHide() {
  if (onbOverlay) onbOverlay.style.display = 'none';
}

function onbGoStep(step) {
  if (!onbDialog) return;
  onbDialog.querySelectorAll('.onb-step').forEach(function(el) {
    el.classList.toggle('active', parseInt(el.dataset.step) === step);
  });
  onbCurrentStep = step;
}

// Step navigation: next
if (document.getElementById('onb-next')) {
  document.getElementById('onb-next').addEventListener('click', function() { onbGoStep(1); });
  document.getElementById('onb-next-1').addEventListener('click', function() {
    // Save LLM key if provided
    var key = document.getElementById('onb-llm-key')?.value?.trim();
    if (key) {
      chrome.runtime.sendMessage({ type: 'SET_API_KEY', payload: { key: key } }).catch(function() {});
    }
    onbGoStep(2);
  });
  document.getElementById('onb-next-2').addEventListener('click', function() {
    // Save ASR config if provided
    var key = document.getElementById('onb-asr-key')?.value?.trim();
    var endpoint = document.getElementById('onb-asr-endpoint')?.value?.trim();
    if (key || endpoint) {
      chrome.runtime.sendMessage({ type: 'SET_ASR_CONFIG', payload: { key: key, endpoint: endpoint } }).catch(function() {});
    }
    onbGoStep(3);
  });
  document.getElementById('onb-next-3').addEventListener('click', function() { onbGoStep(4); });
}

// Step navigation: prev
if (document.getElementById('onb-prev-1')) {
  document.getElementById('onb-prev-1').addEventListener('click', function() { onbGoStep(0); });
  document.getElementById('onb-prev-2').addEventListener('click', function() { onbGoStep(1); });
  document.getElementById('onb-prev-3').addEventListener('click', function() { onbGoStep(2); });
}

// Close / Skip
if (onbClose) onbClose.addEventListener('click', onbHide);
if (onbSkipAll) onbSkipAll.addEventListener('click', function() {
  chrome.storage.local.set({ onboardingComplete: true }).catch(function() {});
  onbHide();
});

// Use demo mode from wizard
if (document.getElementById('onb-use-demo')) {
  document.getElementById('onb-use-demo').addEventListener('click', function() {
    // Enable demo mode
    chrome.runtime.sendMessage({ type: 'SET_DEMO_MODE', payload: { enabled: true } }).catch(function() {});
    if (demoToggle) demoToggle.checked = true;
    if (demoBadge) { demoBadge.style.display = 'inline-flex'; demoBadge.classList.remove('demo-badge-hidden'); }
    onbGoStep(4);
    var msgEl = document.getElementById('onb-done-msg');
    if (msgEl) msgEl.textContent = '🎪 演示模式已启用！你可以立即开始体验。';
    var summaryEl = document.getElementById('onb-summary');
    if (summaryEl) summaryEl.innerHTML = '<span class="onb-tag">🎪 演示模式</span>';
  });
}

// Finish button
if (document.getElementById('onb-finish')) {
  document.getElementById('onb-finish').addEventListener('click', function() {
    chrome.storage.local.set({ onboardingComplete: true }).catch(function() {});
    onbHide();
    showToast('🎉 设置完成，开始使用智引！', 'info', 3000);
  });
}

// 检查是否首次使用
chrome.storage.local.get(['onboardingComplete', 'apiKey', 'asrApiKey'], function(d) {
  if (!d.onboardingComplete && !d.apiKey && !d.asrApiKey) {
    // 延迟显示，等其他 UI 先渲染
    setTimeout(onbShow, 800);
  }
});

// 引导设置按钮（重新打开向导）
if (onbShowGuide) {
  onbShowGuide.addEventListener('click', onbShow);
}

textInput.addEventListener('input', function() {
  var val = textInput.value.trim();
  if (val) {
    var detected = detectLanguage(val);
    if (detected !== currentLang) currentLang = detected;
  }
});

// ── 当前站点（用于对话标题） ──
loadCustomSourceSelection();
restoreChatScope();
updateChatContextCard();
chrome.tabs.query({ active: true, currentWindow: true }).then(function(tabs) {
  if (tabs[0]?.url) {
    try {
      window._currentSite = new URL(tabs[0].url).hostname;
      currentSiteHost = window._currentSite;
      if (statusText && currentSiteHost) {
        statusText.textContent = '当前站点：' + currentSiteHost;
      }
      if (workbenchSiteTitle && currentSiteHost) workbenchSiteTitle.textContent = currentSiteHost;
    } catch (_) {}
  }
}).finally(function() {
  refreshWorkbench();
});

// ── 启动对话视图 ──
initChatView().catch(function(e) { console.warn('[SP] Chat init:', e); });
