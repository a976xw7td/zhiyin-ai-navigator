/**
 * Intent Router — 用户意图路由
 */

const PAGE_SUMMARY_RE = /总结|概述|摘要|主要内容|讲了什么|说什么|README|仓库.*(是什么|内容|介绍)|summarize|summary|overview|readme/i;
const PAGE_ENTRIES_RE = /页面.*(功能|入口)|有哪些.*(功能|入口)|按钮|菜单|导航|入口|where.*feature|what.*on.*page/i;
const LEARNING_RE = /学习|怎么学|学习路径|推荐资源|本科生|课程|自学|learn|study|resource|course/i;
const MATERIAL_RE = /采集|收藏|保存|加入资料|资料夹|资料管理|收集|整理资料|source|collect|save.*resource|material/i;
const REVIEW_RE = /复习|自测|测验|练习题|刷题|记忆卡|flashcard|anki|quiz|review|practice/i;
const REPORT_RE = /汇报|报告|导出|生成.*(PPT|演示|文档|PDF|Word)|pptx|slides|presentation|report|export/i;
const NOTE_RE = /笔记|提取重点|生成.*(笔记|重点)|note/i;
const NAV_RE = /点击|打开|进入|高亮|找到|查找|搜索|跳转|定位|click|open|find|search|locate|go to/i;
const PAGE_REF_RE = /这个页面|当前页面|这页|页面上|这个仓库|这个项目|这门内容|这里|当前|屏幕|this page|current page|this repo|this repository|this project/i;
const DANGEROUS_ACTION_RE = /删除|移除|清空|提交|支付|购买|下单|发布|确认|同意|授权|发送|转账|delete|remove|clear|submit|pay|buy|purchase|order|publish|confirm|agree|authorize|send|transfer/i;

const ROUTE_META = {
  page_navigation: { label: '页面导航', workflow: 'page_understanding', pageAware: false },
  page_understanding: { label: '页面理解', workflow: 'page_understanding', pageAware: true },
  learning_planning: { label: '学习规划', workflow: 'learning_plan', pageAware: true },
  material_management: { label: '资料管理', workflow: 'source_collection', pageAware: true },
  review_training: { label: '复习训练', workflow: 'review_training', pageAware: true },
  report_output: { label: '汇报产出', workflow: 'report_generation', pageAware: true },
  general_chat: { label: '普通对话', workflow: 'page_understanding', pageAware: false }
};

function buildRoute(category, type, intent, overrides) {
  const meta = ROUTE_META[category] || ROUTE_META.general_chat;
  const dangerous = DANGEROUS_ACTION_RE.test(String(intent || ''));
  return Object.assign({
    type,
    category,
    label: meta.label,
    workflow: meta.workflow,
    pageAware: meta.pageAware,
    safety: {
      allowAutoClick: category === 'page_navigation' && !dangerous,
      requiresUserConfirm: dangerous,
      level: dangerous ? 'confirm_required' : 'safe'
    }
  }, overrides || {});
}

export function routeIntent(intent) {
  const text = String(intent || '').trim();
  const hasPageRef = PAGE_REF_RE.test(text);
  if (REVIEW_RE.test(text)) return buildRoute('review_training', 'review_training', text);
  if (REPORT_RE.test(text)) return buildRoute('report_output', 'report_output', text);
  if (DANGEROUS_ACTION_RE.test(text) && /资料|笔记|来源|source|material|note/i.test(text)) return buildRoute('material_management', 'note_workflow', text);
  if (MATERIAL_RE.test(text) || NOTE_RE.test(text)) return buildRoute('material_management', 'note_workflow', text);
  if (LEARNING_RE.test(text) && (hasPageRef || /规划|计划|路径|这门内容|当前主题|当前|plan|path/i.test(text))) return buildRoute('learning_planning', 'learning_plan', text);
  if (PAGE_SUMMARY_RE.test(text) && (hasPageRef || /https?:\/\/|github\.com/i.test(text))) return buildRoute('page_understanding', 'page_summary', text);
  if (PAGE_ENTRIES_RE.test(text) && hasPageRef) return buildRoute('page_understanding', 'page_entries', text);
  if (NAV_RE.test(text)) return buildRoute('page_navigation', 'navigation', text);
  if (hasPageRef) return buildRoute('page_understanding', 'page_summary', text);
  return buildRoute('general_chat', 'general_chat', text);
}

export function buildPageAwarePrompt(intent, context, route) {
  const ctx = context || {};
  const profile = ctx.siteProfile ? [ctx.siteProfile.name, ctx.siteProfile.category].filter(Boolean).join(' / ') : '';
  const mode = route?.type || 'page_summary';
  return [
    '你是“智引 AI 导航导师”，运行在浏览器插件中，能读取当前浏览器页面上下文。',
    '当用户问“这个页面/当前页面/这门内容/这个仓库”时，必须基于下面的页面上下文回答。',
    '不要说“我无法访问互联网”“我看不到页面”“请粘贴内容”。如果上下文不足，只能说“当前页面可见内容较少，我先基于已读取内容回答”。',
    '回答要面向本科生，简洁、有学习指导价值，避免代写作业或考试答案。',
    '',
    '用户意图类型：' + mode,
    '用户问题：' + String(intent || ''),
    '',
    '页面标题：' + (ctx.title || ''),
    '页面地址：' + (ctx.url || ''),
    '站点画像：' + (profile || '通用网页'),
    '',
    '页面上下文：',
    ctx.summary || '',
    '',
    ctx.domSource?.text ? '页面正文：\n' + String(ctx.domSource.text).slice(0, 5000) : '',
    ctx.selection?.selectedText ? '\n选中文本：\n' + String(ctx.selection.selectedText).slice(0, 1200) : '',
    ctx.viewport?.visibleText ? '\n当前可见区域：\n' + String(ctx.viewport.visibleText).slice(0, 1600) : '',
    '',
    '请直接给出答案。'
  ].filter(Boolean).join('\n');
}
