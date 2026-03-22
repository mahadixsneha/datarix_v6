const { getDb } = require('../lib/db');
const { requireAuth, cors } = require('../lib/auth');
const { checkLimit } = require('../lib/plan');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireAuth(req, res); if (!user) return;
  const sql = getDb();

  // LIST
  if (req.method === 'GET') {
    try {
      const keys = await sql`SELECT id, api_key, name, permissions, expires_at, last_used, use_count, created_at FROM tb_api_keys WHERE user_id = ${user.id} ORDER BY created_at DESC`;
      return res.json({ keys });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // CREATE
  if (req.method === 'POST') {
    const limit = await checkLimit(user.id, 'api_keys');
    if (!limit.allowed) return res.status(400).json({ error: limit.message });
    const { name, permissions, expires_days } = req.body || {};
    try {
      const rawKey = 'dk_' + crypto.randomBytes(24).toString('hex');
      const expiresAt = expires_days ? new Date(Date.now() + parseInt(expires_days) * 86400000).toISOString() : null;
      const rows = await sql`
        INSERT INTO tb_api_keys (user_id, api_key, name, permissions, expires_at)
        VALUES (${user.id}, ${rawKey}, ${name || 'API Key'}, ${permissions || 'read,write'}, ${expiresAt})
        RETURNING *
      `;
      return res.status(201).json({ key: rows[0] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // DELETE
  if (req.method === 'DELETE') {
    const { key_id } = req.body || {};
    try {
      await sql`DELETE FROM tb_api_keys WHERE id = ${key_id} AND user_id = ${user.id}`;
      return res.json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ROTATE (regenerate key value)
  if (req.method === 'PATCH') {
    const { key_id } = req.body || {};
    try {
      const newKey = 'dk_' + crypto.randomBytes(24).toString('hex');
      await sql`UPDATE tb_api_keys SET api_key = ${newKey} WHERE id = ${key_id} AND user_id = ${user.id}`;
      return res.json({ success: true, new_key: newKey });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
