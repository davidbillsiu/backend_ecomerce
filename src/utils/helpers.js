const slugify = (t) =>
  String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const pick = (obj, keys) => keys.reduce((a, k) => (obj[k] !== undefined ? { ...a, [k]: obj[k] } : a), {});
const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const sanitizeUser = (u) => { const j = u.toJSON ? u.toJSON() : { ...u }; delete j.senha_hash; return j; };

module.exports = { slugify, pick, num, round2, emailValido, asyncH, HttpError, sanitizeUser };
