/**
 * Content Script — 皮卡丘 Widget UI
 *
 * Shadow DOM 完全隔离的浮动助手角色。
 * 依赖: __ZY__ (shared.js), __ZY_WIDGET_CSS__, __ZY_WIDGET_HTML__ (widget-content.js)
 */

function injectPikachuWidget() {
  __ZY__.widgetHost = document.createElement('div');
  __ZY__.widgetHost.id = 'dhn-widget-host';
  document.body.appendChild(__ZY__.widgetHost);

  var shadow = __ZY__.widgetHost.attachShadow({ mode: 'closed' });
  shadow.innerHTML = '<style>' + __ZY_WIDGET_CSS__ + '</style>' + __ZY_WIDGET_HTML__;

  __ZY__.pikaBall  = shadow.getElementById('pika');
  __ZY__.fanLayer  = shadow.getElementById('fan-layer');
  __ZY__.micFanBtn = shadow.getElementById('fbtn-mic');
  __ZY__.textWrap  = shadow.getElementById('tinput-wrap');
  __ZY__.textInput = shadow.getElementById('tinput');
  __ZY__.stepBadge = shadow.getElementById('step-badge');
  var hideBtn = shadow.getElementById('fbtn-hide');

  // ── 拖拽 ──
  var _ptrDownX = 0, _ptrDownY = 0;
  var _dragging = false, _moved = false;
  var _hostStartL = 0, _hostStartT = 0;

  __ZY__.pikaBall.addEventListener('pointerdown', function(e) {
    if (e.target.closest('.fbtn')) return;
    _ptrDownX = e.clientX; _ptrDownY = e.clientY;
    _dragging = false; _moved = false;
    var r = __ZY__.widgetHost.getBoundingClientRect();
    _hostStartL = r.left;
    _hostStartT = r.top;
    __ZY__.pikaBall.setPointerCapture(e.pointerId);
  });

  __ZY__.pikaBall.addEventListener('pointermove', function(e) {
    if (!(e.buttons & 1)) return;
    var dx = e.clientX - _ptrDownX;
    var dy = e.clientY - _ptrDownY;
    if (!_moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      _moved = true; _dragging = true;
      var cls = __ZY__.pikaBall.getAttribute('class');
      __ZY__.pikaBall.setAttribute('class', cls + ' dragging');
      closeFan();
    }
    if (_dragging) {
      var vw = window.innerWidth, vh = window.innerHeight;
      var nl = Math.max(0, Math.min(_hostStartL + dx, vw - 88));
      var nt = Math.max(0, Math.min(_hostStartT + dy, vh - 88));
      __ZY__.widgetHost.style.left  = nl + 'px';
      __ZY__.widgetHost.style.top   = nt + 'px';
      __ZY__.widgetHost.style.right = 'auto';
      __ZY__.widgetHost.style.bottom = 'auto';
    }
  });

  __ZY__.pikaBall.addEventListener('pointerup', function() {
    if (_dragging) {
      _dragging = false;
      var base = __ZY__.pikaBall.getAttribute('class').replace(' dragging', '');
      __ZY__.pikaBall.setAttribute('class', base);
      // 吸附到右侧边缘（距右边界 40px 内自动贴边）
      var vw = window.innerWidth;
      var curLeft = parseFloat(__ZY__.widgetHost.style.left) || 0;
      var snapThreshold = 40;
      if (curLeft > vw - 88 - snapThreshold) {
        __ZY__.widgetHost.style.left = (vw - 88) + 'px';
      }
      chrome.storage.local.set({
        widgetPos: { left: __ZY__.widgetHost.style.left, top: __ZY__.widgetHost.style.top }
      });
    } else if (!_moved) {
      toggleFan();
    }
    _moved = false;
  });

  chrome.storage.local.get(['widgetPos'], function(data) {
    if (data.widgetPos && data.widgetPos.left) {
      __ZY__.widgetHost.style.left   = data.widgetPos.left;
      __ZY__.widgetHost.style.top    = data.widgetPos.top || '24px';
      __ZY__.widgetHost.style.right  = 'auto';
      __ZY__.widgetHost.style.bottom = 'auto';
    }
  });

  // 长按麦克风
  __ZY__.micFanBtn.addEventListener('pointerdown', function(e) {
    e.stopPropagation();
    __ZY__.micFanBtn.setPointerCapture(e.pointerId);
    try {
      if (__ZY__.currentTtsAudio) {
        __ZY__.currentTtsAudio.pause();
        __ZY__.currentTtsAudio.remove();
        __ZY__.currentTtsAudio = null;
      }
      speechSynthesis.cancel();
    } catch (_) {}
    chrome.runtime.sendMessage({ type: 'STOP_TTS' }).catch(function() {});
    setWidgetState('listening');
    __ZY__.micFanBtn.classList.add('recording');
    chrome.runtime.sendMessage({ type: 'CTRL_START_REC' }).catch(function() {});
  });

  function stopRec(e) {
    if (e) e.stopPropagation();
    __ZY__.micFanBtn.classList.remove('recording');
    setWidgetState('thinking');
    chrome.runtime.sendMessage({ type: 'CTRL_STOP_REC' }).catch(function() {});
  }
  __ZY__.micFanBtn.addEventListener('pointerup',     stopRec);
  __ZY__.micFanBtn.addEventListener('pointercancel', stopRec);
  __ZY__.micFanBtn.addEventListener('pointerleave',  stopRec);

  // 文字按钮
  shadow.getElementById('fbtn-txt').addEventListener('click', function(e) {
    e.stopPropagation();
    __ZY__.textWrap.classList.toggle('visible');
    if (__ZY__.textWrap.classList.contains('visible')) __ZY__.textInput.focus();
  });

  // 设置按钮
  shadow.getElementById('fbtn-cfg').addEventListener('click', function(e) {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', payload: {} });
  });

  // 隐藏 / 恢复：只切换外层状态，不重建 SVG，避免打断数字人状态 class。
  hideBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    closeFan();
    __ZY__.widgetHost.classList.add('collapsed');
    chrome.storage.local.set({ widgetCollapsed: true }).catch(function() {});
    if (__ZY__.speechBubble) {
      __ZY__.speechBubble.remove();
      __ZY__.speechBubble = null;
    }
  });

  // Enter 发送，Shift+Enter 换行（与侧边栏一致）
  __ZY__.textInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var text = __ZY__.textInput.value.trim();
      if (!text) return;
      __ZY__.textInput.value = '';
      __ZY__.textInput.style.height = 'auto';
      __ZY__.textWrap.classList.remove('visible');
      closeFan();
      setWidgetState('thinking');
      chrome.runtime.sendMessage({ type: 'ASR_RESULT', payload: { transcript: text } }).catch(function() {});
    }
  });

  // 自动调整 textarea 高度
  __ZY__.textInput.addEventListener('input', function() {
    this.style.height = 'auto';
    var maxH = 120;
    this.style.height = Math.min(this.scrollHeight, maxH) + 'px';
  });

  // 外部点击收起
  document.addEventListener('click', function(e) {
    if (!e.composedPath().includes(__ZY__.widgetHost)) closeFan();
  });

  // Escape 键关闭扇形菜单和文字输入
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeFan();
    }
  });

  // 首次使用引导
  chrome.storage.local.get(['widgetCollapsed'], function(data) {
    if (data.widgetCollapsed) __ZY__.widgetHost.classList.add('collapsed');
  });

  chrome.storage.local.get(['onboardingShown', 'widgetCollapsed'], function(data) {
    if (data.widgetCollapsed) {
      chrome.storage.local.set({ lastActiveTime: Date.now() }).catch(function() {});
      return;
    }
    if (!data.onboardingShown) {
      showSpeechBubble('按住 🎤 说话，或点击我打开菜单✏️文字输入 ⚙️设置');
      chrome.storage.local.set({ onboardingShown: true });
    } else {
      // 非首次：如距上次使用 > 1 天，显示简短提示
      chrome.storage.local.get(['lastActiveTime'], function(d2) {
        if (d2.lastActiveTime && Date.now() - d2.lastActiveTime > 86400000) {
          showSpeechBubble('点击我试试 👋');
        }
      });
    }
    chrome.storage.local.set({ lastActiveTime: Date.now() }).catch(function() {});
  });
}

function showWidgetFromSidePanel() {
  if (!__ZY__.widgetHost) return;
  __ZY__.widgetHost.classList.remove('collapsed');
  chrome.storage.local.set({ widgetCollapsed: false }).catch(function() {});
  setWidgetState('idle');
}

function toggleFan() {
  if (__ZY__.fanLayer.classList.contains('open')) {
    closeFan();
  } else {
    __ZY__.fanLayer.classList.add('open');
  }
}

function closeFan() {
  if (__ZY__.fanLayer) __ZY__.fanLayer.classList.remove('open');
  if (__ZY__.textWrap) __ZY__.textWrap.classList.remove('visible');
}

function setWidgetState(state) {
  var el = __ZY__.pikaBall;
  if (!el) return;
  var newState = state || 'idle';
  var curClass = el.getAttribute('class') || '';
  if (curClass === 'xb-svg ' + newState) return;

  if (el._stTimer) { clearTimeout(el._stTimer); el._stTimer = null; }

  // 活动状态之间切换不经过 fading（避免闪一下）
  var activeStates = ['listening', 'thinking', 'speaking', 'error'];
  var curState = curClass.replace('xb-svg ', '');
  var bothActive = activeStates.indexOf(curState) !== -1 && activeStates.indexOf(newState) !== -1;
  if (bothActive) {
    el.setAttribute('class', 'xb-svg ' + newState);
  } else if (activeStates.indexOf(curState) !== -1 && newState !== curState) {
    el.setAttribute('class', 'xb-svg transitioning');
    el._stTimer = setTimeout(function() {
      el.setAttribute('class', 'xb-svg ' + newState);
      el._stTimer = null;
    }, 250);
  } else {
    el.setAttribute('class', 'xb-svg ' + newState);
  }
}

function setStepBadge(current, total) {
  if (!__ZY__.stepBadge) return;
  __ZY__.stepBadge.textContent = current + '/' + total;
  __ZY__.stepBadge.classList.add('visible');
  __ZY__.stepBadge.classList.remove('done');
}

function hideStepBadge(success) {
  if (!__ZY__.stepBadge) return;
  if (success) {
    __ZY__.stepBadge.textContent = '✓';
    __ZY__.stepBadge.classList.add('done');
    setTimeout(function() {
      __ZY__.stepBadge.classList.remove('visible');
      __ZY__.stepBadge.classList.remove('done');
    }, 1500);
  } else {
    __ZY__.stepBadge.classList.remove('visible');
    __ZY__.stepBadge.classList.remove('done');
  }
}
