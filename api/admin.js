const { getDb, runRaw } = require('../lib/db');
const { requireAdmin, cors } = require('../lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;
  const sql = getDb();

  // PUBLIC: settings GET
  if (req.method === 'GET' && action === 'settings') {
    try {
      const rows = await sql`SELECT key, value FROM tb_settings`;
      const obj = {};
      rows.forEach(r => obj[r.key] = r.value);
      return res.json(obj);
    } catch (e) { return res.json({}); }
  }

  // PUBLIC: plans GET
  if (req.method === 'GET' && action === 'plans') {
    try {
      const plans = await sql`SELECT * FROM tb_plans WHERE is_active = true ORDER BY price ASC`;
      return res.json({ plans });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  const admin = requireAdmin(req, res); if (!admin) return;

  // STATS
  if (req.method === 'GET' && action === 'stats') {
    try {
      const [users] = await sql`SELECT COUNT(*) as count FROM tb_users`;
      const [tables] = await sql`SELECT COUNT(*) as count FROM tb_table_registry`;
      const [banned] = await sql`SELECT COUNT(*) as count FROM tb_users WHERE is_banned = true`;
      const [admins] = await sql`SELECT COUNT(*) as count FROM tb_users WHERE is_admin = true`;
      const [apikeys] = await sql`SELECT COUNT(*) as count FROM tb_api_keys`;
      const [appusers] = await sql`SELECT COUNT(*) as count FROM tb_app_users`;
      const planCounts = await sql`SELECT plan, COUNT(*) as count FROM tb_users GROUP BY plan`;
      const recent = await sql`SELECT id, name, email, plan, created_at FROM tb_users ORDER BY created_at DESC LIMIT 8`;
      const activity = await sql`SELECT a.action, a.details, a.created_at, u.name FROM tb_activity a LEFT JOIN tb_users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 10`;
      return res.json({
        total_users: parseInt(users.count),
        total_tables: parseInt(tables.count),
        banned_users: parseInt(banned.count),
        admin_users: parseInt(admins.count),
        total_api_keys: parseInt(apikeys.count),
        total_app_users: parseInt(appusers.count),
        plan_counts: planCounts,
        recent_users: recent,
        recent_activity: activity
      });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // USERS LIST
  if (req.method === 'GET' && action === 'users') {
    try {
      const page = parseInt(req.query.page || '1');
      const search = req.query.search || '';
      const offset = (page - 1) * 20;
      const s = `%${search}%`;
      const users = await sql`
        SELECT u.id, u.name, u.email, u.plan, u.is_admin, u.is_banned, u.created_at, u.last_login,
          COUNT(DISTINCT t.id) as table_count, COUNT(DISTINCT k.id) as key_count
        FROM tb_users u
        LEFT JOIN tb_table_registry t ON t.user_id = u.id
        LEFT JOIN tb_api_keys k ON k.user_id = u.id
        WHERE u.name ILIKE ${s} OR u.email ILIKE ${s}
        GROUP BY u.id ORDER BY u.created_at DESC
        LIMIT 20 OFFSET ${offset}
      `;
      const [{ count }] = await sql`SELECT COUNT(*) as count FROM tb_users WHERE name ILIKE ${s} OR email ILIKE ${s}`;
      return res.json({ users, total: parseInt(count) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // USER ACTION
  if (req.method === 'POST' && action === 'users') {
    const { act, user_id, plan, reason } = req.body || {};
    try {
      if (act === 'ban') { await sql`UPDATE tb_users SET is_banned = true WHERE id = ${user_id}`; return res.json({ success: true }); }
      if (act === 'unban') { await sql`UPDATE tb_users SET is_banned = false WHERE id = ${user_id}`; return res.json({ success: true }); }
      if (act === 'make_admin') { await sql`UPDATE tb_users SET is_admin = true WHERE id = ${user_id}`; return res.json({ success: true }); }
      if (act === 'remove_admin') { await sql`UPDATE tb_users SET is_admin = false WHERE id = ${user_id}`; return res.json({ success: true }); }
      if (act === 'set_plan') { await sql`UPDATE tb_users SET plan = ${plan} WHERE id = ${user_id}`; return res.json({ success: true }); }
      if (act === 'delete') {
        const tables = await sql`SELECT physical_name FROM tb_table_registry WHERE user_id = ${user_id}`;
        for (const t of tables) { try { await runRaw(`DROP TABLE IF EXISTS "${t.physical_name}"`); } catch (e) {} }
        await sql`DELETE FROM tb_table_registry WHERE user_id = ${user_id}`;
        await sql`DELETE FROM tb_api_keys WHERE user_id = ${user_id}`;
        await sql`DELETE FROM tb_app_users WHERE owner_id = ${user_id}`;
        await sql`DELETE FROM tb_users WHERE id = ${user_id}`;
        return res.json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // SETTINGS SAVE
  if (req.method === 'POST' && action === 'settings') {
    const { settings } = req.body || {};
    try {
      for (const [key, value] of Object.entries(settings || {})) {
        await sql`INSERT INTO tb_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = ${value}`;
      }
      return res.json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // PLANS MANAGEMENT
  if (req.method === 'GET' && action === 'allplans') {
    try {
      const plans = await sql`SELECT * FROM tb_plans ORDER BY price ASC`;
      return res.json({ plans });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'POST' && action === 'plans') {
    const { act, plan } = req.body || {};
    try {
      if (act === 'update') {
        await sql`
          UPDATE tb_plans SET
            price = ${plan.price}, max_tables = ${plan.max_tables},
            max_rows_per_table = ${plan.max_rows_per_table}, max_api_keys = ${plan.max_api_keys},
            max_app_users = ${plan.max_app_users}, csv_export = ${plan.csv_export},
            csv_import = ${plan.csv_import}, webhooks = ${plan.webhooks},
            is_active = ${plan.is_active}
          WHERE name = ${plan.name}
        `;
        return res.json({ success: true });
      }
      if (act === 'create') {
        await sql`
          INSERT INTO tb_plans (name, price, max_tables, max_rows_per_table, max_api_keys, max_app_users, csv_export, csv_import, webhooks, custom_domain)
          VALUES (${plan.name}, ${plan.price}, ${plan.max_tables}, ${plan.max_rows_per_table}, ${plan.max_api_keys}, ${plan.max_app_users}, ${plan.csv_export||false}, ${plan.csv_import||false}, ${plan.webhooks||false}, ${plan.custom_domain||false})
        `;
        return res.json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown act' });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // BROADCAST EMAIL
  if (req.method === 'POST' && action === 'broadcast') {
    const { subject, message, plan_filter } = req.body || {};
    if (!subject || !message) return res.status(400).json({ error: 'subject and message required' });
    try {
      const resendKey = (await sql`SELECT value FROM tb_settings WHERE key = 'resend_api_key'`)[0]?.value;
      const fromEmail = (await sql`SELECT value FROM tb_settings WHERE key = 'smtp_from'`)[0]?.value || 'noreply@datarix.app';
      if (!resendKey) return res.status(400).json({ error: 'Resend API key not configured in settings' });
      let users;
      if (plan_filter && plan_filter !== 'all') {
        users = await sql`SELECT email, name FROM tb_users WHERE plan = ${plan_filter} AND is_banned = false`;
      } else {
        users = await sql`SELECT email, name FROM tb_users WHERE is_banned = false`;
      }
      let sent = 0;
      for (const u of users) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: fromEmail, to: u.email, subject, html: `<p>Hi ${u.name},</p><p>${message}</p>` })
          });
          sent++;
        } catch (e) {}
      }
      return res.json({ success: true, sent, total: users.length });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ACTIVITY LOG
  if (req.method === 'GET' && action === 'activity') {
    try {
      const page = parseInt(req.query.page || '1');
      const offset = (page - 1) * 30;
      const logs = await sql`
        SELECT a.*, u.name as user_name, u.email as user_email
        FROM tb_activity a LEFT JOIN tb_users u ON u.id = a.user_id
        ORDER BY a.created_at DESC LIMIT 30 OFFSET ${offset}
      `;
      const [{ count }] = await sql`SELECT COUNT(*) as count FROM tb_activity`;
      return res.json({ logs, total: parseInt(count) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // APP USERS LIST (admin view)
  if (req.method === 'GET' && action === 'appusers') {
    try {
      const appusers = await sql`
        SELECT a.*, u.name as owner_name, u.email as owner_email
        FROM tb_app_users a LEFT JOIN tb_users u ON u.id = a.owner_id
        ORDER BY a.created_at DESC LIMIT 50
      `;
      return res.json({ appusers });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
