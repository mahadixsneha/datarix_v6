const { getDb, runRaw } = require('../lib/db');
const { cors } = require('../lib/auth');
const { safeName } = require('../lib/sanitize');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getDb();
  const action = req.query.action;

  // APP USERS
  if (action === 'appusers') {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const keyRows = await sql`SELECT * FROM tb_api_keys WHERE api_key = ${apiKey}`;
    if (!keyRows.length) return res.status(401).json({ error: 'Invalid API key' });
    const ownerId = keyRows[0].user_id;
    if (req.method === 'GET') {
      const users = await sql`SELECT id, name, email, role, is_banned, metadata, last_login, created_at FROM tb_app_users WHERE owner_id = ${ownerId} ORDER BY created_at DESC`;
      return res.json({ users });
    }
    if (req.method === 'POST') {
      const { act, user_id, role } = req.body || {};
      if (act === 'setrole') { await sql`UPDATE tb_app_users SET role = ${role} WHERE id = ${user_id} AND owner_id = ${ownerId}`; return res.json({ success: true }); }
      if (act === 'ban') { await sql`UPDATE tb_app_users SET is_banned = true WHERE id = ${user_id} AND owner_id = ${ownerId}`; return res.json({ success: true }); }
      if (act === 'unban') { await sql`UPDATE tb_app_users SET is_banned = false WHERE id = ${user_id} AND owner_id = ${ownerId}`; return res.json({ success: true }); }
      if (act === 'delete') { await sql`DELETE FROM tb_app_users WHERE id = ${user_id} AND owner_id = ${ownerId}`; return res.json({ success: true }); }
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // WEBHOOKS
  if (action === 'webhooks') {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const keyRows = await sql`SELECT * FROM tb_api_keys WHERE api_key = ${apiKey}`;
    if (!keyRows.length) return res.status(401).json({ error: 'Invalid API key' });
    const userId = keyRows[0].user_id;
    if (req.method === 'GET') { const hooks = await sql`SELECT * FROM tb_webhooks WHERE user_id = ${userId}`; return res.json({ webhooks: hooks }); }
    if (req.method === 'POST') { const { table_name, url, events } = req.body || {}; await sql`INSERT INTO tb_webhooks (user_id, table_name, url, events) VALUES (${userId}, ${table_name}, ${url}, ${events || 'insert,update,delete'})`; return res.status(201).json({ success: true }); }
    if (req.method === 'DELETE') { const { webhook_id } = req.body || {}; await sql`DELETE FROM tb_webhooks WHERE id = ${webhook_id} AND user_id = ${userId}`; return res.json({ success: true }); }
  }

  // USAGE STATS
  if (action === 'usage') {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const keyRows = await sql`SELECT * FROM tb_api_keys WHERE api_key = ${apiKey}`;
    if (!keyRows.length) return res.status(401).json({ error: 'Invalid API key' });
    const userId = keyRows[0].user_id;
    const stats = await sql`SELECT endpoint, method, COUNT(*) as calls, AVG(response_time) as avg_ms FROM tb_api_usage WHERE user_id = ${userId} GROUP BY endpoint, method ORDER BY calls DESC LIMIT 20`;
    const daily = await sql`SELECT DATE(created_at) as date, COUNT(*) as calls FROM tb_api_usage WHERE user_id = ${userId} AND created_at > NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date`;
    return res.json({ stats, daily });
  }

  // TEMPLATES list (public)
  if (action === 'templates' && req.method === 'GET') {
    const r = await fetch(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/tables?action=templates` : 'http://localhost:3000/api/tables?action=templates');
    return res.json(await r.json());
  }

  // ===== MAIN DATA API =====
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey) return res.status(401).json({ error: 'API key required. Add ?key=dk_xxx or X-Api-Key header.' });
  const keyRows = await sql`SELECT * FROM tb_api_keys WHERE api_key = ${apiKey}`;
  if (!keyRows.length) return res.status(401).json({ error: 'Invalid API key' });
  if (keyRows[0].expires_at && new Date(keyRows[0].expires_at) < new Date()) return res.status(401).json({ error: 'API key expired' });

  const userId = keyRows[0].user_id;
  const permissions = (keyRows[0].permissions || 'read,write').split(',');
  if (['POST','PUT','DELETE'].includes(req.method) && !permissions.includes('write')) return res.status(403).json({ error: 'Read-only API key' });

  await sql`UPDATE tb_api_keys SET last_used = NOW(), use_count = use_count + 1 WHERE api_key = ${apiKey}`;
  const startTime = Date.now();

  const tableName = req.query.table;
  if (!tableName) return res.status(400).json({ error: 'table param required' });

  const tbRows = await sql`SELECT * FROM tb_table_registry WHERE user_id = ${userId} AND table_name = ${tableName}`;
  if (!tbRows.length) return res.status(404).json({ error: 'Table not found' });
  const physName = tbRows[0].physical_name;
  const isCollection = tbRows[0].table_type === 'collection';

  const logUsage = async (status) => {
    try { await sql`INSERT INTO tb_api_usage (user_id, api_key, endpoint, method, status_code, response_time) VALUES (${userId}, ${apiKey}, ${tableName}, ${req.method}, ${status}, ${Date.now() - startTime})`; } catch (e) {}
  };
  const triggerWebhook = async (event, data) => {
    try {
      const hooks = await sql`SELECT * FROM tb_webhooks WHERE user_id = ${userId} AND table_name = ${tableName} AND is_active = true`;
      for (const h of hooks) { if (h.events.includes(event)) fetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, table: tableName, data, timestamp: new Date().toISOString() }) }).catch(() => {}); }
    } catch (e) {}
  };

  try {
    if (req.method === 'GET') {
      const page = parseInt(req.query.page || '1');
      const limit = Math.min(parseInt(req.query.limit || '20'), 100);
      const offset = (page - 1) * limit;
      const sort = req.query.sort ? safeName(req.query.sort) : 'id';
      const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
      const jsonFilter = req.query.json_filter || '';
      const jsonVal = req.query.json_val || '';
      const search = req.query.search || '';

      let where = '', params = [];
      if (isCollection) {
        if (jsonFilter && jsonVal) { where = `WHERE data->>'${safeName(jsonFilter)}' = $1`; params = [jsonVal]; }
        else if (search) { where = `WHERE data::text ILIKE $1`; params = [`%${search}%`]; }
        const rows = await runRaw(`SELECT id, data, created_at, updated_at FROM "${physName}" ${where} ORDER BY id ${dir} LIMIT ${limit} OFFSET ${offset}`, params);
        const cnt = await runRaw(`SELECT COUNT(*) as count FROM "${physName}" ${where}`, params);
        await logUsage(200);
        return res.json({ rows, total: parseInt(cnt[0].count), page, limit, type: 'collection' });
      } else {
        const rows = await runRaw(`SELECT * FROM "${physName}" ORDER BY "${sort}" ${dir} LIMIT ${limit} OFFSET ${offset}`);
        const cnt = await runRaw(`SELECT COUNT(*) as count FROM "${physName}"`);
        await logUsage(200);
        return res.json({ rows, total: parseInt(cnt[0].count), page, limit, type: 'sql' });
      }
    }

    if (req.method === 'POST') {
      if (isCollection) {
        const data = req.body || {};
        const jsonData = JSON.stringify(data);
        const result = await runRaw(`INSERT INTO "${physName}" (data) VALUES ($1) RETURNING *`, [jsonData]);
        await logUsage(201); triggerWebhook('insert', result[0]);
        return res.status(201).json({ row: result[0] });
      } else {
        const data = req.body || {};
        const entries = Object.entries(data).filter(([k]) => k !== 'id');
        if (!entries.length) return res.status(400).json({ error: 'No data' });
        const keys = entries.map(([k]) => `"${safeName(k)}"`).join(', ');
        const vals = entries.map(([, v]) => v === '' ? null : v);
        const phs = vals.map((_, i) => `$${i + 1}`).join(', ');
        const result = await runRaw(`INSERT INTO "${physName}" (${keys}) VALUES (${phs}) RETURNING *`, vals);
        await logUsage(201); triggerWebhook('insert', result[0]);
        return res.status(201).json({ row: result[0] });
      }
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'id required' });
      if (isCollection) {
        const { data, merge = true } = body;
        const jsonData = JSON.stringify(data || body);
        const q = merge ? `UPDATE "${physName}" SET data = data || $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *` : `UPDATE "${physName}" SET data = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *`;
        const result = await runRaw(q, [jsonData, id]);
        await logUsage(200); triggerWebhook('update', result[0]);
        return res.json({ row: result[0] });
      } else {
        const entries = Object.entries(body).filter(([k]) => k !== 'id');
        if (!entries.length) return res.status(400).json({ error: 'No data' });
        const sets = entries.map(([k], i) => `"${safeName(k)}" = $${i + 1}`).join(', ');
        const vals = [...entries.map(([, v]) => v === '' ? null : v), id];
        const result = await runRaw(`UPDATE "${physName}" SET ${sets} WHERE id = $${vals.length} RETURNING *`, vals);
        await logUsage(200); triggerWebhook('update', result[0]);
        return res.json({ row: result[0] });
      }
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || (req.body || {}).id;
      if (!id) return res.status(400).json({ error: 'id required' });
      await runRaw(`DELETE FROM "${physName}" WHERE id = $1`, [id]);
      await logUsage(200); triggerWebhook('delete', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    await logUsage(500);
    return res.status(500).json({ error: e.message });
  }
};
