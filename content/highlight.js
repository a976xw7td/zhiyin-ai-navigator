/**
 * Content Script — 高亮动画与元素操作
 *
 * 依赖: SelectorEngine (lib/selector-engine.js), __ZY__ (shared.js)
 */

// ── 高亮 ──

function execHighlight(selector, fallbackText) {
  var resolved = SelectorEngine.resolve(selector, fallbackText, 'highlight');
  if (!resolved.element) return { success: false, level: resolved.level, guidance: resolved.guidance };

  clearHighlight();
  var el = resolved.element;
  ensureElementInView(el);
  placeHighlightOverlay(el);
  return { success: true, level: resolved.level, text: elementComparableText(el).slice(0, 80) };
}

function placeHighlightOverlay(el) {
  clearHighlight();
  __ZY__.highlightTargetEl = el;
  var rect = el.getBoundingClientRect();
  __ZY__.highlightEl = document.createElement('div');
  __ZY__.highlightEl.className = 'dhn-highlight-overlay';
  __ZY__.highlightEl.style.left   = (rect.left - 4) + 'px';
  __ZY__.highlightEl.style.top    = (rect.top  - 4) + 'px';
  __ZY__.highlightEl.style.width  = (rect.width  + 8) + 'px';
  __ZY__.highlightEl.style.height = (rect.height + 8) + 'px';
  document.body.appendChild(__ZY__.highlightEl);
  spawnRipple(rect);
  setTimeout(function() { spawnRipple(rect); }, 300);

  __ZY__.highlightClickDismiss = function() { clearHighlight(); };
  document.addEventListener('click', __ZY__.highlightClickDismiss, { once: true, capture: true });

  // 滚动/缩放时跟踪位置
  if (__ZY__.highlightTrackRaf) cancelAnimationFrame(__ZY__.highlightTrackRaf);
  (function track() {
    if (!__ZY__.highlightEl || !__ZY__.highlightTargetEl) {
      __ZY__.highlightTrackRaf = null;
      return;
    }
    if (!document.contains(__ZY__.highlightTargetEl)) { clearHighlight(); return; }
    var r = __ZY__.highlightTargetEl.getBoundingClientRect();
    __ZY__.highlightEl.style.left   = (r.left - 4) + 'px';
    __ZY__.highlightEl.style.top    = (r.top  - 4) + 'px';
    __ZY__.highlightEl.style.width  = (r.width  + 8) + 'px';
    __ZY__.highlightEl.style.height = (r.height + 8) + 'px';
    __ZY__.highlightTrackRaf = requestAnimationFrame(track);
  })();
}

function ensureElementInView(el) {
  if (!el || !el.getBoundingClientRect) return;
  var rect = el.getBoundingClientRect();
  var inViewport = rect.top >= 8 && rect.bottom <= window.innerHeight - 8
                && rect.left >= 8 && rect.right <= window.innerWidth - 8;
  if (!inViewport) {
    try { el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }); }
    catch (_) { el.scrollIntoView({ block: 'center', inline: 'center' }); }
  }
}

function spawnRipple(rect) {
  var ripple = document.createElement('div');
  ripple.className = 'dhn-ripple-ring';
  var cx = rect.left + rect.width  / 2;
  var cy = rect.top  + rect.height / 2;
  var size = Math.max(rect.width, rect.height) * 1.5;
  ripple.style.left   = (cx - size / 2) + 'px';
  ripple.style.top    = (cy - size / 2) + 'px';
  ripple.style.width  = size + 'px';
  ripple.style.height = size + 'px';
  document.body.appendChild(ripple);
  ripple.addEventListener('animationend', function() { ripple.remove(); });
}

function clearHighlight() {
  if (__ZY__.highlightTrackRaf) {
    cancelAnimationFrame(__ZY__.highlightTrackRaf);
    __ZY__.highlightTrackRaf = null;
  }
  if (__ZY__.highlightEl) { __ZY__.highlightEl.remove(); __ZY__.highlightEl = null; }
  __ZY__.highlightTargetEl = null;
  if (__ZY__.highlightClickDismiss) {
    document.removeEventListener('click', __ZY__.highlightClickDismiss, { capture: true });
    __ZY__.highlightClickDismiss = null;
  }
  document.querySelectorAll('.dhn-ripple-ring').forEach(function(r) { r.remove(); });
}

// ── 高亮验证 ──

function verifyAndReHighlight(verifyText) {
  if (!verifyText) return { success: true, verified: true };

  var vt = normalizeComparableText(verifyText);

  // 1. 检查当前高亮元素
  if (__ZY__.highlightTargetEl) {
    var elText = elementComparableText(__ZY__.highlightTargetEl);
    if (isGoodTextMatch(elText, vt)) {
      return { success: true, verified: true };
    }
  }

  // 2. 全页搜索更正确元素
  var candidates = document.querySelectorAll(
    'a, button, input, textarea, select, [role="button"], [role="menuitem"], [role="tab"], [role="link"], [onclick], [tabindex], summary, li, td, th, span'
  );
  var best = findBestVerifyCandidate(candidates, vt);
  if (best) {
    ensureElementInView(best);
    placeHighlightOverlay(best);
    return { success: true, verified: false, reHighlighted: true, text: elementComparableText(best).slice(0, 80) };
  }

  return { success: true, verified: false };
}

function normalizeComparableText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
}

function elementComparableText(el) {
  if (!el) return '';
  return normalizeComparableText(
    el.innerText ||
    el.textContent ||
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.getAttribute('placeholder') ||
    el.value || ''
  );
}

function isVisibleCandidate(el) {
  if (!el || !el.getBoundingClientRect) return false;
  var rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return false;
  return true;
}

function isGoodTextMatch(text, vt) {
  if (!text || !vt) return false;
  if (text === vt) return true;
  if (text.includes(vt)) return true;
  if (vt.includes(text) && text.length >= Math.min(6, vt.length)) return true;
  return false;
}

function findBestVerifyCandidate(candidates, vt) {
  var best = null;
  var bestScore = 0;
  for (var i = 0; i < candidates.length; i++) {
    var el = candidates[i];
    if (!isVisibleCandidate(el)) continue;
    var text = elementComparableText(el);
    if (!text || text.length > 120) continue;
    var score = 0;
    if (text === vt) score = 120;
    else if (text.includes(vt)) score = 90 - Math.min(30, text.length / 4);
    else if (vt.includes(text) && text.length >= 2) score = 60 - Math.min(20, vt.length / 8);
    if (!score) continue;
    if (el.matches && el.matches('button,a,input,textarea,select,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[onclick],[tabindex]')) score += 25;
    var rect = el.getBoundingClientRect();
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) score += 10;
    if (rect.width > window.innerWidth * 0.9 && rect.height > window.innerHeight * 0.4) score -= 35;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

// ── 元素操作 ──

function execAction(selector, fallbackText) {
  var resolved = SelectorEngine.resolve(selector, fallbackText, 'click');
  if (!resolved.element) return { success: false, level: resolved.level, guidance: resolved.guidance };
  highlightAndClick(resolved.element);
  return { success: true, level: resolved.level };
}

function highlightAndClick(el) {
  ensureElementInView(el);
  var rect = el.getBoundingClientRect();
  var flash = document.createElement('div');
  flash.className = 'dhn-highlight-overlay';
  flash.style.left   = (rect.left - 2) + 'px';
  flash.style.top    = (rect.top  - 2) + 'px';
  flash.style.width  = (rect.width  + 4) + 'px';
  flash.style.height = (rect.height + 4) + 'px';
  flash.style.borderColor = '#10b981';
  flash.style.background  = 'rgba(16,185,129,0.15)';
  document.body.appendChild(flash);
  setTimeout(function() { flash.remove(); el.click(); }, 400);
}

function execInput(selector, fallbackText, value) {
  var resolved = SelectorEngine.resolve(selector, fallbackText, 'input');
  if (!resolved.element) return { success: false, level: resolved.level, guidance: resolved.guidance };

  var el = resolved.element;
  ensureElementInView(el);
  el.focus();

  if (value !== undefined && value !== null) {
    var proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    el.select();
  }
  return { success: true, level: resolved.level };
}

function execScroll(selector, fallbackText) {
  var resolved = SelectorEngine.resolve(selector, fallbackText, 'scroll');
  if (!resolved.element) return { success: false, level: resolved.level, guidance: resolved.guidance };
  ensureElementInView(resolved.element);
  return { success: true, level: resolved.level };
}
