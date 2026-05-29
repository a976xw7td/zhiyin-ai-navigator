/**
 * 演示场景 — 离线展示预设导航流程
 *
 * 当 API Key 未配置或用户手动开启演示模式时，
 * 用预定义场景替代真实 LLM/ASR/TTS 调用。
 * 每个场景包含关键字匹配、导航步骤和语音引导文案。
 */

'use strict';

const SCENARIOS = Object.freeze([
  {
    id: 'check-grade',
    title: '查找课程成绩',
    keywords: ['成绩', '分数', '绩点', '考试', '得分', 'grade', 'score', 'gpa', '考了多少', '多少分'],
    transcript: '帮我查找这学期的课程成绩',
    intent: { type: 'navigate', target: '成绩' },
    steps: [
      { action: 'tts', message: '好的，正在帮你查找课程成绩' },
      { action: 'highlight', selector: 'a,button,span,div', selectorText: '成绩', ttsMessage: '找到「成绩」入口了，我帮你点击进去' },
      { action: 'click', selector: 'a,button,span,div', selectorText: '成绩', ttsMessage: '已点击成绩入口' },
      { action: 'highlight', selector: 'td,span,div', selectorText: '学分', ttsMessage: '这是你的成绩列表，可以查看各科分数' }
    ],
    ttsWelcome: '好的，正在为你查找课程成绩'
  },
  {
    id: 'submit-homework',
    title: '提交作业',
    keywords: ['作业', '提交', '作业提交', 'assignment', 'submit', '交作业', '上传作业', '作业上传'],
    transcript: '帮我把作业提交上去',
    intent: { type: 'task', target: '作业提交' },
    steps: [
      { action: 'tts', message: '好的，开始帮你提交作业' },
      { action: 'highlight', selector: 'a,button,span,div', selectorText: '作业', ttsMessage: '找到「作业」入口了' },
      { action: 'click', selector: 'a,button,span,div', selectorText: '作业', ttsMessage: '已进入作业页面' },
      { action: 'highlight', selector: 'button,a,span', selectorText: '提交', ttsMessage: '这是「提交」按钮，点击后完成提交' },
      { action: 'click', selector: 'button,a,span', selectorText: '提交', ttsMessage: '作业已提交成功' }
    ],
    ttsWelcome: '好的，正在帮你提交作业'
  },
  {
    id: 'view-schedule',
    title: '查看课表',
    keywords: ['课表', '课程表', '上课', '课程安排', 'schedule', 'timetable', '课表查询', '查课表'],
    transcript: '我想看看这学期的课表',
    intent: { type: 'navigate', target: '课表' },
    steps: [
      { action: 'tts', message: '好的，正在查找你的课表' },
      { action: 'highlight', selector: 'a,button,span,div', selectorText: '课表', ttsMessage: '找到了「课表」入口，点击查看' },
      { action: 'click', selector: 'a,button,span,div', selectorText: '课表', ttsMessage: '已进入课表页面' },
      { action: 'highlight', selector: 'table,div,section', selectorText: '周一', ttsMessage: '这是你的本周课程安排' }
    ],
    ttsWelcome: '好的，正在查看你的课表'
  },
  {
    id: 'course-selection',
    title: '选课',
    keywords: ['选课', '选课系统', 'course', 'enroll', 'register', '选课程', '加选', '退选'],
    transcript: '帮我选一门课',
    intent: { type: 'task', target: '选课' },
    steps: [
      { action: 'tts', message: '好的，开始选课流程' },
      { action: 'highlight', selector: 'a,button,span,div', selectorText: '选课', ttsMessage: '找到了「选课系统」入口' },
      { action: 'click', selector: 'a,button,span,div', selectorText: '选课', ttsMessage: '进入选课页面' },
      { action: 'input', selector: 'input[type="text"],input[type="search"]', placeholder: '搜索课程', value: '程序设计', ttsMessage: '帮你搜索「程序设计」课程' },
      { action: 'click', selector: 'button', selectorText: '选课', ttsMessage: '已点击选课' },
      { action: 'tts', message: '选课成功！请在「我的课表」中查看' }
    ],
    ttsWelcome: '好的，开始选课流程'
  },
  {
    id: 'ai-tutor',
    title: 'AI学习助手',
    keywords: ['学习', '辅导', '帮助', 'help', 'tutor', 'question', '答疑', '不会', '不明白', '怎么用'],
    transcript: '这个功能怎么用？',
    intent: { type: 'chat', target: '答疑' },
    steps: [
      { action: 'tts', message: '你好！我是智引AI导航导师。你可以对我说：' },
      { action: 'tts', message: '「查找成绩」— 查看课程成绩' },
      { action: 'tts', message: '「提交作业」— 完成作业提交' },
      { action: 'tts', message: '「查看课表」— 查看本学期课程' },
      { action: 'tts', message: '「选课」— 进入选课系统' },
      { action: 'tts', message: '也可以直接在文本框输入文字，或点击麦克风用语音输入' }
    ],
    ttsWelcome: '你好，我是智引AI导航导师，有什么可以帮你的？'
  },
  {
    id: 'platform-navigate',
    title: '教学平台导航',
    keywords: ['导航', '找到', '去哪儿', '怎么找', 'where', 'find', 'locate', '去', '打开', '进入'],
    transcript: '帮我找到登录入口',
    intent: { type: 'navigate', target: '通用导航' },
    steps: [
      { action: 'tts', message: '我可以帮你找到平台上的各种功能' },
      { action: 'tts', message: '请试试说：「查找成绩」「查看课表」「提交作业」「选课」' },
      { action: 'highlight', selector: 'a,button,span,div', selectorText: '登录', ttsMessage: '找到「登录」按钮了' }
    ],
    ttsWelcome: '好的，我来帮你导航'
  },

  // ── GitHub / 开发者平台场景 ──
  {
    id: 'github-view-repo',
    title: '浏览代码仓库',
    keywords: ['仓库', 'repo', 'repository', '代码', '源码', 'source', '项目', '存储库', 'repos', 'repository'],
    transcript: '帮我看看这个代码仓库',
    intent: { type: 'navigate', target: '仓库' },
    steps: [
      { action: 'tts', message: '好的，正在进入代码仓库' },
      { action: 'highlight', selector: 'a', selectorText: 'Repositories', ttsMessage: '找到「Repositories」标签，点击查看仓库列表' },
      { action: 'click', selector: 'a', selectorText: 'Repositories', ttsMessage: '已进入仓库列表' },
      { action: 'highlight', selector: 'input', selectorText: 'Find a repository', ttsMessage: '你可以在这里搜索仓库，或者从下方列表中选择' }
    ],
    ttsWelcome: '好的，我来帮你查看代码仓库'
  },
  {
    id: 'github-create-issue',
    title: '创建 Issue',
    keywords: ['issue', '问题', '议题', 'bug', '反馈', '报告', '报告问题', '提issue', '创建issue', '提交问题'],
    transcript: '帮我创建一个 Issue',
    intent: { type: 'task', target: '创建 Issue' },
    steps: [
      { action: 'tts', message: '好的，开始创建 Issue' },
      { action: 'highlight', selector: 'a,button,span', selectorText: 'Issues', ttsMessage: '找到「Issues」标签' },
      { action: 'click', selector: 'a,button,span', selectorText: 'Issues', ttsMessage: '已进入 Issues 页面' },
      { action: 'highlight', selector: 'button,a', selectorText: 'New issue', ttsMessage: '这是「New issue」按钮，点击开始创建' },
      { action: 'click', selector: 'button,a', selectorText: 'New issue', ttsMessage: '已打开 Issue 编辑页面，在这里填写标题和描述' }
    ],
    ttsWelcome: '好的，帮你创建 Issue'
  },
  {
    id: 'github-pr',
    title: '查看 Pull Request',
    keywords: ['pr', 'pull request', '合并', 'pullrequest', 'PR', '拉取请求', '代码审查', 'code review', '合并请求'],
    transcript: '帮我查看 Pull Request',
    intent: { type: 'navigate', target: 'Pull Request' },
    steps: [
      { action: 'tts', message: '好的，正在查看 Pull Request' },
      { action: 'highlight', selector: 'a,button,span', selectorText: 'Pull requests', ttsMessage: '找到「Pull requests」标签' },
      { action: 'click', selector: 'a,button,span', selectorText: 'Pull requests', ttsMessage: '已进入 PR 列表页面' },
      { action: 'highlight', selector: 'div,a,span', selectorText: 'Open', ttsMessage: '这是待处理的 PR 列表，点击可查看详情' }
    ],
    ttsWelcome: '好的，查看 Pull Request'
  },
  {
    id: 'github-search',
    title: '搜索代码',
    keywords: ['搜索', '查找', 'search', 'find', '查询', '搜代码', '找项目', '搜项目', '搜索代码'],
    transcript: '帮我搜索这个项目',
    intent: { type: 'navigate', target: '搜索' },
    steps: [
      { action: 'tts', message: '好的，帮你搜索' },
      { action: 'highlight', selector: 'input', selectorText: 'Search', ttsMessage: '找到搜索框' },
      { action: 'input', placeholder: '搜索', value: '项目名称', ttsMessage: '在这里输入关键词，然后按回车搜索' },
      { action: 'highlight', selector: 'nav,a', selectorText: 'Code', ttsMessage: '搜索结果已展示，可以切换到 Code/Issues/PRs 等标签筛选' }
    ],
    ttsWelcome: '好的，帮你搜索'
  }
]);

/**
 * 关键字匹配评分
 * @param {string} transcript - 用户输入文本
 * @param {string[]} keywords - 场景关键字列表
 * @returns {number} 匹配分数 (0-1)
 */
function scoreMatch(transcript, keywords) {
  const lower = transcript.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) hits++;
  }
  return keywords.length > 0 ? hits / keywords.length : 0;
}

/**
 * 根据用户输入找到最佳匹配场景
 * @param {string} transcript - 用户语音或文字输入
 * @returns {object|null} 匹配的场景对象，或 null
 */
export function findMatch(transcript) {
  if (!transcript || typeof transcript !== 'string') return null;
  const trimmed = transcript.trim();
  if (!trimmed) return null;

  let best = null;
  let bestScore = 0;

  for (const scenario of SCENARIOS) {
    const score = scoreMatch(trimmed, scenario.keywords);
    if (score >= 0.1 && score > bestScore) {
      best = scenario;
      bestScore = score;
    }
  }

  return best;
}

/**
 * 获取所有演示场景
 * @returns {object[]}
 */
export function getAllScenarios() {
  return SCENARIOS;
}

/**
 * 随机获取一个场景（用于自动演示）
 * @returns {object}
 */
export function getRandomScenario() {
  const idx = Math.floor(Math.random() * SCENARIOS.length);
  return SCENARIOS[idx];
}

/** 演示模式建议语 */
export const DEMO_SUGGESTIONS = [
  '试试说：查找课程成绩',
  '试试说：提交作业',
  '试试说：查看课表',
  '试试说：帮我选课',
  '试试说：这个功能怎么用？',
  '试试说：帮我创建一个 Issue',
  '试试说：查看 Pull Request',
  '试试说：浏览代码仓库'
];
