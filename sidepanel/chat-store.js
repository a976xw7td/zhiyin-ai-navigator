/**
 * Side Panel — 对话存储层
 *
 * chrome.storage.local 持久化对话记录
 * 上限 100 条对话，自动删除最旧的
 */

export const ChatStore = {
  MAX_CONVERSATIONS: 100,
  _conversations: [],
  _currentConvId: null,
  _writeQueue: Promise.resolve(),  // 写入队列，串行化防竞态

  // 串行化包装器
  _serialize(fn) {
    this._writeQueue = this._writeQueue.then(fn, fn);
    return this._writeQueue;
  },

  // 加载对话列表
  async load() {
    var data = await chrome.storage.local.get('conversations');
    this._conversations = data.conversations || [];
  },

  // 保存对话列表
  async _saveList() {
    await chrome.storage.local.set({ conversations: this._conversations });
  },

  // 创建新对话
  async newConversation(title, site) {
    var id = 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    var conv = {
      id: id,
      title: title || '新对话',
      site: site || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      msgCount: 0,
      sourceIds: [],
      files: [],
      searchResults: [],
      contextScopes: []
    };
    this._conversations.unshift(conv);

    // 超限删除最旧
    if (this._conversations.length > this.MAX_CONVERSATIONS) {
      var removed = this._conversations.pop();
      await chrome.storage.local.remove('messages_' + removed.id);
    }

    await this._saveList();
    this._currentConvId = id;
    return conv;
  },

  // 获取当前对话
  getCurrentConv() {
    return this._conversations.find(function(c) { return c.id === this._currentConvId; }.bind(this)) || null;
  },

  // 存储/恢复上次活跃对话
  async getLastActiveConvId() {
    var data = await chrome.storage.local.get('lastActiveConvId');
    return data.lastActiveConvId || null;
  },
  async setLastActiveConvId(id) {
    await chrome.storage.local.set({ lastActiveConvId: id || '' });
  },

  // 加载对话消息
  async loadMessages(convId) {
    var key = 'messages_' + convId;
    var data = await chrome.storage.local.get(key);
    return data[key] || [];
  },

  // 保存单条消息（通过写入队列串行化，防并发竞态）
  async addMessage(convId, role, content, meta) {
    return this._serialize(async function() {
      if (!convId) return;
      var key = 'messages_' + convId;
      var data = await chrome.storage.local.get(key);
      var messages = data[key] || [];

      var msg = {
        id: 'msg_' + Date.now() + '_' + messages.length,
        role: role,
        content: content || '',
        timestamp: Date.now(),
        meta: meta || {}
      };
      messages.push(msg);

      // 只保留最近 200 条消息
      if (messages.length > 200) messages = messages.slice(-200);

      await chrome.storage.local.set({ [key]: messages });

      // 更新对话计数
      var conv = this._conversations.find(function(c) { return c.id === convId; });
      if (conv) {
        conv.msgCount = messages.length;
        conv.updatedAt = Date.now();
        this._mergeConversationContext(conv, meta && (meta.context || meta));
        if (role === 'user' && messages.filter(function(m) { return m.role === 'user'; }).length === 1) {
          conv.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
        }
        await this._saveList();
      }
    }.bind(this));
  },

  _mergeConversationContext(conv, context) {
    if (!conv || !context) return;
    function mergeArray(oldList, nextList, key) {
      var map = new Map();
      (Array.isArray(oldList) ? oldList : []).forEach(function(item) {
        var id = key ? item && item[key] : item;
        if (id) map.set(id, item);
      });
      (Array.isArray(nextList) ? nextList : []).forEach(function(item) {
        var id = key ? item && item[key] : item;
        if (id) map.set(id, item);
      });
      return Array.from(map.values()).slice(0, 40);
    }
    conv.sourceIds = mergeArray(conv.sourceIds, context.sourceIds || context.customSourceIds, null);
    conv.files = mergeArray(conv.files, context.files, 'id');
    conv.searchResults = mergeArray(conv.searchResults, context.searchResults, 'id');
    conv.contextScopes = mergeArray(conv.contextScopes, context.scope ? [context.scope] : [], null);
  },

  async updateConversationContext(convId, context) {
    var conv = this._conversations.find(function(c) { return c.id === convId; });
    if (!conv) return;
    this._mergeConversationContext(conv, context || {});
    conv.updatedAt = Date.now();
    await this._saveList();
  },

  // 更新对话标题
  async setConvTitle(convId, title) {
    var conv = this._conversations.find(function(c) { return c.id === convId; });
    if (conv) {
      conv.title = title.slice(0, 40) + (title.length > 40 ? '...' : '');
      await this._saveList();
    }
  },

  // 更新最后一条助手消息（流式追加用）
  async updateLastAssistantMessage(convId, content, meta) {
    return this._serialize(async function() {
      if (!convId) return;
      var key = 'messages_' + convId;
      var data = await chrome.storage.local.get(key);
      var messages = data[key] || [];
      for (var i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i].content = content;
          if (meta) Object.assign(messages[i].meta, meta);
          break;
        }
      }
      var conv = this._conversations.find(function(c) { return c.id === convId; });
      if (conv && meta) {
        this._mergeConversationContext(conv, meta.context || meta);
        conv.updatedAt = Date.now();
        await this._saveList();
      }
      await chrome.storage.local.set({ [key]: messages });
    }.bind(this));
  },

  // 删除对话
  async deleteConversation(convId) {
    this._conversations = this._conversations.filter(function(c) { return c.id !== convId; });
    await this._saveList();
    await chrome.storage.local.remove('messages_' + convId);
    if (this._currentConvId === convId) this._currentConvId = null;
  },

  // 清空所有对话
  async clearAll() {
    var keys = this._conversations.map(function(c) { return 'messages_' + c.id; });
    keys.push('conversations');
    await chrome.storage.local.remove(keys);
    this._conversations = [];
    this._currentConvId = null;
  },

  // 搜索对话
  search(query) {
    if (!query) return this._conversations;
    var q = query.toLowerCase();
    return this._conversations.filter(function(c) {
      return c.title.toLowerCase().indexOf(q) !== -1 || (c.site && c.site.toLowerCase().indexOf(q) !== -1);
    });
  }
};
