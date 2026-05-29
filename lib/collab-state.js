/**
 * Collab State — 人机协同任务骨架
 */

const COLLAB_PATTERNS = /帮我规划|学习计划|筛选|选.*资源|比较.*资料|协同|一起|下一步|怎么安排|plan|choose.*resource|compare/i;

export function shouldStartCollab(intent) {
  return COLLAB_PATTERNS.test(String(intent || ''));
}

export function createCollabTask(intent, siteProfile, learningPlan) {
  const id = 'collab_' + Date.now();
  const siteName = siteProfile ? siteProfile.name : '当前平台';
  const steps = [
    { owner: 'AI', status: 'done', text: '理解学习目标' },
    { owner: 'AI', status: 'doing', text: `结合${siteName}和公开学习资源给出候选方向` },
    { owner: '用户', status: 'todo', text: '选择最想学习的 1-2 个资源或方向' },
    { owner: 'AI', status: 'todo', text: '根据你的选择生成细化学习路径' }
  ];
  return {
    id,
    intent,
    status: 'WAIT_FOR_USER',
    site: siteName,
    steps,
    speech: buildCollabSpeech(steps, learningPlan)
  };
}

function buildCollabSpeech(steps, learningPlan) {
  const resourceHint = learningPlan?.platforms?.length
    ? '\n\n候选平台：' + learningPlan.platforms.slice(0, 3).map(p => p.name).join('、')
    : '';
  return [
    '### 协同学习任务',
    '我先完成资源和路径建议，但需要你做一次选择。',
    '',
    ...steps.map(step => `- [${step.status}] ${step.owner}：${step.text}`),
    resourceHint,
    '',
    '请回复你想优先用哪个平台或资源，我再继续细化。'
  ].join('\n');
}
