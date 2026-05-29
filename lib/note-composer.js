/**
 * Note Composer — 本地模板生成学习笔记 Markdown
 */

function composerCleanText(value, maxLength) {
  const text = String(value || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n...（内容过长已截断）';
}

function composerSentenceList(text, limit) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const chunks = normalized.split(/(?<=[。！？!?；;])\s*|\n+/).map(s => s.trim()).filter(Boolean);
  return chunks.slice(0, limit);
}

function composerKeywords(source) {
  const text = [source?.title, source?.description, source?.text].join(' ');
  const matches = text.match(/[\u4e00-\u9fa5A-Za-z0-9][\u4e00-\u9fa5A-Za-z0-9+#._-]{1,20}/g) || [];
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', '页面', '课程', '学习']);
  const seen = new Set();
  return matches
    .filter(item => item.length > 1 && !stop.has(item.toLowerCase()))
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

function inferStudyTheme(sources) {
  const joined = sources.map(source => [source.title, source.description, source.text].join(' ')).join(' ');
  const candidates = [
    ['人工智能与编程', /AI|人工智能|机器学习|深度学习|Python|代码|GitHub|算法/i],
    ['课程学习与作业管理', /课程|作业|成绩|Blackboard|MOOC|学习通|教务/i],
    ['科研论文与文献阅读', /论文|文献|IEEE|abstract|research|journal|conference/i],
    ['学籍学历与校园服务', /学信网|学籍|学历|认证|报告|教务|校园/i]
  ];
  const found = candidates.find(item => item[1].test(joined));
  return found ? found[0] : '通用学习主题';
}

function buildLearningPath(theme, keywords) {
  const keyText = keywords.slice(0, 4).join('、') || theme;
  return [
    '第 1 步：先用 10 分钟浏览资料目录，圈出与“' + keyText + '”直接相关的内容。',
    '第 2 步：精读核心页面或课程小节，把定义、流程、示例分别记下来。',
    '第 3 步：完成一个最小练习，例如复述概念、运行示例、检索一篇相关资料或打开对应平台入口。',
    '第 4 步：用本笔记的复习问题自测，把不会解释的点加入下一轮学习任务。'
  ];
}

function buildPlatformSuggestions(theme, keywords) {
  const query = keywords.slice(0, 3).join(' ') || theme;
  const encodedQuery = encodeURIComponent(query);
  return [
    '- **中国大学 MOOC**：查找系统课程，适合补基础与拿证书；网址：https://www.icourse163.org/search.htm?search=' + encodedQuery,
    '- **B 站**：查找案例讲解和操作演示，适合快速建立直观理解；网址：https://search.bilibili.com/all?keyword=' + encodedQuery,
    '- **GitHub**：查找开源项目、README 和样例代码，适合 IT/AI 方向实践；网址：https://github.com/search?q=' + encodedQuery,
    '- **IEEE Xplore**：查找英文论文和技术文献，适合科研拓展和高阶阅读；网址：https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=' + encodedQuery
  ];
}

function buildSelfTestQuestions(keyPoints, keywords) {
  const firstKeyword = keywords[0] || '这个主题';
  const firstPoint = keyPoints[0] || '资料中的核心观点';
  return [
    '- 我能否用 1 分钟解释 `' + firstKeyword.replace(/`/g, '') + '` 是什么？',
    '- `' + composerCleanText(firstPoint, 80).replace(/`/g, '') + '` 对当前学习任务有什么用？',
    '- 哪一个知识点需要回到原网站继续查看、练习或验证？',
    '- 如果要给同学讲这一页，我会先讲哪三个要点？'
  ];
}

function buildFlashcards(keyPoints, keywords) {
  const cards = [];
  keywords.slice(0, 6).forEach(function(keyword) {
    cards.push({
      front: keyword.replace(/`/g, ''),
      back: '请结合资料解释 `' + keyword.replace(/`/g, '') + '` 的含义、用途和一个例子。'
    });
  });
  keyPoints.slice(0, 4).forEach(function(point, index) {
    cards.push({
      front: '核心要点 ' + (index + 1),
      back: composerCleanText(point, 160)
    });
  });
  return cards.slice(0, 8);
}

function composerDateText(value) {
  try {
    return new Date(value || Date.now()).toLocaleString('zh-CN', { hour12: false });
  } catch (_) {
    return '';
  }
}

export function composeStudyNote(input) {
  const options = input || {};
  const sources = Array.isArray(options.sources) ? options.sources : [];
  const titleSource = sources[0] || {};
  const noteTitle = composerCleanText(options.title || titleSource.title || '学习笔记', 80);
  const goal = composerCleanText(options.goal || options.prompt || '整理当前页面中的学习要点，形成可复习的 Markdown 笔记。', 200);
  const now = new Date().toISOString();

  const sourceLines = sources.map((source, index) => {
    const label = source.title || source.url || ('来源 ' + (index + 1));
    return '- [' + label.replace(/\]/g, '\\]') + '](' + (source.url || '#') + ')';
  });

  const keyPoints = sources.flatMap(source => composerSentenceList(source.text || source.description || source.excerpt, 3)).slice(0, 8);
  const keywords = sources.flatMap(composerKeywords).filter((item, index, arr) => arr.indexOf(item) === index).slice(0, 12);
  const theme = inferStudyTheme(sources);
  const learningPath = buildLearningPath(theme, keywords);
  const platformSuggestions = buildPlatformSuggestions(theme, keywords);
  const selfTestQuestions = buildSelfTestQuestions(keyPoints, keywords);
  const flashcards = buildFlashcards(keyPoints, keywords);

  const markdown = [
    '# ' + noteTitle,
    '',
    '> 生成时间：' + composerDateText(now),
    '> 生成方式：本地模板（未调用外部 API）',
    '',
    '## 学习目标',
    goal,
    '',
    '## 资料来源',
    sourceLines.length ? sourceLines.join('\n') : '- 暂无已采集页面',
    '',
    '## 核心要点',
    keyPoints.length ? keyPoints.map(point => '- ' + composerCleanText(point, 220)).join('\n') : '- 暂无足够正文，可先采集当前页面内容。',
    '',
    '## 关键词',
    keywords.length ? keywords.map(word => '`' + word.replace(/`/g, '') + '`').join(' ') : '暂无关键词',
    '',
    '## 学习路径',
    learningPath.map(item => '- ' + item).join('\n'),
    '',
    '## 推荐平台与下一步',
    platformSuggestions.join('\n'),
    '',
    '## 自测问题',
    selfTestQuestions.join('\n'),
    '',
    '## 闪卡',
    flashcards.length ? flashcards.map(function(card, index) {
      return '- Q' + (index + 1) + '：' + card.front + '\n  A：' + card.back;
    }).join('\n') : '- 暂无足够内容生成闪卡。',
    '',
    '## 学术诚信提醒',
    '- 本笔记用于辅助理解、整理资料和制定学习计划。',
    '- 涉及作业、论文、考试时，请保留自己的判断，规范引用来源，不直接照搬生成内容。',
    '',
    '## 原文摘录',
    sources.map((source, index) => {
      return [
        '### ' + (source.title || ('来源 ' + (index + 1))),
        composerCleanText(source.text || source.excerpt || source.description || '暂无正文', 1200)
      ].join('\n\n');
    }).join('\n\n')
  ].join('\n');

  return {
    title: noteTitle,
    markdown,
    sourceIds: sources.map(source => source.id).filter(Boolean),
    createdAt: now
  };
}
