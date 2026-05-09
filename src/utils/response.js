/**
 * 統一 API 回應格式
 * { success: boolean, data?: any, error?: string }
 */

const success = (data = null) => ({
  success: true,
  data,
});

const error = (message, code = null) => ({
  success: false,
  error: message,
  ...(code && { code }),
});

module.exports = { success, error };
