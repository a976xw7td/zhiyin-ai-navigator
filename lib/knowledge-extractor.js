/**
 * Knowledge Extractor — 页面采集结果标准化
 */

const PAGE_TEXT_LIMIT = 8000;

function extractorTrim(value, maxLength) {
  const text = String(value || '').replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n...（内容过长已截断）';
}

function extractorHost(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return '';
  }
}

export function normalizePageSource(tab, pageText, siteProfile) {
  const payload = pageText || {};
  const url = tab?.url || payload.url || '';
  const title = extractorTrim(payload.title || tab?.title || '未命名页面', 160);
  const description = extractorTrim(payload.description || '', 500);
  const text = extractorTrim(payload.text || '', PAGE_TEXT_LIMIT);
  return {
    id: 'src_' + Date.now(),
    type: 'page',
    title,
    url,
    host: extractorHost(url),
    description,
    text,
    siteProfile: siteProfile ? {
      id: siteProfile.id,
      name: siteProfile.name,
      category: siteProfile.category
    } : null,
    excerpt: extractorTrim(text, 360),
    collectedAt: new Date().toISOString()
  };
}

export function buildSourceSummary(source) {
  const parts = [
    source?.title ? '标题：' + source.title : '',
    source?.description ? '描述：' + source.description : '',
    source?.excerpt ? '摘录：' + source.excerpt : ''
  ].filter(Boolean);
  return parts.join('\n');
}
