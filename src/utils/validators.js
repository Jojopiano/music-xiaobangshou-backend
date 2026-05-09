/**
 * 輸入驗證工具
 */

const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

const isNonEmptyString = (str) => {
  return typeof str === 'string' && str.trim().length > 0;
};

const isPositiveInteger = (num) => {
  return Number.isInteger(Number(num)) && Number(num) > 0;
};

const isValidDate = (dateStr) => {
  const d = new Date(dateStr);
  return d instanceof Date && !isNaN(d) && /\d{4}-\d{2}-\d{2}/.test(dateStr);
};

const isValidTime = (timeStr) => {
  return /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.test(timeStr);
};

const isValidRole = (role) => {
  return ['teacher', 'student', 'admin'].includes(role);
};

const isValidProvider = (provider) => {
  return ['apple', 'google'].includes(provider);
};

module.exports = {
  isValidEmail,
  isNonEmptyString,
  isPositiveInteger,
  isValidDate,
  isValidTime,
  isValidRole,
  isValidProvider,
};
