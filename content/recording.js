/**
 * Content Script — 麦克风录音 + 浏览器原生语音识别
 *
 * 两个路径：
 *   1. startBrowserRecognition() — 浏览器 Web Speech API（HTTPS，英文优先，免 API 调用）
 *   2. startContentRecording()   — getUserMedia 录音（通用，中文）
 *
 * 依赖: __ZY__ (shared.js)
 */

var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// ── 路径 1：浏览器原生语音识别 ──
// 只在 HTTPS 页面可用，英文效果好，返回文本而非音频。

function startBrowserRecognition() {
  __ZY__.recognitionMethod = 'browser_speech';
  __ZY__.recognitionResult = '';

  return new Promise(function(resolve, reject) {
    if (!SpeechRecognition) {
      __ZY__.recognitionMethod = null;
      reject(new Error('NOT_SUPPORTED'));
      return;
    }

    try {
      var rec = new SpeechRecognition();
      // 使用页面 lang 属性检测语言，中文页面使用中文识别
      var docLang = (document.documentElement.lang || '').toLowerCase();
      rec.lang = docLang.startsWith('zh') ? 'zh-CN' : 'en-US';
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onresult = function(event) {
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            __ZY__.recognitionResult += event.results[i][0].transcript + ' ';
          }
        }
      };

      rec.onend = function() {
        var text = __ZY__.recognitionResult.trim();
        if (text) {
          chrome.runtime.sendMessage({
            type: 'RECOGNITION_FINAL',
            payload: { text: text, source: 'browser_speech' }
          }).catch(function() {});
        }
        // 无结果时忽略（用户没说话也算正常结束）
      };

      rec.onerror = function(event) {
        __ZY__.recognitionMethod = null;
        // 'aborted' 是 stop() 触发的正常取消，不报错
        if (event.error !== 'aborted') {
          console.warn('[Content] SpeechRecognition error:', event.error);
        }
        reject(new Error(event.error));
      };

      __ZY__.browserRecognition = rec;
      rec.start();
      resolve(); // 立即 resolve，录制结果通过 RECOGNITION_FINAL 异步返回
    } catch (e) {
      __ZY__.recognitionMethod = null;
      reject(e);
    }
  });
}

function stopBrowserRecognition() {
  if (__ZY__.browserRecognition) {
    try { __ZY__.browserRecognition.stop(); } catch (_) {}
    __ZY__.browserRecognition = null;
  }
}

// ── 路径 2：getUserMedia 录音（通用，中文）──

async function startContentRecording() {
  __ZY__.recognitionMethod = 'recording';
  __ZY__.contentChunks = [];
  // ASR 最佳音频参数：16kHz 单声道 + 降噪
  var stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    }
  });
  __ZY__.contentStream = stream;
  __ZY__.contentMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus' : 'audio/webm';

  __ZY__.contentRecorder = new MediaRecorder(stream, { mimeType: __ZY__.contentMimeType });
  __ZY__.contentRecorder.ondataavailable = function(e) {
    if (e.data.size > 0) __ZY__.contentChunks.push(e.data);
  };
  __ZY__.contentRecorder.onstop = function() {
    stream.getTracks().forEach(function(t) { t.stop(); });
    __ZY__.contentStream = null;
    if (__ZY__.contentChunks.length === 0) {
      chrome.runtime.sendMessage({ type: 'RECORDING_DONE', payload: { error: 'NO_AUDIO' } }).catch(function() {});
      return;
    }
    var blob = new Blob(__ZY__.contentChunks, { type: __ZY__.contentMimeType });
    // 不截断音频：截断会导致 ASR 只能识别开头几个字。
    if (blob.size > 1024 * 1024) {
      console.warn('[Content] Large recording (' + blob.size + ' bytes), sending full audio to ASR');
    }
    var reader = new FileReader();
    reader.onloadend = function() {
      chrome.runtime.sendMessage({
        type: 'RECORDING_DONE',
        payload: { audio: reader.result.split(',')[1], mimeType: __ZY__.contentMimeType }
      }).catch(function() {});
    };
    reader.readAsDataURL(blob);
  };
  __ZY__.contentRecorder.start(100);
  if (__ZY__.pendingStop) { __ZY__.pendingStop = false; __ZY__.contentRecorder.stop(); }
}

function stopContentRecording() {
  if (__ZY__.recognitionMethod === 'browser_speech') {
    stopBrowserRecognition();
    return;
  }
  if (__ZY__.contentRecorder && __ZY__.contentRecorder.state !== 'inactive') {
    __ZY__.contentRecorder.stop();
  } else {
    __ZY__.pendingStop = true;
  }
}
