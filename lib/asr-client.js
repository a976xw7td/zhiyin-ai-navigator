/**
 * ASR Client — Whisper-compatible speech-to-text
 *
 * Supports any OpenAI-format /v1/audio/transcriptions endpoint.
 * Tested providers: SiliconFlow (api.siliconflow.cn)
 *
 * @module asr-client
 */

const DEFAULT_ENDPOINT = 'https://api.siliconflow.cn/v1/audio/transcriptions';

/**
 * @param {string} audioBase64 - base64-encoded audio (without data URI prefix)
 * @param {string} mimeType - e.g. 'audio/webm;codecs=opus' or 'audio/webm'
 * @param {string} apiKey - ASR API key
 * @param {string} [endpoint] - Whisper-compatible endpoint URL
 * @returns {Promise<{text: string}>}
 */
export async function transcribe(audioBase64, mimeType, apiKey, endpoint, modelName) {
  if (!apiKey) throw new Error('ASR_KEY_MISSING');
  if (!audioBase64) throw new Error('ASR_NO_AUDIO');

  // 如果 endpoint 不是合法 URL（比如误填了 API Key），回退到默认
  const url = (endpoint && endpoint.startsWith('http')) ? endpoint : DEFAULT_ENDPOINT;

  // 将 base64 解码为二进制
  const binaryStr = atob(audioBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const ext = mimeType.includes('webm') ? 'webm' : 'ogg';
  const blob = new Blob([bytes], { type: mimeType });

  const form = new FormData();
  form.append('file', blob, `recording.${ext}`);
  form.append('model', modelName || 'FunAudioLLM/SenseVoiceSmall');
  // 明确指定中文语种，提升识别准确率
  form.append('language', 'zh');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.status === 401) throw new Error('ASR_AUTH_ERROR');
    if (res.status === 429) throw new Error('ASR_RATE_LIMIT');
    if (!res.ok) {
      await res.text().catch(() => '');
      throw new Error(`ASR_HTTP_${res.status}`);
    }

    const data = await res.json();

    const text = data.text?.trim();
    if (!text) throw new Error('ASR_EMPTY');

    return { text };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('ASR_TIMEOUT');
    if (e.message?.startsWith('ASR_')) throw e;
    throw new Error('ASR_NETWORK');
  }
}
