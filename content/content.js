/**
 * Content Script — 主编排器
 *
 * 消息路由、语音气泡、SPA 路由检测、初始化。
 * DOM 操作逻辑在: highlight.js, widget-ui.js, recording.js
 * 共享状态在: shared.js
 * Widget 内容在: widget-content.js
 */

// ── 消息路由 ──

function clampText(value, maxLength) {
  var text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function getSelectionTextContext() {
  var selection = window.getSelection ? window.getSelection() : null;
  var text = selection ? clampText(selection.toString(), 4000) : '';
  var bodyText = document.body ? (document.body.innerText || '') : '';
  var cleanBody = bodyText.replace(/\s+/g, ' ').trim();
  var before = '';
  var after = '';
  var rect = null;

  if (selection && selection.rangeCount > 0) {
    try {
      var range = selection.getRangeAt(0);
      var rangeRect = range.getBoundingClientRect();
      rect = {
        x: Math.round(rangeRect.x),
        y: Math.round(rangeRect.y),
        width: Math.round(rangeRect.width),
        height: Math.round(rangeRect.height),
        top: Math.round(rangeRect.top),
        left: Math.round(rangeRect.left)
      };
    } catch (_) {}
  }

  if (text && cleanBody) {
    var idx = cleanBody.indexOf(text.replace(/\s+/g, ' ').trim());
    if (idx >= 0) {
      before = cleanBody.slice(Math.max(0, idx - 500), idx);
      after = cleanBody.slice(idx + text.length, idx + text.length + 500);
    }
  }

  return {
    ok: true,
    selectedText: text,
    hasSelection: !!text,
    title: document.title || '',
    url: location.href,
    contextBefore: clampText(before, 500),
    contextAfter: clampText(after, 500),
    surroundingText: clampText([before, text, after].filter(Boolean).join(' '), 1200),
    selectionRect: rect,
    collectedAt: new Date().toISOString()
  };
}

function getVisibleTextSummary() {
  var parts = [];
  var seen = new Set();
  var selectors = 'h1,h2,h3,p,li,td,th,summary,button,a,[role="heading"]';
  var nodes = Array.prototype.slice.call(document.querySelectorAll(selectors), 0, 160);
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;
    var text = clampText(el.innerText || el.textContent || '', 180);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
    if (parts.join(' ').length > 2000) break;
  }
  if (!parts.length && document.body) parts.push(clampText(document.body.innerText || '', 2000));
  return clampText(parts.join('\n'), 2000);
}

function getViewportContext() {
  var centerEl = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
  var headings = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,[role="heading"]'), 0, 20)
    .map(function(el) { return clampText(el.innerText || el.textContent || '', 120); })
    .filter(Boolean);
  return {
    ok: true,
    title: document.title || '',
    url: location.href,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    },
    scroll: {
      x: Math.round(window.scrollX || 0),
      y: Math.round(window.scrollY || 0),
      maxX: Math.max(0, Math.round(document.documentElement.scrollWidth - window.innerWidth)),
      maxY: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight))
    },
    visibleHeadings: headings.slice(0, 8),
    visibleText: getVisibleTextSummary(),
    centerElement: centerEl ? {
      tag: centerEl.tagName ? centerEl.tagName.toLowerCase() : '',
      text: clampText(centerEl.innerText || centerEl.textContent || centerEl.getAttribute('aria-label') || '', 160)
    } : null,
    collectedAt: new Date().toISOString()
  };
}

function handleMessage(msg, _sender, sendResponse) {
  var type = msg.type;
  var payload = msg.payload;

  switch (type) {

    case 'PING':
      sendResponse({ pong: true });
      break;

    case 'ANIM_SET_STATE':
      setWidgetState(payload.state);
      sendResponse({ ok: true });
      break;

    case 'STATUS_TEXT':
      setWidgetState(payload.state || 'idle');
      // 非 idle 状态（thinking/listening/speaking）或错误消息 → 始终显示气泡
      if (payload.text && (payload.state !== 'idle' || payload.text.includes('⚠️'))) {
        showSpeechBubble(payload.text, null);
      }
      sendResponse({ ok: true });
      break;

    case 'START_REC':
      __ZY__.pendingStop = false;
      // 默认走完整录音 + ASR。Web Speech API 在长句上容易提前返回半句 final。
      startContentRecording()
        .then(function() { sendResponse({ ok: true, method: 'recording' }); })
        .catch(function(e2) {
          __ZY__.pendingStop = false;
          console.error('[Content] getUserMedia error:', e2.name, e2.message);
          chrome.runtime.sendMessage({
            type: 'RECORDING_ERROR',
            payload: { error: e2.name, message: e2.message }
          }).catch(function() {});
          sendResponse({ ok: false, error: e2.name });
        });
      return true;

    case 'STOP_REC':
      stopContentRecording();
      sendResponse({ ok: true });
      break;

    case 'DOM_PRECOLLECT':
      try { DomDistiller.precollect(document); } catch (e) {
        console.warn('[Content] DOM precollect failed:', e.message);
      }
      sendResponse({ ok: true });
      break;

    case 'DOM_DISTILL':
      try {
        sendResponse(DomDistiller.distill(document, (payload && payload.intent) || ''));
      } catch (e) {
        sendResponse({ error: e.message });
      }
      break;

    case 'GET_PAGE_TEXT':
      // 获取页面可见文本，用于内容理解
      try {
        var text = document.body.innerText || '';
        // 限制长度
        if (text.length > 8000) text = text.slice(0, 8000) + '\n...（内容过长已截断）';
        // 也获取页面标题和 meta 描述
        var metaDesc = document.querySelector('meta[name="description"]')?.content || '';
        var title = document.title || '';
        sendResponse({ title: title, description: metaDesc, text: text });
      } catch (e) {
        sendResponse({ error: e.message });
      }
      break;

    case 'GET_SELECTION_CONTEXT':
      try {
        sendResponse(getSelectionTextContext());
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      break;

    case 'CAPTURE_VIEWPORT_CONTEXT':
      try {
        sendResponse(getViewportContext());
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      break;

    case 'EXEC_HIGHLIGHT':
      sendResponse(execHighlight(payload.selector, payload.fallbackText));
      break;

    case 'EXEC_CLICK':
      sendResponse(execAction(payload.selector, payload.fallbackText));
      break;

    case 'EXEC_INPUT':
      sendResponse(execInput(payload.selector, payload.fallbackText, payload.value));
      break;

    case 'EXEC_SCROLL':
      sendResponse(execScroll(payload.selector, payload.fallbackText));
      break;

    case 'EXEC_TASK_QUEUE':
      TaskQueue.run(payload.tasks).then(function(res) { sendResponse(res); });
      return true;

    case 'EXEC_VERIFY_HIGHLIGHT':
      sendResponse(verifyAndReHighlight(payload.verifyText));
      break;

    case 'FOCUS_WIDGET_INPUT':
      showWidgetFromSidePanel();
      if (__ZY__.textWrap) {
        __ZY__.textWrap.classList.add('visible');
        __ZY__.textInput.focus();
      }
      sendResponse({ ok: true });
      break;

    case 'SHOW_WIDGET':
      showWidgetFromSidePanel();
      sendResponse({ ok: true });
      break;

    case 'CLEAR_HIGHLIGHT':
      clearAll();
      sendResponse({ success: true });
      break;

    case 'SPEECH_STREAM':
      // 实时流式文本推送到 widget 气泡
      if (__ZY__.speechBubble && __ZY__.speechBubble.textContent !== payload.text) {
        __ZY__.speechBubble.textContent = payload.text;
      } else if (!__ZY__.speechBubble) {
        showSpeechBubble(payload.text, 'progress');
      }
      sendResponse({ ok: true });
      break;

    case 'SHOW_SPEECH':
      showSpeechBubble(payload.text, payload.mode || null);
      sendResponse({ success: true });
      break;

    case 'TTS_TEXT': {
      var speak = function() {
        var utterance = new SpeechSynthesisUtterance(payload.text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        var voices = speechSynthesis.getVoices();
        var preferred = voices.find(function(v) {
          return /Samantha|Karen|Alex|Daniel|Moira|Tessa/i.test(v.name) && v.lang.startsWith('en');
        }) || voices.find(function(v) { return v.lang.startsWith('en'); })
           || voices.find(function(v) { return v.lang.startsWith('en-US'); });
        if (preferred) utterance.voice = preferred;
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
      };
      if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.onvoiceschanged = function() { speechSynthesis.onvoiceschanged = null; speak(); };
      } else {
        speak();
      }
      sendResponse({ ok: true });
      break;
    }

    case 'TTS_STOP':
      if (__ZY__.currentTtsAudio) {
        try { __ZY__.currentTtsAudio.pause(); } catch (_) {}
        try { __ZY__.currentTtsAudio.remove(); } catch (_) {}
        __ZY__.currentTtsAudio = null;
      }
      try { speechSynthesis.cancel(); } catch (_) {}
      setWidgetState('idle');
      sendResponse({ ok: true });
      break;

    case 'TTS_PLAY': {
      // 取消上一个 TTS 音频，防止重叠播放
      if (__ZY__.currentTtsAudio) {
        __ZY__.currentTtsAudio.pause();
        __ZY__.currentTtsAudio.remove();
        __ZY__.currentTtsAudio = null;
      }
      var audio = new Audio('data:' + (payload.mimeType || 'audio/mp3') + ';base64,' + payload.audioBase64);
      __ZY__.currentTtsAudio = audio;
      audio.volume = 0.9;
      audio.play().then(function() {
        audio.onended = function() {
          audio.remove();
          if (__ZY__.currentTtsAudio === audio) __ZY__.currentTtsAudio = null;
          sendResponse({ ok: true });
        };
        audio.onerror = function() {
          audio.remove();
          if (__ZY__.currentTtsAudio === audio) __ZY__.currentTtsAudio = null;
          sendResponse({ ok: false, error: 'audio_play_error' });
        };
      }).catch(function(e) {
        audio.remove();
        if (__ZY__.currentTtsAudio === audio) __ZY__.currentTtsAudio = null;
        sendResponse({ ok: false, error: e.message });
      });
      return true;
    }

    case 'TASK_PROGRESS':
      if (payload.finished) {
        showSpeechBubble(payload.text, null);
        hideStepBadge(!payload.failed);
        setWidgetState(payload.failed ? 'error' : 'idle');
      } else {
        showSpeechBubble(payload.text, 'progress');
        setStepBadge(payload.step, payload.total);
        setWidgetState('thinking');
      }
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ error: 'UNKNOWN_MESSAGE_TYPE' });
  }
}

// ── 语音气泡 — 从皮卡丘右侧弹出 ──

var _speechBubbleTimer = null;

function showSpeechBubble(text, mode) {
  if (!text || !__ZY__.widgetHost) return;
  // 进度模式或同一气泡中：只更新文本，不重建 DOM
  if (__ZY__.speechBubble) {
    if (mode === 'progress') {
      __ZY__.speechBubble.textContent = text;
      return;
    }
    // 非进度模式但文本相同 → 跳过
    if (__ZY__.speechBubble.textContent === text) return;
  }
  // 非进度气泡 → 清除步骤徽标（新操作的开始）
  if (mode !== 'progress') hideStepBadge(false);
  if (__ZY__.speechBubble) { __ZY__.speechBubble.remove(); __ZY__.speechBubble = null; }
  if (_speechBubbleTimer) { clearTimeout(_speechBubbleTimer); _speechBubbleTimer = null; }

  var hostRect = __ZY__.widgetHost.getBoundingClientRect();
  var isWidgetOnRight = (hostRect.left + hostRect.width / 2) > window.innerWidth / 2;
  var bubble = document.createElement('div');
  bubble.className = 'dhn-widget-bubble';

  // 短文本（< 12 个字符 → 垂直显示，适合中文状态标签）
  // 长文本 → 水平显示，可读性好
  // 以 ✅/⚠️/⏹️ 开头的操作结果即使较短也用水平模式，确保可读性
  var isResultMsg = /^[✅⚠️⏹️]/.test(text);
  var isShort = text.length < 12 && !isResultMsg;
  if (!isShort) bubble.classList.add('horizontal');
  if (mode === 'progress') bubble.classList.add('progress');

  bubble.textContent = text;
  __ZY__.speechBubble = bubble;

  // 计算最佳位置：widget 在右侧时气泡在左，否则在右
  var bubbleW = isShort ? 50 : Math.min(text.length * 8 + 40, 270);
  var left, top;

  if (isWidgetOnRight) {
    // 气泡在 widget 左侧
    bubble.classList.add('tail-right');
    left = hostRect.left - bubbleW - 14;
  } else {
    // 气泡在 widget 右侧
    left = hostRect.right + 14;
  }
  top = hostRect.top + hostRect.height * 0.35;

  // 确保不超出左右边界
  left = Math.max(8, Math.min(left, window.innerWidth - bubbleW - 8));
  // 确保不超出上下边界
  top = Math.max(80, Math.min(top, window.innerHeight - 80));

  bubble.style.left = left + 'px';
  bubble.style.top  = top + 'px';
  document.body.appendChild(bubble);

  requestAnimationFrame(function() {
    bubble.classList.add('visible');
  });

  // 进度气泡不会自动消失（由调用方控制）
  if (mode === 'progress') return;

  // 根据文本长度决定显示时间
  var displayMs = isShort ? 4000 : Math.min(6000 + text.length * 40, 12000);
  _speechBubbleTimer = setTimeout(function() {
    _speechBubbleTimer = null;
    bubble.classList.remove('visible');
    bubble.addEventListener('transitionend', function() {
      bubble.remove();
      if (__ZY__.speechBubble === bubble) __ZY__.speechBubble = null;
    });
  }, displayMs);
}

function clearAll() {
  clearHighlight();
  hideStepBadge(false);
  if (__ZY__.speechBubble) { __ZY__.speechBubble.remove(); __ZY__.speechBubble = null; }
}

// ── SPA 路由变化检测 ──
// MutationObserver 捕获 DOM 驱动的 URL 变更（React/Vue/Angular）
// popstate 事件捕获浏览器前进/后退

var _lastUrl = location.href;
new MutationObserver(function() {
  if (location.href !== _lastUrl) {
    _lastUrl = location.href;
    chrome.runtime.sendMessage({ type: 'PAGE_CHANGED', payload: { url: _lastUrl } });
  }
}).observe(document, { subtree: true, childList: true });

window.addEventListener('popstate', function() {
  if (location.href !== _lastUrl) {
    _lastUrl = location.href;
    chrome.runtime.sendMessage({ type: 'PAGE_CHANGED', payload: { url: _lastUrl } });
  }
});

// ── 测试桥接（主世界 → 隔离世界 CustomEvent 通道，仅在 playground 测试中使用）──
document.addEventListener('__zy_ping', function() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, function(r) {
    document.dispatchEvent(new CustomEvent('__zy_pong', { detail: r || {} }));
  });
});

// ── 初始化 ──

injectPikachuWidget();
chrome.runtime.onMessage.addListener(handleMessage);
