/**
 * Exporter — 学习笔记多格式导出数据准备
 * Document style: zhiyinling-document-style
 */

function exporterSlug(value) {
  return String(value || 'study-note')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'study-note';
}

function exporterDateStamp(value) {
  const date = value ? new Date(value) : new Date();
  const pad = n => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('');
}

function exportHostFromUrl(value) {
  try {
    return value ? new URL(value).hostname.replace(/^www\./, '') : '';
  } catch (_) {
    return '';
  }
}

function extractExportSiteName(note, markdown) {
  const target = note || {};
  const direct = target.siteName || target.site || target.host || target.sourceHost || target.sourceSite;
  if (direct) return String(direct).replace(/^www\./, '');
  const url = target.url || target.sourceUrl || '';
  const host = exportHostFromUrl(url);
  if (host) return host;
  const text = String(markdown || target.markdown || '');
  const link = text.match(/https?:\/\/[^\s)]+/i);
  return link ? exportHostFromUrl(link[0]) : '';
}

function exportFileBaseName(note, markdown, fallbackTitle) {
  const title = cleanDisplayTitle(markdownTitle(markdown || note?.markdown || '', fallbackTitle || note?.title || '学习笔记'));
  const site = extractExportSiteName(note, markdown);
  return [site, title].filter(Boolean).join('-') || title || '学习笔记';
}

function sanitizeExportMarkdown(markdown) {
  return String(markdown || '')
    .replace(/(^|\n)#{1,6}\s*(?:数字人)?(?:讲解脚本|演讲脚本|讲稿|解说词|口播稿)\s*\n[\s\S]*?(?=\n#{1,6}\s+|$)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function prepareMarkdownExport(note) {
  const target = note || {};
  const title = target.title || '学习笔记';
  const markdown = sanitizeExportMarkdown(target.markdown || '# ' + title + '\n\n暂无笔记内容。\n');
  return {
    ok: true,
    filename: exporterSlug(exportFileBaseName(target, markdown, title)) + '-' + exporterDateStamp(target.createdAt) + '.md',
    markdown
  };
}

function exporterEscapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function exporterSafeHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '#';
  if (/[\s"'<>]/.test(raw)) return '#';
  if (/^(https?:|mailto:)/i.test(raw)) return exporterEscapeHtml(raw);
  if (/^[./#]/.test(raw)) return exporterEscapeHtml(raw);
  return '#';
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const html = [];
  let inList = false;
  let inQuote = false;

  function closeBlocks() {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    if (inQuote) {
      html.push('</blockquote>');
      inQuote = false;
    }
  }

  function inline(value) {
    return exporterEscapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, label, url) {
        return '<a href="' + exporterSafeHref(url) + '">' + label + '</a>';
      });
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeBlocks();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeBlocks();
      const level = Math.min(heading[1].length, 4);
      html.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
      continue;
    }
    const item = line.match(/^[-*]\s+(.+)$/);
    if (item) {
      if (!inList) {
        closeBlocks();
        html.push('<ul>');
        inList = true;
      }
      html.push('<li>' + inline(item[1]) + '</li>');
      continue;
    }
    const quote = line.match(/^>\s*(.+)$/);
    if (quote) {
      if (!inQuote) {
        if (inList) {
          html.push('</ul>');
          inList = false;
        }
        html.push('<blockquote>');
        inQuote = true;
      }
      html.push('<p>' + inline(quote[1]) + '</p>');
      continue;
    }
    closeBlocks();
    html.push('<p>' + inline(line) + '</p>');
  }
  closeBlocks();
  return html.join('\n');
}

function markdownTitle(markdown, fallback) {
  const m = String(markdown || '').match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

function cleanDisplayTitle(value) {
  let text = stripMarkdownInline(value || '学习笔记')
    .replace(/^视口[:：]\s*/i, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[\/\\]+/g, ' ');
  const parts = text.split(/[：:]/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) text = parts[parts.length - 1];
  text = text
    .replace(/[A-Za-z0-9._-]+(?=存储库|仓库|项目)/g, '项目')
    .replace(/[-_]{2,}/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || '学习笔记';
}

function stripMarkdownInline(value) {
  return String(value || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^>\s*/, '')
    .trim();
}

function parseNoteSections(markdown, fallbackTitle) {
  const text = sanitizeExportMarkdown(markdown || '');
  const title = cleanDisplayTitle(markdownTitle(text, fallbackTitle || '学习笔记'));
  const sections = [];
  const re = /^##\s+(.+)$/gm;
  let match;
  const matches = [];
  while ((match = re.exec(text))) {
    matches.push({ title: stripMarkdownInline(match[1]), index: match.index, end: re.lastIndex });
  }
  matches.forEach(function(item, index) {
    const next = matches[index + 1];
    const body = text.slice(item.end, next ? next.index : text.length).trim();
    const bullets = body.split(/\r?\n/)
      .map(stripMarkdownInline)
      .filter(Boolean)
      .slice(0, 7);
    sections.push({ title: item.title, bullets });
  });
  if (!sections.length) {
    const bullets = text.split(/\r?\n/).map(stripMarkdownInline).filter(Boolean).slice(1, 8);
    sections.push({ title: '核心内容', bullets: bullets.length ? bullets : ['暂无笔记内容。'] });
  }
  return { title, sections };
}

function findParsedSection(parsed, names) {
  const wanted = names.map(name => String(name).toLowerCase());
  return (parsed.sections || []).find(function(section) {
    const title = String(section.title || '').toLowerCase();
    return wanted.some(name => title.indexOf(name) !== -1);
  }) || null;
}

function graphNodeText(value, maxLength) {
  const text = stripMarkdownInline(value || '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^Q\d+[：:]\s*/i, '')
    .replace(/^A[：:]\s*/i, '')
    .replace(/^(提示|案例一|案例二|步骤|推荐平台|知识管理|流程设计)[：:]\s*/i, '$1')
    .replace(/\s*\([^)]{0,80}\)\s*/g, ' ')
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

function uniqueGraphItems(items, limit, maxLength) {
  const seen = new Set();
  const out = [];
  (items || []).forEach(function(item) {
    const text = graphNodeText(item, maxLength);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out.slice(0, limit);
}

const KNOWLEDGE_GRAPH_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#ea580c', '#be123c', '#0891b2', '#4f46e5', '#16a34a'];
const KNOWLEDGE_GRAPH_SKIP_RE = /资料来源|原文摘录|学术诚信|生成时间|来源说明|参考链接|附录/i;

function graphItemsForSection(section, limit) {
  const title = String(section?.title || '');
  const bullets = section?.bullets || [];
  if (/关键词|keywords/i.test(title)) {
    return uniqueGraphItems(
      bullets.join(' ').replace(/`/g, '').split(/\s+|、|，|,|；|;/),
      limit,
      10
    );
  }
  return uniqueGraphItems(bullets, limit, 10);
}

function buildAdaptiveGraphGroups(parsed) {
  const sections = (parsed.sections || [])
    .filter(function(section) {
      const title = String(section.title || '').trim();
      const bullets = section.bullets || [];
      return title && bullets.length && !KNOWLEDGE_GRAPH_SKIP_RE.test(title);
    });
  const maxBranches = 7;
  const selected = sections.slice(0, maxBranches);
  const branchCount = selected.length;
  const itemLimit = branchCount <= 3 ? 3 : branchCount <= 5 ? 2 : 1;
  const groups = selected.map(function(section, index) {
    return {
      id: 'section-' + index,
      label: graphNodeText(section.title, 12),
      color: KNOWLEDGE_GRAPH_COLORS[index % KNOWLEDGE_GRAPH_COLORS.length],
      items: graphItemsForSection(section, itemLimit)
    };
  }).filter(group => group.items && group.items.length);
  if (sections.length > maxBranches) {
    const extraItems = sections.slice(maxBranches)
      .flatMap(section => section.bullets || []);
    const moreItems = uniqueGraphItems(extraItems, 1, 10);
    if (moreItems.length) {
      groups.push({
        id: 'section-more',
        label: '更多要点',
        color: KNOWLEDGE_GRAPH_COLORS[groups.length % KNOWLEDGE_GRAPH_COLORS.length],
        items: moreItems
      });
    }
  }
  return groups;
}

function buildKnowledgeGraphData(markdown, fallbackTitle) {
  const parsed = parseNoteSections(markdown, fallbackTitle);
  const adaptiveGroups = buildAdaptiveGraphGroups(parsed);
  if (adaptiveGroups.length) {
    return {
      title: parsed.title,
      center: cleanDisplayTitle(parsed.title || fallbackTitle || '学习主题'),
      groups: adaptiveGroups
    };
  }
  const keywordSection = findParsedSection(parsed, ['关键词', 'keywords']);
  const coreSection = findParsedSection(parsed, ['核心要点', '核心内容', '要点']);
  const pathSection = findParsedSection(parsed, ['学习路径', '路径']);
  const platformSection = findParsedSection(parsed, ['推荐平台', '下一步', '资源']);
  const reviewSection = findParsedSection(parsed, ['自测', '闪卡', '复习']);
  const keywords = uniqueGraphItems(keywordSection ? keywordSection.bullets.join(' ').replace(/`/g, '').split(/\s+|、|，|,/) : [], 4, 10);
  const core = uniqueGraphItems(coreSection?.bullets || [], 3, 12);
  const path = uniqueGraphItems(pathSection?.bullets || [], 3, 12);
  const platforms = uniqueGraphItems(platformSection?.bullets || [], 3, 12);
  const review = uniqueGraphItems(reviewSection?.bullets || [], 3, 12);
  return {
    title: parsed.title,
    center: cleanDisplayTitle(parsed.title || fallbackTitle || '学习主题'),
    groups: [
      { id: 'core', label: '核心概念', color: '#2563eb', items: keywords.length ? keywords : core.slice(0, 4) },
      { id: 'evidence', label: '内容依据', color: '#0f766e', items: core },
      { id: 'path', label: '学习路径', color: '#7c3aed', items: path },
      { id: 'resources', label: '资源平台', color: '#ea580c', items: platforms },
      { id: 'review', label: '复习训练', color: '#be123c', items: review }
    ].filter(group => group.items && group.items.length)
  };
}

function svgTextLines(text, maxChars) {
  return wrapTextLine(text, maxChars).slice(0, 2);
}

function buildKnowledgeGraphHtml(markdown, fallbackTitle) {
  const graph = buildKnowledgeGraphData(markdown, fallbackTitle);
  const groups = graph.groups.length ? graph.groups : [
    { id: 'core', label: '核心概念', color: '#2563eb', items: ['学习主题'] },
    { id: 'path', label: '学习路径', color: '#7c3aed', items: ['理解', '练习', '复习'] }
  ];
  const branchCount = groups.length;
  const topic = { x: 112, y: 366, width: 194, height: 44 };
  const topY = 106;
  const bottomY = 704;
  const spacing = branchCount > 1 ? Math.min(138, Math.max(78, (bottomY - topY) / (branchCount - 1))) : 0;
  const startY = branchCount > 1 ? 386 - (spacing * (branchCount - 1)) / 2 : 366;
  const groupSvg = groups.map(function(group, index) {
    const groupY = startY + index * spacing;
    const branch = { x: 390, y: groupY, width: 152, height: 36 };
    const maxLeafCount = branchCount <= 3 ? 3 : branchCount <= 5 ? 2 : 1;
    const items = group.items.slice(0, maxLeafCount);
    const leafOffsets = items.length === 1 ? [0] : items.length === 2 ? [-26, 28] : [-46, 0, 46];
    const leafSvg = items.map(function(item, itemIndex) {
      const leafY = groupY + leafOffsets[itemIndex] - 16;
      const leafText = [graphNodeText(item, 10)];
      return '<path d="M ' + (branch.x + branch.width) + ' ' + (branch.y + branch.height / 2) +
        ' C ' + (branch.x + branch.width + 30) + ' ' + (branch.y + branch.height / 2) +
        ', ' + (branch.x + branch.width + 34) + ' ' + (leafY + 18) +
        ', ' + 614 + ' ' + (leafY + 18) + '" class="kg-edge kg-edge-soft"/>' +
        '<rect x="614" y="' + leafY + '" width="150" height="32" rx="7" class="kg-leaf"/>' +
        leafText.map(function(line, lineIndex) {
          return '<text x="628" y="' + (leafY + 20 + lineIndex * 12) + '" class="kg-leaf-text">' + exporterEscapeHtml(line) + '</text>';
        }).join('');
    }).join('');
    const branchLines = svgTextLines(group.label, 13);
    return '<path d="M ' + (topic.x + topic.width) + ' ' + (topic.y + topic.height / 2) +
      ' C ' + (topic.x + topic.width + 46) + ' ' + (topic.y + topic.height / 2) +
      ', ' + (branch.x - 44) + ' ' + (branch.y + branch.height / 2) +
      ', ' + branch.x + ' ' + (branch.y + branch.height / 2) + '" class="kg-edge"/>' +
      '<g class="kg-branch">' +
      '<rect x="' + branch.x + '" y="' + branch.y + '" width="' + branch.width + '" height="' + branch.height + '" rx="8" class="kg-branch-box"/>' +
      '<circle cx="' + (branch.x - 9) + '" cy="' + (branch.y + branch.height / 2) + '" r="7" class="kg-dot"/>' +
      branchLines.map(function(line, lineIndex) {
        return '<text x="' + (branch.x + 12) + '" y="' + (branch.y + 23 + lineIndex * 12) + '" class="kg-branch-text">' + exporterEscapeHtml(line) + '</text>';
      }).join('') +
      leafSvg +
      '</g>';
  }).join('');
  const topicLines = svgTextLines(graph.center, 14);
  const treeSvg = [
    '<rect x="' + topic.x + '" y="' + topic.y + '" width="' + topic.width + '" height="' + topic.height + '" rx="8" class="kg-topic"/>',
    topicLines.map(function(line, index) {
      return '<text x="' + (topic.x + 16) + '" y="' + (topic.y + 27 + index * 12) + '" class="kg-topic-text">' + exporterEscapeHtml(line) + '</text>';
    }).join(''),
    groupSvg
  ].join('');
  return [
    '<section class="knowledge-graph-page">',
    '<div class="kg-page-head">',
    '<span>智引学习图谱</span>',
    '<strong>Mind Map</strong>',
    '</div>',
    '<h2>思维导图</h2>',
    '<svg class="kg-svg" viewBox="0 0 820 760" role="img" aria-label="学习思维导图">',
    '<defs><filter id="kg-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#93c5fd" flood-opacity="0.16"/></filter></defs>',
    treeSvg,
    '</svg>',
    '<div class="kg-footnote">思维导图用于辅助复习和汇报展示；节点来自当前笔记内容，仍建议结合原网页与课程要求进行二次校对。</div>',
    '</section>'
  ].join('\n');
}

function buildReportSubtitle(markdown, fallbackTitle) {
  const parsed = parseNoteSections(markdown, fallbackTitle);
  const first = (parsed.sections || []).find(section => section.bullets && section.bullets.length && !KNOWLEDGE_GRAPH_SKIP_RE.test(section.title || ''));
  const line = first ? graphNodeText(first.bullets[0], 58) : '';
  return line || '围绕当前页面内容整理重点、路径、资源与复习材料。';
}

function buildReportChips(markdown, fallbackTitle) {
  const parsed = parseNoteSections(markdown, fallbackTitle);
  const chips = (parsed.sections || [])
    .map(section => graphNodeText(section.title, 10))
    .filter(title => title && !KNOWLEDGE_GRAPH_SKIP_RE.test(title))
    .slice(0, 4);
  return chips.length ? chips : ['学习主题', '核心要点', '复习任务'];
}

function buildDocumentHtml(note, mode) {
  const target = note || {};
  const title = target.title || '学习笔记';
  const markdown = sanitizeExportMarkdown(target.markdown || '# ' + title + '\n\n暂无笔记内容。\n');
  const displayTitle = cleanDisplayTitle(markdownTitle(markdown, title));
  const reportSubtitle = buildReportSubtitle(markdown, title);
  const reportChips = buildReportChips(markdown, title);
  const body = markdownToHtml(markdown);
  const knowledgeGraph = mode === 'pdf' ? buildKnowledgeGraphHtml(markdown, title) : '';
  const knowledgeGraphStyles = mode === 'pdf' ? [
    '.knowledge-graph-page{break-before:page;page-break-before:always;min-height:calc(100vh - 38mm);padding:10mm 0 0;}',
    '.kg-page-head{display:flex;justify-content:space-between;align-items:center;color:#64748b;font-size:12px;border-bottom:1px solid #dbeafe;padding-bottom:8px;margin-bottom:16px;}',
    '.kg-page-head strong{color:#1e40af;letter-spacing:.08em;}',
    '.knowledge-graph-page h2{border:none;margin:0 0 12px;color:#1e40af;font-size:28px;padding:0;}',
    '.kg-desc{margin:8px 0 16px;color:#64748b;font-size:13px;max-width:760px;}',
    '.kg-svg{display:block;width:96%;max-width:800px;margin:0 auto 10px;filter:url(#kg-shadow);}',
    '.kg-svg text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;}',
    '.kg-edge,.kg-root-edge{fill:none;stroke:#93c5fd;stroke-width:2.4;stroke-linecap:round;}',
    '.kg-edge-soft{stroke:#8bb7a9;stroke-width:1.7;}',
    '.kg-root-edge{stroke:#a5b4fc;}',
    '.kg-root{fill:#c7d2fe;stroke:#a5b4fc;}',
    '.kg-topic{fill:#dbeafe;stroke:#bfdbfe;}',
    '.kg-branch-box{fill:#b7e4d1;stroke:#9bd5be;}',
    '.kg-leaf{fill:#b9edc8;stroke:#a4ddb6;}',
    '.kg-dot{fill:#e0f2fe;stroke:#7dd3fc;stroke-width:2;}',
    '.kg-root-text,.kg-topic-text,.kg-branch-text{font-size:11px;font-weight:800;fill:#1f2937;}',
    '.kg-leaf-text{font-size:9.5px;font-weight:700;fill:#1f2937;}',
    '.kg-footnote{font-size:11px;color:#64748b;border-top:1px solid #e5ebf3;padding-top:10px;margin-top:6px;}'
  ].join('\n') : '';
  const printMedia = mode === 'pdf'
    ? '@media print{body{background:#fff}.page{padding:0 0 18mm;max-width:none}.cover{margin:0 0 28px;padding:16mm 0 13mm}.summary-grid{break-inside:avoid}.knowledge-graph-page{break-before:page;page-break-before:always}.no-print{display:none}}'
    : '@media print{body{background:#fff}.page{padding:0 0 18mm;max-width:none}.cover{margin:0 0 28px;padding:16mm 0 13mm}.summary-grid{break-inside:avoid}.no-print{display:none}}';
  const printScript = mode === 'pdf'
    ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},450);});</script>'
    : '';
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>' + exporterEscapeHtml(title) + '</title>',
    '<style>',
    '@page{size:A4;margin:17mm 16mm 16mm;}',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;color:#1f2937;line-height:1.72;margin:0;background:#f8fafc;}',
    '.page{max-width:900px;margin:0 auto;background:#fff;min-height:100vh;padding:0 50px 42px;box-sizing:border-box;}',
    '.cover{margin:0 -50px 34px;padding:64px 50px 42px;background:#fff;border-bottom:1px dashed #dbeafe;text-align:center;}',
    '.brand{font-size:14px;letter-spacing:.08em;color:#64748b;font-weight:700;margin-bottom:24px;}',
    '.cover h1{font-size:36px;line-height:1.24;margin:0 auto 20px;color:#111827;max-width:720px;font-weight:800;}',
    '.title-rule{width:120px;height:4px;background:#3b82f6;margin:0 auto 24px;}',
    '.subtitle{font-size:16px;color:#64748b;max-width:680px;margin:0 auto;}',
    '.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px;}',
    '.chip{font-size:12px;color:#1e40af;background:#eff6ff;border:1px solid #dbeafe;border-radius:999px;padding:5px 10px;}',
    '.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 28px;}',
    '.summary-card{border:1px solid #dbeafe;background:#eff6ff;padding:13px 15px;border-left:4px solid #3b82f6;}',
    '.summary-card b{display:block;color:#1e40af;font-size:13px;margin-bottom:5px;}',
    '.summary-card span{font-size:12px;color:#64748b;}',
    'main.content h1{display:none;}',
    'h2{font-size:20px;margin:28px 0 12px;color:#1e40af;border-bottom:3px solid #3b82f6;padding-bottom:8px;}',
    'h2::before{content:none;}',
    'h3{font-size:16px;margin:22px 0 8px;color:#1e40af;}',
    'p,li{font-size:14px;color:#1f2937;}',
    'ul{padding-left:0;margin:8px 0 16px;list-style:none;}',
    'li{position:relative;margin:7px 0;padding-left:18px;}',
    'li:before{content:"";position:absolute;left:0;top:.75em;width:6px;height:6px;border-radius:50%;background:#3b82f6;}',
    'blockquote{margin:16px 0;padding:13px 16px;border-left:4px solid #3b82f6;background:#eff6ff;color:#1f2937;}',
    'code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#eef1f6;padding:1px 5px;border-radius:4px;}',
    'a{color:#1769e0;text-decoration:none;}',
    '.watermark{margin-top:36px;color:#7b8797;font-size:12px;border-top:1px solid #e5ebf3;padding-top:12px;}',
    knowledgeGraphStyles,
    printMedia,
    '</style>',
    '</head>',
    '<body><article class="page">',
    '<header class="cover">',
    '<div class="brand">学习报告</div>',
    '<h1>' + exporterEscapeHtml(displayTitle) + '</h1>',
    '<div class="title-rule"></div>',
    '<div class="subtitle">' + exporterEscapeHtml(reportSubtitle) + '</div>',
    '<div class="chips" style="justify-content:center">' + reportChips.map(chip => '<span class="chip">' + exporterEscapeHtml(chip) + '</span>').join('') + '</div>',
    '</header><main class="content">',
    body,
    '</main>',
    knowledgeGraph,
    '<div class="watermark">由智引 AI 导航导师生成。请结合课程要求独立判断并规范引用来源。</div>',
    '</article>' + printScript + '</body></html>'
  ].join('\n');
}

export function prepareWordExport(note) {
  const target = note || {};
  const title = target.title || '学习笔记';
  const markdown = sanitizeExportMarkdown(target.markdown || '# ' + title + '\n\n暂无笔记内容。\n');
  return {
    ok: true,
    filename: exporterSlug(exportFileBaseName(target, markdown, title)) + '-' + exporterDateStamp(target.createdAt) + '.doc',
    mimeType: 'application/msword;charset=utf-8',
    html: buildDocumentHtml(target, 'word')
  };
}

export function preparePrintablePdfExport(note) {
  const target = note || {};
  const title = target.title || '学习笔记';
  const markdown = sanitizeExportMarkdown(target.markdown || '# ' + title + '\n\n暂无笔记内容。\n');
  return {
    ok: true,
    filename: exporterSlug(exportFileBaseName(target, markdown, title)) + '-' + exporterDateStamp(target.createdAt) + '.pdf',
    mimeType: 'application/pdf',
    base64: buildPdfBase64(title, markdown),
    html: buildDocumentHtml(target, 'pdf'),
    instruction: '已打开高质量 PDF 打印版，请在打印窗口选择“保存为 PDF”。'
  };
}

function markdownPlainLines(markdown, fallbackTitle) {
  const raw = String(markdown || ('# ' + fallbackTitle)).split(/\r?\n/);
  const lines = [];
  raw.forEach(function(line) {
    const clean = line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*]\s*/, '• ')
      .replace(/^>\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .trim();
    if (clean) lines.push(clean);
  });
  return lines.length ? lines : [fallbackTitle || '学习笔记'];
}

function wrapTextLine(line, maxChars) {
  const text = String(line || '');
  const out = [];
  let current = '';
  for (const ch of text) {
    const width = /[^\x00-\xff]/.test(ch) ? 2 : 1;
    const len = Array.from(current).reduce((sum, c) => sum + (/[^\x00-\xff]/.test(c) ? 2 : 1), 0);
    if (len + width > maxChars && current) {
      out.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}

function pdfHexText(text) {
  const bytes = [];
  for (const ch of String(text || '')) {
    const code = ch.codePointAt(0);
    if (code > 0xffff) {
      const u = code - 0x10000;
      const hi = 0xd800 + (u >> 10);
      const lo = 0xdc00 + (u & 0x3ff);
      bytes.push(hi >> 8, hi & 255, lo >> 8, lo & 255);
    } else {
      bytes.push(code >> 8, code & 255);
    }
  }
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function buildPdfBase64(title, markdown) {
  const parsed = parseNoteSections(markdown, title);
  const pages = buildPdfPages(parsed.title, parsed.sections);
  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pages.map((_, i) => (6 + i * 2) + ' 0 R').join(' ');
  objects.push('<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>');
  objects.push('<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>');
  objects.push('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> >>');
  objects.push('<< /ProcSet [/PDF /Text] /Font << /F1 3 0 R >> >>');
  pages.forEach(function(pageLines, i) {
    const pageObjNo = 6 + i * 2;
    const contentObjNo = pageObjNo + 1;
    const stream = pdfPageStream(pageLines, i + 1, pages.length, parsed.title);
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources 5 0 R /Contents ' + contentObjNo + ' 0 R >>');
    objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(function(obj, i) {
    offsets.push(pdf.length);
    pdf += (i + 1) + ' 0 obj\n' + obj + '\nendobj\n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  offsets.slice(1).forEach(function(off) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return btoa(pdf);
}

function pdfText(text, x, y, size, color) {
  const c = color || [16, 34, 63];
  return [
    (c[0] / 255).toFixed(3) + ' ' + (c[1] / 255).toFixed(3) + ' ' + (c[2] / 255).toFixed(3) + ' rg',
    'BT /F1 ' + size + ' Tf ' + x + ' ' + y + ' Td <' + pdfHexText(text) + '> Tj ET'
  ].join('\n');
}

function pdfRect(x, y, w, h, color) {
  return (color[0] / 255).toFixed(3) + ' ' + (color[1] / 255).toFixed(3) + ' ' + (color[2] / 255).toFixed(3) + ' rg\n' +
    x + ' ' + y + ' ' + w + ' ' + h + ' re f';
}

function buildPdfPages(title, sections) {
  const pages = [{ type: 'cover', title, sections }];
  const current = { type: 'content', items: [] };
  let used = 0;
  sections.forEach(function(section) {
    const lines = [];
    (section.bullets || []).forEach(function(item) {
      wrapTextLine(item, 44).forEach(part => lines.push(part));
    });
    const cost = 2 + lines.length;
    if (used && used + cost > 28) {
      pages.push({ type: 'content', items: current.items.splice(0) });
      used = 0;
    }
    current.items.push({ title: section.title, lines });
    used += cost;
  });
  if (current.items.length) pages.push(current);
  return pages;
}

function pdfPageStream(page, pageNo, pageCount, title) {
  const chunks = [];
  chunks.push(pdfRect(0, 0, 595, 842, [255, 255, 255]));
  chunks.push(pdfRect(44, 806, 507, 3, [59, 130, 246]));
  chunks.push(pdfText('学习报告', 44, 818, 10, [30, 64, 175]));
  chunks.push(pdfText(String(pageNo), 292, 28, 9, [148, 163, 184]));
  chunks.push(pdfText('请结合课程要求独立判断并规范引用来源', 44, 28, 9, [110, 124, 147]));
  if (page.type === 'cover') {
    chunks.push(pdfRect(44, 616, 507, 132, [239, 246, 255]));
    chunks.push(pdfRect(44, 616, 5, 132, [59, 130, 246]));
    const titleLines = wrapTextLine(cleanDisplayTitle(page.title || title), 22).slice(0, 3);
    titleLines.forEach(function(line, i) {
      chunks.push(pdfText(line, 70, 708 - i * 28, i ? 17 : 21, [30, 64, 175]));
    });
    const lead = (page.sections || []).find(section => section.lines && section.lines.length);
    const leadText = lead?.lines?.[0] || '围绕当前页面内容整理重点、路径、资源与复习材料。';
    wrapTextLine(leadText, 34).slice(0, 2).forEach(function(line, i) {
      chunks.push(pdfText(line, 70, Math.max(638, 692 - titleLines.length * 28) - i * 18, 10, [82, 101, 127]));
    });
    chunks.push(pdfText('内容目录', 44, 540, 18, [30, 64, 175]));
    chunks.push(pdfRect(44, 526, 120, 3, [59, 130, 246]));
    (page.sections || []).slice(0, 9).forEach(function(section, i) {
      chunks.push(pdfRect(44, 508 - i * 34, 8, 8, [59, 130, 246]));
      chunks.push(pdfText(section.title, 64, 504 - i * 34, 12, [37, 54, 77]));
    });
    return chunks.join('\n');
  }
  chunks.push(pdfText(cleanDisplayTitle(title), 44, 766, 13, [30, 64, 175]));
  let y = 724;
  (page.items || []).forEach(function(item, index) {
    const blockHeight = Math.min(150, 48 + item.lines.length * 18);
    chunks.push(pdfRect(44, y + 8, 507, 3, [59, 130, 246]));
    chunks.push(pdfText(item.title, 44, y - 15, 16, [30, 64, 175]));
    let ly = y - 44;
    item.lines.slice(0, 6).forEach(function(line) {
      chunks.push(pdfRect(52, ly + 4, 5, 5, [59, 130, 246]));
      chunks.push(pdfText(line, 66, ly, 10.5, [31, 41, 55]));
      ly -= 18;
    });
    y -= blockHeight + 16;
  });
  return chunks.join('\n');
}

function extractFlashcardRows(markdown) {
  const text = String(markdown || '');
  const section = text.match(/##\s*闪卡\s*\n([\s\S]*?)(?=\n##\s+|$)/);
  const target = section ? section[1] : text;
  const rows = [];
  const re = /-\s*Q\d+：(.+?)\n\s*A：(.+?)(?=\n-\s*Q\d+：|\n##\s+|$)/g;
  let match;
  while ((match = re.exec(target))) {
    rows.push({
      front: match[1].trim(),
      back: match[2].replace(/\n\s*/g, ' ').trim()
    });
  }
  return rows;
}

export function prepareAnkiExport(note) {
  const target = note || {};
  const title = target.title || '学习笔记';
  const markdown = sanitizeExportMarkdown(target.markdown || '');
  const rows = extractFlashcardRows(markdown);
  const fallback = rows.length ? rows : [
    { front: title, back: '请用自己的话复述这份学习笔记的核心内容。' }
  ];
  const tsv = fallback.map(function(row) {
    return [row.front, row.back].map(function(cell) {
      return String(cell || '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
    }).join('\t');
  }).join('\n');
  return {
    ok: true,
    filename: exporterSlug(title) + '-' + exporterDateStamp(target.createdAt) + '-anki.tsv',
    mimeType: 'text/tab-separated-values;charset=utf-8',
    tsv
  };
}

function markdownToSlideItems(markdown) {
  const text = String(markdown || '');
  const sections = [];
  const re = /^##\s+(.+)$/gm;
  let match;
  const matches = [];
  while ((match = re.exec(text))) {
    matches.push({ title: match[1].trim(), index: match.index, end: re.lastIndex });
  }
  matches.forEach(function(item, index) {
    const next = matches[index + 1];
    const body = text.slice(item.end, next ? next.index : text.length).trim();
    const bullets = body.split(/\r?\n/)
      .map(line => line.replace(/^[-*]\s+/, '').replace(/^>\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 5);
    if (bullets.length) sections.push({ title: item.title, bullets });
  });
  return sections.slice(0, 8);
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function crc32Bytes(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function utf8Bytes(text) {
  return Array.from(new TextEncoder().encode(String(text || '')));
}

function u16(value) {
  return [value & 255, (value >>> 8) & 255];
}

function u32(value) {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
}

function dosTimeDate(date) {
  const d = date || new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, day };
}

function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const stamp = dosTimeDate(new Date());
  files.forEach(function(file) {
    const nameBytes = utf8Bytes(file.name);
    const dataBytes = utf8Bytes(file.content);
    const crc = crc32Bytes(dataBytes);
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(stamp.time), ...u16(stamp.day),
      ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length), ...u16(nameBytes.length), ...u16(0),
      ...nameBytes, ...dataBytes
    ];
    chunks.push(local);
    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(stamp.time), ...u16(stamp.day),
      ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes
    ]);
    offset += local.length;
  });
  const centralStart = offset;
  central.forEach(function(item) {
    chunks.push(item);
    offset += item.length;
  });
  const centralSize = offset - centralStart;
  chunks.push([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(centralStart), ...u16(0)
  ]);
  const bytes = chunks.flat();
  let binary = '';
  const batch = 8192;
  for (let i = 0; i < bytes.length; i += batch) {
    binary += String.fromCharCode.apply(null, bytes.slice(i, i + batch));
  }
  return btoa(binary);
}

function slideXml(title, bullets, index, total) {
  const safeTitle = xmlEscape(title || '学习汇报');
  const accent = '3B82F6';
  const bulletXml = (bullets || []).slice(0, 5).map(function(item, i) {
    return [
      '<p:sp><p:nvSpPr><p:cNvPr id="' + (20 + i) + '" name="Point"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>',
      '<p:spPr><a:xfrm><a:off x="760000" y="' + (1780000 + i * 575000) + '"/><a:ext cx="7900000" cy="420000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="' + (i % 2 ? 'FFFFFF' : 'F8FAFC') + '"/></a:solidFill><a:ln w="7000"><a:solidFill><a:srgbClr val="DBEAFE"/></a:solidFill></a:ln></p:spPr>',
      '<p:txBody><a:bodyPr lIns="180000" tIns="65000" rIns="180000" bIns="65000"/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1750"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill></a:rPr><a:t>' + xmlEscape(item) + '</a:t></a:r></a:p></p:txBody></p:sp>'
    ].join('');
  }).join('');
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
    '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>',
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Brand"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="620000" y="340000"/><a:ext cx="3000000" cy="260000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1150" b="1"><a:solidFill><a:srgbClr val="1D4ED8"/></a:solidFill></a:rPr><a:t>智引 AI 导航导师</a:t></a:r></a:p></p:txBody></p:sp>',
    '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="620000" y="920000"/><a:ext cx="7900000" cy="620000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="3150" b="1"><a:solidFill><a:srgbClr val="1E40AF"/></a:solidFill></a:rPr><a:t>' + safeTitle + '</a:t></a:r></a:p></p:txBody></p:sp>',
    '<p:sp><p:nvSpPr><p:cNvPr id="4" name="Rule"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="620000" y="1580000"/><a:ext cx="7900000" cy="42000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="' + accent + '"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>',
    bulletXml,
    '<p:sp><p:nvSpPr><p:cNvPr id="6" name="FooterRule"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="620000" y="4700000"/><a:ext cx="7900000" cy="12000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="DBEAFE"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>',
    '<p:sp><p:nvSpPr><p:cNvPr id="7" name="Footer"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="620000" y="4800000"/><a:ext cx="8000000" cy="300000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1050"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill></a:rPr><a:t>学习成果汇报 · ' + index + ' / ' + total + '</a:t></a:r></a:p></p:txBody></p:sp>',
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  ].join('');
}

function pptxFiles(title, slides) {
  const slideCount = slides.length;
  const slideIds = slides.map((_, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>').join('');
  const rels = '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
    slides.map((_, i) => '<Relationship Id="rId' + (i + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + (i + 1) + '.xml"/>').join('');
  const overrides = slides.map((_, i) => '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>').join('');
  const files = [
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' + overrides + '</Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
    { name: 'docProps/core.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xmlEscape(title) + '</dc:title><dc:creator>智引 AI 导航导师</dc:creator></cp:coreProperties>' },
    { name: 'docProps/app.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>智引 AI 导航导师</Application><Slides>' + slideCount + '</Slides></Properties>' },
    { name: 'ppt/presentation.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + slideIds + '</p:sldIdLst><p:sldSz cx="9144000" cy="5143500" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="zh-CN"/></a:defPPr></p:defaultTextStyle></p:presentation>' },
    { name: 'ppt/_rels/presentation.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>' },
    { name: 'ppt/slideMasters/slideMaster1.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>' },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>' },
    { name: 'ppt/slideLayouts/slideLayout1.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>' },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>' },
    { name: 'ppt/theme/theme1.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Zhiyin"><a:themeElements><a:clrScheme name="Zhiyin"><a:dk1><a:srgbClr val="10223F"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="243852"/></a:dk2><a:lt2><a:srgbClr val="F7FAFF"/></a:lt2><a:accent1><a:srgbClr val="2F80ED"/></a:accent1><a:accent2><a:srgbClr val="10B981"/></a:accent2><a:accent3><a:srgbClr val="F59E0B"/></a:accent3><a:accent4><a:srgbClr val="8B5CF6"/></a:accent4><a:accent5><a:srgbClr val="EF4444"/></a:accent5><a:accent6><a:srgbClr val="64748B"/></a:accent6><a:hlink><a:srgbClr val="1769E0"/></a:hlink><a:folHlink><a:srgbClr val="6B7280"/></a:folHlink></a:clrScheme><a:fontScheme name="Zhiyin"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="微软雅黑"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="微软雅黑"/></a:minorFont></a:fontScheme><a:fmtScheme name="Zhiyin"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>' }
  ];
  slides.forEach(function(slide, i) {
    files.push({ name: 'ppt/slides/slide' + (i + 1) + '.xml', content: slideXml(slide.title, slide.bullets, i + 1, slideCount) });
    files.push({ name: 'ppt/slides/_rels/slide' + (i + 1) + '.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>' });
  });
  return files;
}

function buildSlidesHtml(note) {
  const target = note || {};
  const title = cleanDisplayTitle(target.title || '学习汇报');
  const markdown = sanitizeExportMarkdown(target.markdown || '');
  const slides = markdownToSlideItems(markdown);
  const slideBlocks = [
    '<section class="slide cover"><div><p>智引 AI 导航导师</p><h1>' + exporterEscapeHtml(title) + '</h1><span>自动编排学习汇报</span></div></section>'
  ].concat(slides.map(function(slide) {
    return '<section class="slide"><h2>' + exporterEscapeHtml(slide.title) + '</h2><ul>' +
      slide.bullets.map(item => '<li>' + exporterEscapeHtml(item).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</li>').join('') +
      '</ul></section>';
  }));
  return [
    '<!doctype html>',
    '<html lang="zh-CN"><head><meta charset="utf-8">',
    '<title>' + exporterEscapeHtml(title) + '</title>',
    '<style>',
    'body{margin:0;background:#f8fafc;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;}',
    '.deck{display:flex;flex-direction:column;gap:24px;padding:28px;}',
    '.slide{width:1280px;height:720px;background:#fff;border:1px solid #dbeafe;box-sizing:border-box;padding:72px 86px;page-break-after:always;}',
    '.cover{display:flex;align-items:center;justify-content:center;text-align:center;}',
    '.cover p{color:#1d4ed8;font-weight:700;font-size:24px;margin:0 0 18px;}',
    '.cover h1{font-size:54px;line-height:1.18;margin:0 0 22px;color:#1e40af;}',
    '.cover span{font-size:22px;color:#64748b;}',
    'h2{font-size:42px;line-height:1.2;margin:0 0 12px;color:#1e40af;}',
    'h2:after{content:"";display:block;width:170px;height:5px;background:#3b82f6;margin-top:18px;margin-bottom:28px;}',
    'ul{margin:0;padding-left:32px;}',
    'li{font-size:27px;line-height:1.5;margin:14px 0;color:#1f2937;}',
    '@media print{body{background:#fff}.deck{padding:0;gap:0}.slide{box-shadow:none;border-radius:0;width:100vw;height:100vh}}',
    '</style></head><body><main class="deck">',
    slideBlocks.join('\n'),
    '</main></body></html>'
  ].join('\n');
}

export function preparePptxExport(note) {
  const target = note || {};
  const title = cleanDisplayTitle(target.title || '学习汇报');
  const markdown = sanitizeExportMarkdown(target.markdown || '');
  const sectionSlides = markdownToSlideItems(markdown);
  const slides = [{ title, bullets: ['由智引 AI 导航导师自动整理', '可在 WPS 演示中继续编辑', '包含学习目标、核心要点、学习路径和复习材料'] }].concat(sectionSlides);
  const base64 = zipStore(pptxFiles(title, slides.slice(0, 10)));
  return {
    ok: true,
    filename: exporterSlug(title) + '-' + exporterDateStamp(target.createdAt) + '.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    base64,
    html: buildSlidesHtml(target),
    instruction: '已生成可在 WPS 演示中继续编辑的 PPTX。'
  };
}
