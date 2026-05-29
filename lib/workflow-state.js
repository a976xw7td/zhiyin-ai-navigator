/**
 * Workflow State — 应用工作流与笔记文件夹状态
 */

export const NOTE_FOLDER_STORAGE_KEY = 'noteFolder';
export const TASK_MEMORY_STORAGE_KEY = 'taskMemory';

const WORKFLOW_STATE_VERSION = 2;
const MEMORY_RECENT_LIMIT = 12;
const MEMORY_GROUP_LIMIT = 8;
const MEMORY_PLATFORM_LIMIT = 8;

function workflowNowIso() {
  return new Date().toISOString();
}

function workflowSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function workflowCleanText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function workflowHost(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return '';
  }
}

function inferLearningTopic(source) {
  const text = [
    source?.title,
    source?.siteProfile?.name,
    source?.description,
    source?.excerpt
  ].filter(Boolean).join(' ');
  return workflowCleanText(text, 80) || '';
}

function compactSource(source) {
  const url = source?.url || '';
  return {
    id: source?.id || '',
    type: source?.type || 'page',
    title: workflowCleanText(source?.title || '未命名资料', 120),
    url,
    host: source?.host || workflowHost(url),
    siteName: source?.siteProfile?.name || '',
    collectedAt: source?.collectedAt || workflowNowIso(),
    excerpt: workflowCleanText(source?.excerpt || source?.text || source?.selectedText || '', 240)
  };
}

function compactNote(note) {
  return {
    id: note?.id || '',
    title: workflowCleanText(note?.title || '学习笔记', 120),
    createdAt: note?.createdAt || note?.updatedAt || workflowNowIso(),
    summary: workflowCleanText(note?.summary || note?.markdown || '', 240)
  };
}

function compactPlatform(input) {
  const url = input?.url || '';
  const host = input?.host || workflowHost(url);
  const name = input?.siteProfile?.name || input?.name || host || '通用网页';
  return {
    id: input?.siteProfile?.id || host || name,
    name: workflowCleanText(name, 80),
    host,
    category: input?.siteProfile?.category || input?.category || '',
    lastUrl: url,
    lastUsedAt: workflowNowIso(),
    count: Number(input?.count || 0) || 1
  };
}

function upsertById(list, item, limit) {
  const id = item?.id || item?.host || item?.name;
  const rest = workflowSafeArray(list).filter(existing => (existing?.id || existing?.host || existing?.name) !== id);
  return [item].concat(rest).slice(0, limit);
}

export function createEmptyNoteFolder() {
  const now = workflowNowIso();
  return {
    version: WORKFLOW_STATE_VERSION,
    sources: [],
    notes: [],
    updatedAt: now,
    createdAt: now
  };
}

export function createEmptyTaskMemory() {
  const now = workflowNowIso();
  return {
    version: WORKFLOW_STATE_VERSION,
    currentLearningTopic: '',
    recentSources: [],
    recentSourceGroups: [],
    recentNotes: [],
    recentReports: [],
    favoritePlatforms: [],
    lastSuggestions: [],
    updatedAt: now,
    createdAt: now
  };
}

export function normalizeNoteFolder(folder) {
  const base = createEmptyNoteFolder();
  if (!folder || typeof folder !== 'object') return base;
  return {
    version: folder.version || WORKFLOW_STATE_VERSION,
    sources: workflowSafeArray(folder.sources),
    notes: workflowSafeArray(folder.notes),
    updatedAt: folder.updatedAt || base.updatedAt,
    createdAt: folder.createdAt || base.createdAt
  };
}

export function normalizeTaskMemory(memory) {
  const base = createEmptyTaskMemory();
  if (!memory || typeof memory !== 'object') return base;
  return {
    version: memory.version || WORKFLOW_STATE_VERSION,
    currentLearningTopic: workflowCleanText(memory.currentLearningTopic || '', 100),
    recentSources: workflowSafeArray(memory.recentSources).slice(0, MEMORY_RECENT_LIMIT),
    recentSourceGroups: workflowSafeArray(memory.recentSourceGroups).slice(0, MEMORY_GROUP_LIMIT),
    recentNotes: workflowSafeArray(memory.recentNotes).slice(0, MEMORY_RECENT_LIMIT),
    recentReports: workflowSafeArray(memory.recentReports).slice(0, MEMORY_RECENT_LIMIT),
    favoritePlatforms: workflowSafeArray(memory.favoritePlatforms).slice(0, MEMORY_PLATFORM_LIMIT),
    lastSuggestions: workflowSafeArray(memory.lastSuggestions).slice(0, 6),
    updatedAt: memory.updatedAt || base.updatedAt,
    createdAt: memory.createdAt || base.createdAt
  };
}

export function buildPostCollectSuggestions(source, memory) {
  const topic = memory?.currentLearningTopic || inferLearningTopic(source) || '当前资料';
  const sourceId = source?.id || '';
  const hasNotes = workflowSafeArray(memory?.recentNotes).length > 0;
  return [
    {
      id: 'compose-note',
      type: 'note',
      title: '整理成学习笔记',
      text: '把刚采集的资料提炼为要点、关键词、学习路径和自测题。',
      action: 'COMPOSE_STUDY_NOTE',
      payload: sourceId ? { sourceIds: [sourceId], title: topic } : { title: topic },
      requiresUserConfirm: true,
      safety: 'safe'
    },
    {
      id: 'build-plan',
      type: 'plan',
      title: '生成学习规划',
      text: '围绕“' + topic + '”安排阅读、实践和复习步骤。',
      action: 'START_LEARNING_PLAN',
      payload: { topic, sourceId },
      requiresUserConfirm: true,
      safety: 'safe'
    },
    {
      id: hasNotes ? 'export-report' : 'review-drill',
      type: hasNotes ? 'report' : 'review',
      title: hasNotes ? '生成汇报材料' : '开始复习训练',
      text: hasNotes ? '基于最近笔记生成可编辑汇报或演示稿。' : '先用刚采集内容生成 3-5 个自测问题。',
      action: hasNotes ? 'EXPORT_NOTE_PPTX' : 'START_REVIEW_DRILL',
      payload: { topic, sourceId },
      requiresUserConfirm: true,
      safety: 'safe'
    }
  ];
}

export function buildAgentTaskFlows(noteFolder, taskMemory) {
  const folder = normalizeNoteFolder(noteFolder);
  const memory = normalizeTaskMemory(taskMemory);
  const sourceCount = folder.sources.length;
  const noteCount = folder.notes.length;
  const hasTopic = !!memory.currentLearningTopic;
  return [
    {
      id: 'source_collection',
      owner: '资料采集',
      status: sourceCount ? 'done' : 'pending',
      text: sourceCount ? '已采集 ' + sourceCount + ' 条资料，可继续补充或整理。' : '采集当前页面、选区或手动文本到资料夹。',
      nextAction: 'COLLECT_PAGE_SOURCE'
    },
    {
      id: 'page_understanding',
      owner: '页面理解',
      status: sourceCount || hasTopic ? 'ready' : 'pending',
      text: '基于当前页面/最近资料解释主题、入口和关键内容。',
      nextAction: 'ASK_PAGE_SUMMARY'
    },
    {
      id: 'learning_plan',
      owner: '学习规划',
      status: hasTopic ? 'ready' : 'pending',
      text: hasTopic ? '围绕“' + memory.currentLearningTopic + '”规划学习路径。' : '先确定学习主题，再生成阶段计划。',
      nextAction: 'START_LEARNING_PLAN'
    },
    {
      id: 'review_training',
      owner: '复习训练',
      status: noteCount ? 'ready' : sourceCount ? 'pending' : 'locked',
      text: noteCount ? '可用最近笔记生成自测题和错题回看。' : '需要先整理笔记或采集资料。',
      nextAction: 'START_REVIEW_DRILL'
    },
    {
      id: 'report_generation',
      owner: '汇报生成',
      status: noteCount ? 'ready' : 'pending',
      text: noteCount ? '可导出 Markdown、Word、PDF 或 PPTX 汇报。' : '需要先生成学习笔记。',
      nextAction: 'EXPORT_NOTE_PPTX'
    }
  ];
}

export async function getWorkflowState(storageArea) {
  const storage = storageArea || chrome.storage.local;
  const data = await storage.get([NOTE_FOLDER_STORAGE_KEY, TASK_MEMORY_STORAGE_KEY]);
  const noteFolder = normalizeNoteFolder(data[NOTE_FOLDER_STORAGE_KEY]);
  const taskMemory = normalizeTaskMemory(data[TASK_MEMORY_STORAGE_KEY]);
  const agentFlows = buildAgentTaskFlows(noteFolder, taskMemory);
  return {
    ok: true,
    noteFolder,
    taskMemory,
    agentFlows,
    sourceCount: noteFolder.sources.length,
    noteCount: noteFolder.notes.length,
    updatedAt: noteFolder.updatedAt > taskMemory.updatedAt ? noteFolder.updatedAt : taskMemory.updatedAt
  };
}

export async function saveNoteFolder(noteFolder, storageArea) {
  const storage = storageArea || chrome.storage.local;
  const normalized = normalizeNoteFolder(noteFolder);
  normalized.updatedAt = workflowNowIso();
  await storage.set({ [NOTE_FOLDER_STORAGE_KEY]: normalized });
  return normalized;
}

export async function saveTaskMemory(taskMemory, storageArea) {
  const storage = storageArea || chrome.storage.local;
  const normalized = normalizeTaskMemory(taskMemory);
  normalized.updatedAt = workflowNowIso();
  await storage.set({ [TASK_MEMORY_STORAGE_KEY]: normalized });
  return normalized;
}

export async function rememberCollectedSource(source, storageArea) {
  const state = await getWorkflowState(storageArea);
  const memory = normalizeTaskMemory(state.taskMemory);
  const item = compactSource(source);
  const topic = inferLearningTopic(source);
  if (topic) memory.currentLearningTopic = topic;
  memory.recentSources = upsertById(memory.recentSources, item, MEMORY_RECENT_LIMIT);
  memory.recentSourceGroups = [{
    id: 'grp_' + Date.now(),
    title: memory.currentLearningTopic || item.title,
    sourceIds: [item.id].filter(Boolean),
    sourceCount: 1,
    createdAt: workflowNowIso()
  }].concat(memory.recentSourceGroups).slice(0, MEMORY_GROUP_LIMIT);
  if (item.host || source?.siteProfile) {
    const old = memory.favoritePlatforms.find(platform => platform.host === item.host || platform.id === source?.siteProfile?.id);
    const platform = compactPlatform(Object.assign({}, source, { count: old ? Number(old.count || 0) + 1 : 1 }));
    memory.favoritePlatforms = upsertById(memory.favoritePlatforms, platform, MEMORY_PLATFORM_LIMIT);
  }
  memory.lastSuggestions = buildPostCollectSuggestions(source, memory);
  const saved = await saveTaskMemory(memory, storageArea);
  return { ok: true, taskMemory: saved, suggestions: saved.lastSuggestions };
}

export async function rememberStudyNote(note, storageArea) {
  const state = await getWorkflowState(storageArea);
  const memory = normalizeTaskMemory(state.taskMemory);
  const item = compactNote(note);
  memory.recentNotes = upsertById(memory.recentNotes, item, MEMORY_RECENT_LIMIT);
  if (!memory.currentLearningTopic && item.title) memory.currentLearningTopic = item.title;
  const saved = await saveTaskMemory(memory, storageArea);
  return { ok: true, taskMemory: saved };
}

export async function rememberReport(report, storageArea) {
  const state = await getWorkflowState(storageArea);
  const memory = normalizeTaskMemory(state.taskMemory);
  const item = {
    id: report?.id || 'report_' + Date.now(),
    type: report?.type || 'report',
    title: workflowCleanText(report?.title || report?.noteTitle || '学习汇报', 120),
    createdAt: workflowNowIso()
  };
  memory.recentReports = upsertById(memory.recentReports, item, MEMORY_RECENT_LIMIT);
  const saved = await saveTaskMemory(memory, storageArea);
  return { ok: true, taskMemory: saved };
}

export async function appendNoteSource(source, storageArea) {
  const state = await getWorkflowState(storageArea);
  const noteFolder = normalizeNoteFolder(state.noteFolder);
  const now = workflowNowIso();
  const item = Object.assign({
    id: 'src_' + Date.now(),
    collectedAt: now
  }, source || {});
  noteFolder.sources = [item].concat(noteFolder.sources).slice(0, 20);
  const saved = await saveNoteFolder(noteFolder, storageArea);
  return { ok: true, source: item, noteFolder: saved };
}

export async function appendStudyNote(note, storageArea) {
  const state = await getWorkflowState(storageArea);
  const noteFolder = normalizeNoteFolder(state.noteFolder);
  const now = workflowNowIso();
  const item = Object.assign({
    id: 'note_' + Date.now(),
    createdAt: now
  }, note || {});
  noteFolder.notes = [item].concat(noteFolder.notes).slice(0, 20);
  const saved = await saveNoteFolder(noteFolder, storageArea);
  return { ok: true, note: item, noteFolder: saved };
}

export async function deleteNoteSource(sourceId, storageArea) {
  const state = await getWorkflowState(storageArea);
  const noteFolder = normalizeNoteFolder(state.noteFolder);
  const before = noteFolder.sources.length;
  noteFolder.sources = noteFolder.sources.filter(source => source.id !== sourceId);
  if (noteFolder.sources.length === before) {
    return { ok: false, error: 'SOURCE_NOT_FOUND', noteFolder };
  }
  const saved = await saveNoteFolder(noteFolder, storageArea);
  return { ok: true, sourceId, noteFolder: saved };
}

export async function clearNoteFolder(storageArea) {
  const storage = storageArea || chrome.storage.local;
  const noteFolder = createEmptyNoteFolder();
  const taskMemory = createEmptyTaskMemory();
  await storage.set({ [NOTE_FOLDER_STORAGE_KEY]: noteFolder, [TASK_MEMORY_STORAGE_KEY]: taskMemory });
  return { ok: true, noteFolder, taskMemory };
}
