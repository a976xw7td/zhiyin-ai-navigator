/**
 * Side Panel — 对话视图
 *
 * 渲染聊天消息、流式文本、操作结果。
 * 与 ChatStore 配合实现持久化。
 */

import { ChatStore } from './chat-store.js';

/** SVG 头像 — 数字人小型版（对话列表用，含光晕+手+脚） */
const _AVATAR_SVG = '<svg viewBox="-10 -8 118 136" width="21" height="24" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="ah" cx="38%" cy="32%" r="65%"><stop offset="0%" stop-color="#fffef8"/><stop offset="55%" stop-color="#f8ece0"/><stop offset="100%" stop-color="#e8d0bc"/></radialGradient><radialGradient id="ae" cx="30%" cy="28%" r="66%"><stop offset="0%" stop-color="#c8f0ff"/><stop offset="50%" stop-color="#3098d8"/><stop offset="100%" stop-color="#0860a8"/></radialGradient><radialGradient id="ab" cx="40%" cy="30%" r="65%"><stop offset="0%" stop-color="#fff4f0"/><stop offset="55%" stop-color="#f5dcd8"/><stop offset="100%" stop-color="#e0b8b4"/></radialGradient><radialGradient id="af" cx="40%" cy="35%" r="65%"><stop offset="0%" stop-color="#ffd0dc"/><stop offset="100%" stop-color="#f0a0b8"/></radialGradient></defs><g transform="scale(1.04)"><ellipse cx="50" cy="32" rx="38" ry="38" fill="rgba(255,180,200,0.12)"/><circle cx="50" cy="32" r="30" fill="url(#ah)"/><ellipse cx="41" cy="18" rx="10" ry="6" fill="rgba(255,255,255,0.50)" transform="rotate(-12,41,18)"/><ellipse cx="50" cy="34" rx="21" ry="19" fill="#fff8f0"/><ellipse cx="42" cy="31" rx="5.5" ry="6" fill="url(#ae)"/><circle cx="39" cy="28" r="3.2" fill="rgba(255,255,255,0.92)"/><circle cx="45.5" cy="34.5" r="1.4" fill="rgba(255,255,255,0.38)"/><ellipse cx="58" cy="31" rx="5.5" ry="6" fill="url(#ae)"/><circle cx="55" cy="28" r="3.2" fill="rgba(255,255,255,0.92)"/><circle cx="61.5" cy="34.5" r="1.4" fill="rgba(255,255,255,0.38)"/><ellipse cx="32" cy="37" rx="6" ry="3.5" fill="#ffb8c8" opacity="0.75"/><ellipse cx="68" cy="37" rx="6" ry="3.5" fill="#ffb8c8" opacity="0.75"/><path d="M44,44 Q50,49 56,44" fill="none" stroke="#d08878" stroke-width="1.5" stroke-linecap="round"/><path d="M39,62 C28,64 14,70 14,82 C14,95 26,104 50,104 C74,104 86,95 86,82 C86,70 72,64 61,62Z" fill="url(#ab)"/><ellipse cx="44" cy="80" rx="10" ry="12" fill="rgba(255,255,255,0.30)"/><ellipse cx="10" cy="77" rx="11" ry="7" fill="url(#ab)" transform="rotate(-22,10,77)"/><ellipse cx="90" cy="77" rx="11" ry="7" fill="url(#ab)" transform="rotate(22,90,77)"/><ellipse cx="37" cy="110" rx="12" ry="7" fill="url(#af)"/><ellipse cx="63" cy="110" rx="12" ry="7" fill="url(#af)"/><ellipse cx="34" cy="107" rx="4" ry="2.5" fill="rgba(255,255,255,0.40)"/><ellipse cx="60" cy="107" rx="4" ry="2.5" fill="rgba(255,255,255,0.40)"/></g></svg>';

/** 大型 SVG 头像（欢迎页用，完整版含光晕+手+脚+光环） */
const _AVATAR_SVG_LARGE = '<svg viewBox="-10 -8 118 136" width="70" height="82" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 16px rgba(180,100,140,0.35))"><defs><radialGradient id="alh" cx="38%" cy="32%" r="65%"><stop offset="0%" stop-color="#fffef8"/><stop offset="55%" stop-color="#f8ece0"/><stop offset="100%" stop-color="#e8d0bc"/></radialGradient><radialGradient id="ale" cx="30%" cy="28%" r="66%"><stop offset="0%" stop-color="#c8f0ff"/><stop offset="50%" stop-color="#3098d8"/><stop offset="100%" stop-color="#0860a8"/></radialGradient><radialGradient id="alb" cx="40%" cy="30%" r="65%"><stop offset="0%" stop-color="#fff4f0"/><stop offset="55%" stop-color="#f5dcd8"/><stop offset="100%" stop-color="#e0b8b4"/></radialGradient><radialGradient id="alf" cx="40%" cy="35%" r="65%"><stop offset="0%" stop-color="#ffd0dc"/><stop offset="100%" stop-color="#f0a0b8"/></radialGradient></defs><g transform="scale(1.04)"><ellipse cx="50" cy="32" rx="38" ry="38" fill="rgba(255,180,200,0.10)"/><circle cx="50" cy="32" r="36" fill="none" stroke="#ffb0c8" stroke-width="1.6" stroke-dasharray="11 5" stroke-linecap="round" opacity="0.70"/><circle cx="50" cy="32" r="30" fill="url(#alh)"/><ellipse cx="41" cy="18" rx="10" ry="6" fill="rgba(255,255,255,0.50)" transform="rotate(-12,41,18)"/><ellipse cx="50" cy="34" rx="21" ry="19" fill="#fff8f0"/><ellipse cx="42" cy="31" rx="6.5" ry="7" fill="url(#ale)"/><circle cx="39" cy="28" r="3.8" fill="rgba(255,255,255,0.92)"/><circle cx="45.5" cy="34.5" r="1.6" fill="rgba(255,255,255,0.38)"/><ellipse cx="58" cy="31" rx="6.5" ry="7" fill="url(#ale)"/><circle cx="55" cy="28" r="3.8" fill="rgba(255,255,255,0.92)"/><circle cx="61.5" cy="34.5" r="1.6" fill="rgba(255,255,255,0.38)"/><ellipse cx="32" cy="37" rx="7" ry="4.5" fill="#ffb8c8" opacity="0.75"/><ellipse cx="68" cy="37" rx="7" ry="4.5" fill="#ffb8c8" opacity="0.75"/><path d="M44,44 Q50,49 56,44" fill="none" stroke="#d08878" stroke-width="1.7" stroke-linecap="round"/><path d="M39,62 C28,64 14,70 14,82 C14,95 26,104 50,104 C74,104 86,95 86,82 C86,70 72,64 61,62Z" fill="url(#alb)"/><ellipse cx="44" cy="80" rx="11" ry="13" fill="rgba(255,255,255,0.30)"/><ellipse cx="9" cy="76" rx="13" ry="8" fill="url(#alb)" transform="rotate(-22,9,76)"/><ellipse cx="91" cy="76" rx="13" ry="8" fill="url(#alb)" transform="rotate(22,91,76)"/><ellipse cx="37" cy="110" rx="13" ry="8" fill="url(#alf)"/><ellipse cx="63" cy="110" rx="13" ry="8" fill="url(#alf)"/><ellipse cx="34" cy="107" rx="5" ry="3" fill="rgba(255,255,255,0.40)"/><ellipse cx="60" cy="107" rx="5" ry="3" fill="rgba(255,255,255,0.40)"/></g></svg>';

export var ChatView = {
  container: null,
  _streamingMsgId: null,
  _lastUserText: '',
  _autoScroll: true,

  // 初始化
  async init(containerEl) {
    this.container = containerEl;
    // 滚动检测：用户向上翻时暂停自动滚动，回底部时恢复
    this.container.addEventListener('scroll', function() {
      var c = this.container;
      var atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 80;
      this._autoScroll = atBottom;
    }.bind(this));
    await ChatStore.load();
    if (ChatStore._conversations.length > 0) {
      // 尝试恢复上次对话
      var lastId = await ChatStore.getLastActiveConvId();
      if (lastId && ChatStore._conversations.some(function(c) { return c.id === lastId; })) {
        await this.switchConversation(lastId);
      } else {
        // 无上次对话则加载最新一条
        await this.switchConversation(ChatStore._conversations[0].id);
      }
    } else {
      this.showWelcome();
    }
    // 委托事件：欢迎页提示点击 + 代码块复制
    var self = this;
    this.container.addEventListener('click', function(e) {
      // 欢迎页提示点击
      var tip = e.target.closest('.chat-welcome-tip');
      if (tip && tip.dataset.query && self._onWelcomeTip) {
        self._onWelcomeTip(tip.dataset.query);
        return;
      }
      // 代码块复制
      var copyBtn = e.target.closest('.code-copy-btn');
      if (copyBtn) {
        var pre = copyBtn.parentNode.querySelector('pre');
        if (pre) {
          var code = pre.textContent || '';
          navigator.clipboard.writeText(code).then(function() {
            copyBtn.innerHTML = '<i data-lucide="clipboard-check" style="width:11px;height:11px;display:block"></i>'; if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            setTimeout(function() { copyBtn.textContent = '复制'; }, 1500);
          }).catch(function() {});
        }
      }
    });
  },

  // 添加用户消息（同步渲染 DOM，异步保存）
  addUserMessage(text, meta) {
    this._lastUserText = text;

    var conv = ChatStore.getCurrentConv();
    if (!conv) {
      // 无现有对话 → 异步创建，同步渲染消息（防止 startStreaming 抢先）
      ChatStore.newConversation(
        text.slice(0, 30) + (text.length > 30 ? '...' : ''),
        window._currentSite || ''
      ).then(function(c) {
        ChatStore._currentConvId = c.id;
        ChatStore.addMessage(c.id, 'user', text, meta || {}).catch(function(e) {
          console.warn('[CV] Save msg failed:', e.message);
        });
      }).catch(function(e) {
        console.warn('[CV] New conv failed:', e.message);
      });
    }

    // 立即渲染到 DOM
    this._renderMessage('user', text, {}, Date.now());
    this._scrollBottom();

    // 已有对话 → 直接异步保存
    if (conv) {
      ChatStore.addMessage(conv.id, 'user', text, meta || {}).catch(function(e) {
        console.warn('[CV] Save msg failed:', e.message);
      });
    }
  },

  // 开始流式响应（幂等：已有流式时不重复创建）
  startStreaming() {
    if (this._streamingMsgId) return;
    this._streamingMsgId = 'stream_' + Date.now();
    var div = document.createElement('div');
    div.className = 'chat-msg assistant streaming';
    div.id = this._streamingMsgId;
    div.innerHTML = '<div class="chat-msg-label">' + _AVATAR_SVG + ' <span>智引</span></div>' +
      '<div class="chat-bubble"><span class="streaming-text"></span><span class="streaming-cursor">|</span></div>';
    this.container.appendChild(div);
    this._scrollBottom();
  },

  // 追加流式文本
  appendStreamText(text) {
    if (!this._streamingMsgId) return;
    var el = document.getElementById(this._streamingMsgId);
    if (!el) return;
    var textEl = el.querySelector('.streaming-text');
    if (textEl) textEl.textContent = text;
    this._scrollBottom();
  },

  // 结束流式，固化消息
  async finishStreaming(text, meta) {
    if (!this._streamingMsgId) return;
    var el = document.getElementById(this._streamingMsgId);
    if (el) {
      el.querySelector('.streaming-cursor').remove();
      var textEl = el.querySelector('.streaming-text');
      if (textEl) textEl.innerHTML = this._renderMarkdown(text || '');
      el.classList.remove('streaming');
      // 添加操作按钮
      this._addMessageActions(el, text || '', meta && meta.actionSuccess === false);
    }
    this._streamingMsgId = null;
    if (typeof lucide !== 'undefined' && lucide.createIcons) { setTimeout(function() { lucide.createIcons(); }, 0); }

    // 持久化
    var conv = ChatStore.getCurrentConv();
    if (conv) {
      await ChatStore.addMessage(conv.id, 'assistant', text || '', meta || {});
      // 首次回复后更新对话标题（用 AI 回复首句替代原始输入）
      if (text && conv && conv.msgCount <= 2) {
        var title = this._extractTitle(text);
        await ChatStore.setConvTitle(conv.id, title);
        this._renderConversationTitle(conv);
      }
    }
    this._scrollBottom();
  },

  // 从 AI 回复中提取简短标题
  _extractTitle(text) {
    // 去掉 Markdown 标记、代码块、HTML
    var clean = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*#\[\]()>|]/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    // 取第一句或前 40 字
    var first = clean.split(/[。.!！\n]/)[0] || clean;
    return first.slice(0, 40) + (first.length > 40 ? '...' : '');
  },

  _actionLabel(action, success) {
    var labels = {
      highlight: success ? '已标注位置' : '标注失败',
      click: success ? '已点击' : '点击失败',
      input: success ? '已填入' : '填入失败',
      scroll: success ? '已滚动' : '滚动失败',
      describe: '回答完毕'
    };
    return labels[action] || (success ? '已完成' : '操作失败');
  },

  // 渲染单条消息（用于加载历史）
  _renderMessage(role, content, meta, timestamp) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    var extra = '';
    var isError = meta && meta.actionSuccess === false;

    // 时间戳（必须在 labelMarkup 之前计算）
    var ts = '';
    if (timestamp) {
      var d = new Date(timestamp);
      ts = '<span class="chat-ts">' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0') + '</span>';
    }

    var labelMarkup = role === 'assistant'
      ? _AVATAR_SVG + ' <span>智引</span>' + ts
      : '你' + ts;

    if (meta && meta.action) {
      var icon = isError ? '⚠️' : '✅';
      extra = '<span class="chat-action-badge">' + icon + ' ' + this._actionLabel(meta.action, !isError) + '</span>';
    }

    var bubbleContent = role === 'assistant'
      ? this._renderMarkdown(content)
      : this._escapeHtml(content);

    div.innerHTML = '<div class="chat-msg-label">' + labelMarkup  + '</div>' +
      '<div class="chat-bubble">' + bubbleContent + extra + '</div>';

    if (role === 'assistant') {
      this._addMessageActions(div, content, isError);
    }

    this.container.appendChild(div);
  },

  // 显示加载骨架
  _showSkeleton() {
    var div = document.createElement('div');
    div.className = 'chat-skeleton';
    div.id = 'chat-skeleton';
    div.innerHTML = '<div class="chat-skeleton-line short"></div>' +
      '<div class="chat-skeleton-line medium"></div>' +
      '<div class="chat-skeleton-line short"></div>' +
      '<div class="chat-skeleton-line"></div>' +
      '<div class="chat-skeleton-line medium"></div>';
    this.container.appendChild(div);
  },

  _hideSkeleton() {
    var el = document.getElementById('chat-skeleton');
    if (el) el.remove();
  },

  // 批量加载历史消息
  async loadConversationMessages(convId) {
    this.container.innerHTML = '';
    this._showSkeleton();
    ChatStore._currentConvId = convId;
    ChatStore.setLastActiveConvId(convId).catch(function() {});
    this._autoScroll = true;  // 切换对话时强制滚动到底部

    var messages = await ChatStore.loadMessages(convId);
    this._hideSkeleton();
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      this._renderMessage(msg.role, msg.content, msg.meta, msg.timestamp);
    }
    this._scrollBottom();
  },

  // 切换对话
  async switchConversation(convId) {
    ChatStore._currentConvId = convId;
    await this.loadConversationMessages(convId);

    var conv = ChatStore.getCurrentConv();
    if (conv) this._renderConversationTitle(conv);
  },

  // 显示对话标题
  _renderConversationTitle(conv) {
    var titleEl = document.getElementById('chat-conv-title');
    if (titleEl) titleEl.textContent = conv ? conv.title : '';
  },

  _scrollBottom() {
    if (this.container && this._autoScroll) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  },

  _escapeAttr(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  _safeHref(url) {
    var raw = String(url || '').trim();
    if (!raw) return '#';
    if (/[\s"'<>]/.test(raw)) return '#';
    if (/^(https?:|mailto:)/i.test(raw)) return this._escapeAttr(raw);
    if (/^[./#]/.test(raw)) return this._escapeAttr(raw);
    return '#';
  },

  // Markdown → HTML 渲染（轻量实现，无外部依赖）
  _renderMarkdown(text) {
    if (!text) return '';
    // 1. HTML 转义
    var html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. 代码块占位 —— 先提取并保护，避免内部字符被后续规则破坏
    var codeBlocks = [];
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function(_, lang, code) {
      var idx = codeBlocks.length;
      var cls = lang ? ' class="lang-' + lang + '"' : '';
      codeBlocks.push('<div class="code-block-wrap"><button class="code-copy-btn">复制</button><pre><code' + cls + '>' + code + '</code></pre></div>');
      return '\x00CODE' + idx + '\x00';
    });

    // 3. 行内记号
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, label, url) {
      return '<a href="' + ChatView._safeHref(url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });

    // 4. 按行处理块级元素
    var lines = html.split('\n');
    var out = [];
    var inUl = false, inOl = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // 跳过代码块占位
      if (/^\x00CODE\d+\x00$/.test(line)) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        out.push(line);
        continue;
      }

      // 标题
      var hMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (hMatch) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        var hLevel = hMatch[1].length + 1; // #=h2, ##=h3, ###=h4
        out.push('<h' + hLevel + '>' + hMatch[2] + '</h' + hLevel + '>');
        continue;
      }

      // 有序列表项
      var olMatch = line.match(/^\d+\.\s+(.+)/);
      if (olMatch) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push('<li>' + olMatch[1] + '</li>');
        continue;
      }

      // 无序列表项
      var ulMatch = line.match(/^[-*]\s+(.+)/);
      if (ulMatch) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push('<li>' + ulMatch[1] + '</li>');
        continue;
      }

      // 普通行 —— 如果之前正在列表，关闭列表标签
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }

      // 段落分隔（连续两个空行 = 段落间）和普通换行
      if (line === '' && i > 0 && lines[i - 1] !== '') {
        out.push('<br><br>');
      } else if (line !== '') {
        out.push(line + '<br>');
      }
    }

    if (inUl) out.push('</ul>');
    if (inOl) out.push('</ol>');

    html = out.join('');

    // 5. 恢复代码块
    html = html.replace(/\x00CODE(\d+)\x00/g, function(_, idx) {
      return codeBlocks[parseInt(idx)] || '';
    });

    return html;
  },

  // 添加消息操作按钮（复制、重试）
  _addMessageActions(msgEl, content, isError) {
    var actionsEl = msgEl.querySelector('.chat-actions');
    if (actionsEl) return;
    actionsEl = document.createElement('div');
    actionsEl.className = 'chat-actions';

    // 复制按钮
    var copyBtn = document.createElement('button');
    copyBtn.className = 'chat-action-btn copy-btn';
    copyBtn.title = '复制';
    copyBtn.innerHTML = '<i data-lucide="clipboard-copy" style="width:11px;height:11px;display:block"></i>'; if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    copyBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      navigator.clipboard.writeText(content).then(function() {
        copyBtn.innerHTML = '<i data-lucide="clipboard-check" style="width:11px;height:11px;display:block"></i>'; if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        setTimeout(function() { copyBtn.innerHTML = '<i data-lucide="clipboard-copy" style="width:11px;height:11px;display:block"></i>'; if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons(); }, 1500);
      }).catch(function() {});
    });
    actionsEl.appendChild(copyBtn);

    // 失败消息：重试按钮
    if (isError && this._lastUserText) {
      var retryBtn = document.createElement('button');
      retryBtn.className = 'chat-action-btn retry-btn';
      retryBtn.title = '重试';
      retryBtn.textContent = '🔄';
      retryBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        // 移除当前消息
        msgEl.remove();
        // 触发重试
        if (typeof window.__retrySend === 'function') {
          window.__retrySend(this._lastUserText);
        }
      }.bind(this));
      actionsEl.appendChild(retryBtn);
    }

    msgEl.appendChild(actionsEl);
  },

  _escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  },

  // 显示欢迎界面
  async showWelcome() {
    var self = this;
    // 获取当前页信息
    var pageInfo = '';
    try {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.url && !tabs[0].url.startsWith('chrome://') && !tabs[0].url.startsWith('chrome-extension://')) {
        var url = new URL(tabs[0].url);
        pageInfo = '📍 ' + (tabs[0].title || url.hostname).slice(0, 40);
      }
    } catch (_) {}

    this.container.innerHTML =
      '<div class="chat-welcome">' +
        '<div class="chat-welcome-icon" style="display:flex;align-items:center;justify-content:center;animation:welcome-float 3.5s ease-in-out infinite">' + _AVATAR_SVG_LARGE + '</div>' +
        '<div class="chat-welcome-title">智引AI导航导师</div>' +
        '<div class="chat-welcome-desc">' + (pageInfo || '按住麦克风说话或输入文字，让我帮你导航') + '</div>' +
        '<div class="chat-welcome-tips">' +
          '<div class="chat-welcome-tip" data-query="总结这个页面的主要内容"><i data-lucide="clipboard-list" style="width:11px;height:11px;vertical-align:middle;margin-right:2px"></i> 试试：<strong>"总结这个页面"</strong></div>' +
          '<div class="chat-welcome-tip" data-query="帮我找到这个页面上的搜索功能"><i data-lucide="search" style="width:11px;height:11px;vertical-align:middle;margin-right:2px"></i> 试试：<strong>"帮我找到搜索功能"</strong></div>' +
          '<div class="chat-welcome-tip" data-query="这个页面怎么使用？有什么主要功能"><i data-lucide="mic" style="width:11px;height:11px;vertical-align:middle;margin-right:2px"></i> 试试：<strong>"这个页面怎么用？"</strong></div>' +
        '</div>' +
      '</div>';
    this._streamingMsgId = null;
    if (typeof lucide !== 'undefined' && lucide.createIcons) { setTimeout(function() { lucide.createIcons(); }, 0); }
  },

  // 清空
  clear() {
    this.container.innerHTML = '';
    this._streamingMsgId = null;
    if (typeof lucide !== 'undefined' && lucide.createIcons) { setTimeout(function() { lucide.createIcons(); }, 0); }
  },

  // 导出当前对话为 Markdown 文件
  async exportConversation(convId) {
    var messages = [];
    try {
      messages = await ChatStore.loadMessages(convId);
    } catch (e) {
      console.warn('[CV] Export load failed:', e.message);
      return false;
    }

    var conv = ChatStore.getCurrentConv();
    var title = conv ? conv.title : '未命名对话';
    var site = conv ? conv.site || '' : '';
    var time = conv ? new Date(conv.createdAt).toLocaleString('zh-CN') : '';
    var lines = [
      '---',
      'title: "' + title + '"',
      'source: "' + site + '"',
      'created: "' + time + '"',
      'exported: "' + new Date().toLocaleString('zh-CN') + '"',
      '---',
      ''
    ];

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var content = msg.content || '';
      content = content.replace(/<[^>]+>/g, '');
      if (msg.role === 'user') {
        lines.push('## 👤 你');
      } else {
        lines.push('## 🤖 智引');
      }
      lines.push('');
      lines.push(content);
      lines.push('');
    }

    var md = lines.join('\n');

    // 下载 .md 文件
    var safeName = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').substring(0, 50);
    var filename = '智引对话_' + safeName + '_' + Date.now() + '.md';
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 短暂反馈
    var exportBtn = document.getElementById('chat-export-btn');
    if (exportBtn) {
      exportBtn.innerHTML = '<i data-lucide="file-down" style="width:11px;height:11px;vertical-align:middle"></i>'; if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      setTimeout(function() { exportBtn.innerHTML = '<i data-lucide="clipboard-list" style="width:11px;height:11px;vertical-align:middle"></i>'; if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons(); }, 1500);
    }

    return true;
  }
};
