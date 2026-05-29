/**
 * Content Script — 共享状态命名空间
 *
 * 被 content/ 下所有模块引用。声明为 var ⽽非 let/const，
 * 因为 content_scripts 数组中的多个 JS 文件共享同一全局作⽤域。
 * 不使⽤ IIFE 包装，以便后续模块访问这些状态。
 */
'use strict';

var __ZY__ = {

  /* === 高亮状态 === */
  highlightEl: null,          // 当前⾼亮覆盖层 DOM 元素
  highlightTargetEl: null,    // 被⾼亮的⽬标元素（供 verifyText 校验使⽤）
  highlightClickDismiss: null,// 点击⾼亮外部⾃动消隐的事件处理函数
  highlightTrackRaf: null,    // requestAnimationFrame ID ⽤于跟踪⾼亮位置

  /* === TTS 状态 === */
  currentTtsAudio: null,      // 当前正在播放的 TTS 音频元素

  /* === Widget UI 状态 === */
  widgetHost: null,           // Shadow DOM 宿主元素
  pikaBall: null,             // SVG 角色元素
  fanLayer: null,             // 扇形菜单层
  micFanBtn: null,            // 麦克⻛按钮
  textWrap: null,             // ⽂字输⼊框包装元素
  textInput: null,            // ⽂字输⼊框
  speechBubble: null,         // 当前语⾳气泡元素
  stepBadge: null,            // 多步任务进度徽标元素

  /* === 录⾳状态 === */
  contentRecorder: null,      // MediaRecorder 实例
  contentChunks: null,        // 录⾳数据⽚段
  contentStream: null,        // MediaStream
  contentMimeType: '',        // 录⾳ MIME 类型
  pendingStop: false          // 标记停⽌录⾳的请求
};
