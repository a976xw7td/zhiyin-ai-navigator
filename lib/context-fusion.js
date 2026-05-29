/**
 * Context Fusion — 多源页面感知融合
 */

const CONTEXT_TEXT_LIMIT = 4000;

function contextTrim(value, maxLength) {
  const text = String(value || '').replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n...（内容过长已截断）';
}

function contextHost(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return '';
  }
}

function compactSiteProfile(siteProfile) {
  return siteProfile ? {
    id: siteProfile.id,
    name: siteProfile.name,
    category: siteProfile.category,
    guidance: siteProfile.guidance
  } : null;
}

export function normalizeSelectionSource(tab, selectionContext, siteProfile) {
  const payload = selectionContext || {};
  const selectedText = contextTrim(payload.selectedText || '', CONTEXT_TEXT_LIMIT);
  const url = tab?.url || payload.url || '';
  const title = contextTrim(payload.title || tab?.title || '选中文本', 160);
  return {
    id: 'src_' + Date.now(),
    type: 'selection',
    title: '选区：' + title,
    url,
    host: contextHost(url),
    selectedText,
    text: selectedText,
    contextBefore: contextTrim(payload.contextBefore || '', 600),
    contextAfter: contextTrim(payload.contextAfter || '', 600),
    surroundingText: contextTrim(payload.surroundingText || selectedText, 1500),
    selectionRect: payload.selectionRect || null,
    siteProfile: compactSiteProfile(siteProfile),
    excerpt: contextTrim(selectedText || payload.surroundingText || '', 360),
    collectedAt: new Date().toISOString()
  };
}

export function normalizeViewportSource(tab, viewportContext, siteProfile) {
  const payload = viewportContext || {};
  const url = tab?.url || payload.url || '';
  const title = contextTrim(payload.title || tab?.title || '当前视口', 160);
  const visibleText = contextTrim(payload.visibleText || '', CONTEXT_TEXT_LIMIT);
  return {
    id: 'src_' + Date.now(),
    type: 'viewport',
    title: '视口：' + title,
    url,
    host: contextHost(url),
    text: visibleText,
    visibleText,
    visibleHeadings: Array.isArray(payload.visibleHeadings) ? payload.visibleHeadings.slice(0, 12) : [],
    viewport: payload.viewport || null,
    scroll: payload.scroll || null,
    centerElement: payload.centerElement || null,
    siteProfile: compactSiteProfile(siteProfile),
    excerpt: contextTrim(visibleText, 360),
    collectedAt: new Date().toISOString()
  };
}

export function normalizeFusedPageSource(tab, pageSource, viewportContext, siteProfile) {
  const page = pageSource || {};
  const viewport = viewportContext || {};
  const pageText = contextTrim(page.text || '', 6000);
  const visibleText = contextTrim(viewport.visibleText || '', 2200);
  const mergedText = contextTrim([
    pageText,
    visibleText ? '\n\n【当前视口兜底】\n' + visibleText : ''
  ].filter(Boolean).join('\n'), 8000);
  return Object.assign({}, page, {
    type: 'page',
    text: mergedText,
    viewportFallback: viewport && !viewport.error ? {
      visibleText,
      visibleHeadings: Array.isArray(viewport.visibleHeadings) ? viewport.visibleHeadings.slice(0, 12) : [],
      viewport: viewport.viewport || null,
      scroll: viewport.scroll || null,
      centerElement: viewport.centerElement || null
    } : null,
    siteProfile: compactSiteProfile(siteProfile),
    excerpt: contextTrim(page.excerpt || mergedText, 420),
    collectedAt: new Date().toISOString()
  });
}

export function fuseMultiSourceContext(input) {
  const data = input || {};
  const domSource = data.domSource || null;
  const selection = data.selection || null;
  const viewport = data.viewport || null;
  const siteProfile = compactSiteProfile(data.siteProfile);
  const signals = [];

  if (selection?.selectedText) {
    signals.push('选中文本：' + contextTrim(selection.selectedText, 700));
  }
  if (viewport?.visibleText) {
    signals.push('当前视口：' + contextTrim(viewport.visibleText, 900));
  }
  if (domSource?.excerpt || domSource?.description) {
    signals.push('页面摘要：' + contextTrim(domSource.excerpt || domSource.description, 700));
  }
  if (siteProfile) {
    signals.push('站点画像：' + siteProfile.name + ' / ' + siteProfile.category);
  }

  return {
    ok: true,
    title: domSource?.title || selection?.title || viewport?.title || '',
    url: domSource?.url || selection?.url || viewport?.url || '',
    host: domSource?.host || contextHost(selection?.url || viewport?.url || ''),
    domSource,
    selection,
    viewport,
    siteProfile,
    summary: contextTrim(signals.join('\n\n'), 2400),
    collectedAt: new Date().toISOString()
  };
}
