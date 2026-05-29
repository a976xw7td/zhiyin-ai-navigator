/**
 * Language Utilities — 语种检测 + 多语言状态文本
 *
 * @module lang
 */

const ZH_PATTERN = /[一-鿿㐀-䶿]/;

/**
 * 检测文本语种
 * @param {string} text
 * @returns {'zh'|'en'}
 */
export function detectLanguage(text) {
  return ZH_PATTERN.test(text) ? 'zh' : 'en';
}

const MESSAGES = {
  recTimeout:    { zh: '录音超时，请重试',              en: 'Recording timed out, please retry' },
  noTab:         { zh: '无法获取当前页面',              en: 'Cannot access current page' },
  invalidTab:    { zh: '无效的页面地址',                en: 'Invalid page address' },
  connectFailed: { zh: '连接失败，请刷新后重试',        en: 'Connection failed, please refresh' },
  micPermission: { zh: '麦克风权限被拒绝，请在浏览器设置中允许', en: 'Microphone permission denied, please allow in browser settings' },
  ready:         { zh: '准备就绪',                      en: 'Ready' },
  noAudio:       { zh: '未检测到语音',                  en: 'No audio detected' },
  recFailed:     { zh: '录音失败',                      en: 'Recording failed' },
  noMic:         { zh: '未找到麦克风',                  en: 'No microphone found' },
  recError:      { zh: '录音出错',                      en: 'Recording error' },
  recording:     { zh: '正在录音...',                   en: 'Recording...' },
  configAsrKey:  { zh: '请先在设置中填入 ASR API Key',  en: 'Please enter ASR API Key in settings' },
  configApiKey:  { zh: '请先在设置中填入 DeepSeek API Key', en: 'Please enter DeepSeek API Key in settings' },
  noAsrKey:      { zh: 'ASR API Key 未配置',            en: 'ASR API Key not configured' },
  noApiKey:      { zh: 'DeepSeek API Key 未配置',       en: 'DeepSeek API Key not configured' },
  asrSaved:      { zh: 'ASR 配置已保存',                en: 'ASR config saved' },
  keySaved:      { zh: 'API Key 已保存',                en: 'API Key saved' },
  saveFailed:    { zh: '保存失败',                      en: 'Save failed' },
  needKey:       { zh: '请填入 DeepSeek API Key',       en: 'Please enter DeepSeek API Key' },
  needAsrKey:    { zh: '请填入 ASR API Key',            en: 'Please enter ASR API Key' },
  processing:    { zh: '正在处理...',                   en: 'Processing...' },
  asrKeyMissing: { zh: 'ASR Key 未配置',                en: 'ASR Key missing' },
  asrAuthError:  { zh: 'ASR 认证失败',                  en: 'ASR authentication failed' },
  asrTimeout:    { zh: 'ASR 请求超时',                  en: 'ASR request timed out' },
  asrNetwork:    { zh: 'ASR 网络错误',                  en: 'ASR network error' },
  asrEmpty:      { zh: 'ASR 返回为空',                  en: 'ASR returned empty' },
  asrNoAudio:    { zh: '无音频数据',                    en: 'No audio data' },
  domFailed:     { zh: '页面分析失败',                  en: 'Page analysis failed' },
  apiEmpty:      { zh: 'API 返回为空',                  en: 'API returned empty' },
  apiJsonError:  { zh: 'API 响应解析失败',              en: 'API response parse failed' },
  apiTimeout:    { zh: 'API 请求超时',                  en: 'API request timed out' },
  apiRateLimit:  { zh: 'API 频率限制',                  en: 'API rate limit reached' },
  apiAuthError:  { zh: 'API 认证失败',                  en: 'API authentication failed' },
  genericError:  { zh: '发生错误，请重试',              en: 'An error occurred, please retry' },
  apiQuotaExceeded:  { zh: 'API 额度不足，请检查账户余额',  en: 'API quota exceeded, check your account balance' },
  apiServerError:    { zh: 'API 服务暂时不可用，请稍后重试', en: 'API service temporarily unavailable, please try later' },
};

/**
 * 获取指定语言的提示文本
 * @param {string} key
 * @param {'zh'|'en'} lang
 * @returns {string}
 */
export function statusMsg(key, lang = 'zh') {
  const msg = MESSAGES[key];
  if (!msg) return lang === 'zh' ? '未知状态' : 'Unknown status';
  return msg[lang] || msg.zh;
}
