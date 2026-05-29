/**
 * Site Profiles — 首批专项优化站点画像
 *
 * 这些规则是轻量“专项网站优化层”：先识别站点，再给 LLM/DOM 蒸馏提供
 * 平台任务、关键词和教育场景约束，避免一上来引入后端数据库。
 */

export const SITE_PROFILES = Object.freeze([
  {
    id: 'bilibili',
    name: 'B 站',
    hosts: ['bilibili.com', 'www.bilibili.com', 'search.bilibili.com'],
    category: 'learning-video',
    tasks: ['搜索课程视频', '筛选教程合集', '查看收藏/稍后再看', '打开学习视频'],
    keywords: ['搜索', '课程', '合集', '播放', '收藏', '稍后再看', '评论', '分区', '学习', '教程', '公开课'],
    ethics: '适合推荐公开学习视频；提醒用户核验视频质量和版权来源。',
    guidance: '优先帮助学生搜索课程关键词、筛选系统教程和打开学习视频，不把娱乐内容作为默认推荐。'
  },
  {
    id: 'icourse163',
    name: '中国大学 MOOC',
    hosts: ['icourse163.org', 'www.icourse163.org'],
    category: 'mooc',
    tasks: ['查找课程', '进入课程学习', '查看章节', '查看作业/测验', '查看证书'],
    keywords: ['课程', '学校', '老师', '章节', '作业', '测验', '考试', '证书', '加入学习', '立即参加'],
    ethics: '可以解释知识和规划学习；禁止代做测验、考试或作业。',
    guidance: '优先识别课程搜索、课程详情、章节学习、作业测验和证书相关入口。'
  },
  {
    id: 'chsi',
    name: '学信网',
    hosts: ['chsi.com.cn', 'www.chsi.com.cn', 'my.chsi.com.cn'],
    category: 'student-record',
    tasks: ['查询学籍', '查询学历', '学信档案登录', '在线验证报告', '账号帮助'],
    keywords: ['学籍', '学历', '学信档案', '在线验证报告', '登录', '注册', '身份核验', '高等教育信息'],
    ethics: '涉及个人身份和学籍隐私，只做导航和解释，不要求用户透露敏感信息。',
    guidance: '优先帮助学生定位学信档案、学籍学历查询、在线验证报告入口，并提醒保护隐私。'
  },
  {
    id: 'sias',
    name: '西亚斯官网',
    hosts: ['sias.edu.cn', 'www.sias.edu.cn'],
    category: 'campus-official',
    tasks: ['查看学校通知', '查找学院/部门', '查看招生与教学信息', '查找校园服务'],
    keywords: ['通知', '公告', '新闻', '学院', '部门', '招生', '教学', '科研', '服务', '国际交流'],
    ethics: '以官方信息为准；涉及政策和通知时提醒查看发布日期。',
    guidance: '优先定位官网导航、通知公告、学院部门、教学资源和校园服务入口。'
  },
  {
    id: 'blackboard',
    name: 'Blackboard',
    hosts: ['globalbb.fhsu.edu', 'fhsuglobal.blackboard.com', 'blackboard.com'],
    category: 'lms',
    tasks: ['查看课程', '查看作业', '提交作业', '查看成绩', '查看日历/截止日期'],
    keywords: ['Courses', 'Calendar', 'Grades', 'Assignments', 'Content', 'Discussion', 'Submit', 'Due', '课程', '作业', '成绩'],
    ethics: '允许导航课程和解释要求；考试/测验页面进入静默辅助，不自动点击提交或选择答案。',
    guidance: '优先识别 Courses、Calendar、Grades、Assignments、Content、Submit 和 Due Date。'
  },
  {
    id: 'github',
    name: 'GitHub',
    hosts: ['github.com'],
    category: 'open-source-learning',
    tasks: ['搜索开源项目', '阅读 README', '查看代码', '查看 Issues', '查看 Pull Requests', '下载/克隆项目'],
    keywords: ['README', 'Code', 'Issues', 'Pull requests', 'Actions', 'Wiki', 'Releases', 'Stars', 'Fork', 'Clone'],
    ethics: '开源资源可用于学习；提醒遵守 LICENSE，不把复制代码伪装成原创作业。',
    guidance: '优先帮助学生理解 README、项目语言、目录结构、Issues、PR 和 LICENSE。'
  },
  {
    id: 'ieee',
    name: 'IEEE Xplore',
    hosts: ['ieeexplore.ieee.org'],
    category: 'academic-literature',
    tasks: ['搜索论文', '查看摘要', '查看作者', '下载 PDF', '导出引用', '查看 DOI'],
    keywords: ['Abstract', 'Authors', 'PDF', 'Cite This', 'DOI', 'References', 'Metrics', 'Publication', 'IEEE'],
    ethics: '可以辅助检索、摘要和引用；不能代写论文，引用必须标明来源。',
    guidance: '优先识别 Abstract、Authors、PDF、Cite This、DOI、References 等学术元素。'
  },
  {
    id: 'jwxt-sias',
    name: '西亚斯数维教务',
    hosts: ['jwxt.sias.edu.cn'],
    category: 'academic-affairs',
    tasks: ['查看课表', '查询成绩', '选课/退课', '培养方案', '考试安排', '个人信息'],
    keywords: ['课表', '成绩', '选课', '退课', '培养方案', '考试安排', '学籍', '教学评价', '个人信息'],
    ethics: '只做教务导航和解释；选课、退课、评价、提交等关键动作必须让用户确认。',
    guidance: '优先识别课表、成绩、选课、培养方案、考试安排等教务入口，关键操作默认高亮不自动点击。'
  }
]);

function normalizeHost(urlOrHost) {
  try {
    return new URL(urlOrHost).hostname.toLowerCase();
  } catch (_) {
    return String(urlOrHost || '').toLowerCase();
  }
}

export function identifySite(urlOrHost) {
  const host = normalizeHost(urlOrHost);
  if (!host) return null;
  return SITE_PROFILES.find(function(profile) {
    return profile.hosts.some(function(rule) {
      return host === rule || host.endsWith('.' + rule);
    });
  }) || null;
}

export function buildSitePrompt(profile) {
  if (!profile) return '';
  return [
    '## 专项站点画像',
    '当前站点：' + profile.name,
    '站点类别：' + profile.category,
    '常见学习任务：' + profile.tasks.join('、'),
    '优先识别关键词：' + profile.keywords.join('、'),
    '教育与伦理边界：' + profile.ethics,
    '导航策略：' + profile.guidance,
    '执行原则：关键学习/教务/提交类操作默认高亮并解释，让用户自己确认；只有用户明确要求点击时才自动点击。'
  ].join('\n');
}
