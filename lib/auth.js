const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'datarix_secret';

function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, SECRET, { expiresIn });
}
function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, SECRET); } catch { return null; }
}
function requireAuth(req, res) {
  const user = verifyToken(req);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  return user;
}
function requireAdmin(req, res) {
  const user = verifyToken(req);
  if (!user || !user.is_admin) { res.status(403).json({ error: 'Admin only' }); return null; }
  return user;
}
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Api-Key');
}
module.exports = { signToken, verifyToken, requireAuth, requireAdmin, cors };
