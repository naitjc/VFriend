function normalizeModelSettings(settings = {}, { requireModel = true } = {}) {
  const apiURL = String(settings.apiURL || '').trim().replace(/\/+$/, '');
  const apiKey = String(settings.apiKey || '').trim();
  const model = String(settings.model || '').trim();
  if (apiURL.length > 2048 || apiKey.length > 4096 || model.length > 200) throw new Error('模型配置内容过长');
  let url;
  try { url = new URL(apiURL); } catch { throw new Error('API 地址不是有效 URL'); }
  if (url.protocol !== 'https:') throw new Error('API 地址必须使用 https://，避免密钥明文传输');
  if (!apiKey) throw new Error('API Key 不能为空');
  if (requireModel && !model) throw new Error('模型名称不能为空');
  return requireModel ? { apiURL, apiKey, model } : { apiURL, apiKey };
}
module.exports = { normalizeModelSettings };
