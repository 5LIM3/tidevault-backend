const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'dev-admin-secret-change-me';

function getBearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireAuth(req, res, next) {
  const token = getBearer(req);
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  const token = getBearer(req);
  if (!token) return res.status(401).json({ error: 'Missing admin token' });
  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    if (!payload.admin) throw new Error('not admin');
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

module.exports = { requireAuth, requireAdmin, JWT_SECRET, ADMIN_JWT_SECRET };
