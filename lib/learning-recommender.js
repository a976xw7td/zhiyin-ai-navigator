/**
 * Learning Recommender — 本科生学习资源推荐
 */

const SUBJECTS = [
  { id: 'python', names: ['python', 'Python', '爬虫', '编程入门'], path: ['语法基础', '函数与模块', '文件与异常', '数据分析小项目'], query: 'Python 入门 课程 项目' },
  { id: 'data-structure', names: ['数据结构', '算法', '链表', '二叉树'], path: ['复杂度', '线性表', '树和图', '排序搜索', '刷题复盘'], query: '数据结构 算法 课程' },
  { id: 'machine-learning', names: ['机器学习', '深度学习', '人工智能', 'AI', '模型训练'], path: ['线性代数/概率复习', '监督学习', '模型评估', '实战项目', '论文/开源项目阅读'], query: '机器学习 入门 课程 GitHub' },
  { id: 'english', names: ['英语', '四级', '六级', '雅思', '托福'], path: ['词汇', '听力', '阅读', '写作', '真题复盘'], query: '大学英语 学习 方法 课程' },
  { id: 'thesis', names: ['论文', '文献', '综述', '开题', '引用'], path: ['确定问题', '检索文献', '阅读摘要', '整理观点', '规范引用'], query: 'academic writing literature review citation' }
];

const RESOURCE_PLATFORMS = [
  { name: '中国大学 MOOC', url: 'https://www.icourse163.org/search.htm?search=', bestFor: '系统课程和证书学习' },
  { name: 'B 站', url: 'https://search.bilibili.com/all?keyword=', bestFor: '视频讲解和案例演示' },
  { name: 'GitHub', url: 'https://github.com/search?q=', bestFor: '开源项目、代码实践和 README 学习' },
  { name: 'IEEE Xplore', url: 'https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=', bestFor: '英文论文和技术文献' },
  { name: '学信网', url: 'https://www.chsi.com.cn/', bestFor: '学籍学历、身份与验证报告' }
];

const LEARNING_PATTERNS = /我想学|怎么学|学习|课程推荐|推荐.*资源|去哪学|自学|入门|补一下|提高|learn|study|course|resource/i;

export function matchLearningNeed(intent) {
  const text = String(intent || '');
  if (!LEARNING_PATTERNS.test(text)) return null;
  const subject = SUBJECTS.find(item => item.names.some(name => text.toLowerCase().includes(String(name).toLowerCase()))) ||
    { id: 'general', names: ['通用学习'], path: ['明确目标', '找系统课程', '做一个小项目', '复盘笔记'], query: text.replace(/\s+/g, ' ').slice(0, 40) || '大学课程 学习资源' };
  return subject;
}

export function buildLearningPlan(intent, siteProfile) {
  const subject = matchLearningNeed(intent);
  if (!subject) return null;
  const query = encodeURIComponent(subject.query);
  const platforms = RESOURCE_PLATFORMS.map(p => ({
    name: p.name,
    bestFor: p.bestFor,
    url: p.url + query
  }));
  const currentSite = siteProfile ? `当前你在 ${siteProfile.name}，我会优先结合这个平台。` : '我会优先推荐适合本科生的公开学习资源。';
  const lines = [
    '### 学习路径建议',
    currentSite,
    '',
    '- 第 1 步：' + subject.path[0],
    '- 第 2 步：' + subject.path[1],
    '- 第 3 步：' + subject.path[2],
    '- 第 4 步：' + subject.path[3],
    '',
    '### 推荐平台',
    ...platforms.slice(0, 4).map(p => `- **${p.name}**：${p.bestFor}`),
    '',
    '你可以先选一个平台，我再帮你打开搜索入口或在当前页面标出下一步。'
  ];
  return {
    subject,
    platforms,
    speech: lines.join('\n')
  };
}
