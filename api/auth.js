const { getDb } = require('../lib/db');
const { signToken, cors } = require('../lib/auth');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = req.query.action;
  const sql = getDb();

  // LOGIN
  if (req.method === 'POST' && action === 'login') {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    try {
      const rows = await sql`SELECT * FROM tb_users WHERE email = ${email.toLowerCase()}`;
      const user = rows[0];
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });
      if (user.is_banned) return res.status(403).json({ error: 'Account suspended. Contact support.' });
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });
      await sql`UPDATE tb_users SET last_login = NOW() WHERE id = ${user.id}`;
      await sql`INSERT INTO tb_activity (user_id, action, details) VALUES (${user.id}, 'login', 'User logged in')`;
      const token = signToken({ id: user.id, email: user.email, is_admin: user.is_admin, plan: user.plan });
      return res.json({ token, user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin, plan: user.plan, avatar: user.avatar } });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // REGISTER
  if (req.method === 'POST' && action === 'register') {
    const settings = await sql`SELECT value FROM tb_settings WHERE key = 'allow_register'`;
    if (settings[0]?.value === 'false') return res.status(403).json({ error: 'Registration is currently closed.' });
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    try {
      const existing = await sql`SELECT id FROM tb_users WHERE email = ${email.toLowerCase()}`;
      if (existing.length) return res.status(409).json({ error: 'Email already registered' });
      const hash = await bcrypt.hash(password, 10);
      const defaultPlan = await sql`SELECT value FROM tb_settings WHERE key = 'default_plan'`;
      const plan = defaultPlan[0]?.value || 'free';
      const rows = await sql`INSERT INTO tb_users (name, email, password, plan) VALUES (${name}, ${email.toLowerCase()}, ${hash}, ${plan}) RETURNING id, name, email, is_admin, plan`;
      const user = rows[0];
      await sql`INSERT INTO tb_activity (user_id, action, details) VALUES (${user.id}, 'register', 'New account created')`;
      const token = signToken({ id: user.id, email: user.email, is_admin: user.is_admin, plan: user.plan });
      return res.status(201).json({ token, user });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // FORGOT PASSWORD
  if (req.method === 'POST' && action === 'forgot') {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required' });
    try {
      const rows = await sql`SELECT id FROM tb_users WHERE email = ${email.toLowerCase()}`;
      if (!rows.length) return res.json({ success: true }); // Don't reveal if email exists
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 3600000); // 1 hour
      await sql`UPDATE tb_users SET reset_token = ${token}, reset_expires = ${expires.toISOString()} WHERE email = ${email.toLowerCase()}`;
      const siteUrl = (await sql`SELECT value FROM tb_settings WHERE key = 'site_url'`)[0]?.value || '';
      const resetLink = `${siteUrl}?reset=${token}`;
      // Try to send email via Resend
      try {
        const resendKey = (await sql`SELECT value FROM tb_settings WHERE key = 'resend_api_key'`)[0]?.value;
        const fromEmail = (await sql`SELECT value FROM tb_settings WHERE key = 'smtp_from'`)[0]?.value || 'noreply@datarix.app';
        if (resendKey) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: fromEmail, to: email, subject: 'Password Reset - Datarix', html: `<p>Click <a href="${resetLink}">here</a> to reset your password. Link expires in 1 hour.</p>` })
          });
        }
      } catch (e) {}
      return res.json({ success: true, reset_link: resetLink });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // RESET PASSWORD
  if (req.method === 'POST' && action === 'reset') {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    try {
      const rows = await sql`SELECT * FROM tb_users WHERE reset_token = ${token} AND reset_expires > NOW()`;
      if (!rows.length) return res.status(400).json({ error: 'Invalid or expired reset token' });
      const hash = await bcrypt.hash(password, 10);
      await sql`UPDATE tb_users SET password = ${hash}, reset_token = NULL, reset_expires = NULL WHERE id = ${rows[0].id}`;
      return res.json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // GET PROFILE
  if (req.method === 'GET' && action === 'profile') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'datarix_secret');
      const rows = await sql`SELECT id, name, email, plan, is_admin, avatar, created_at, last_login FROM tb_users WHERE id = ${decoded.id}`;
      if (!rows.length) return res.status(404).json({ error: 'User not found' });
      return res.json({ user: rows[0] });
    } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
  }

  // UPDATE PROFILE
  if (req.method === 'PUT' && action === 'profile') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'datarix_secret');
      const { name, avatar } = req.body || {};
      await sql`UPDATE tb_users SET name = COALESCE(${name}, name), avatar = COALESCE(${avatar}, avatar) WHERE id = ${decoded.id}`;
      return res.json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // APP USERS — Register
  if (req.method === 'POST' && action === 'appregister') {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const keyRows = await sql`SELECT * FROM tb_api_keys WHERE api_key = ${apiKey}`;
    if (!keyRows.length) return res.status(401).json({ error: 'Invalid API key' });
    const ownerId = keyRows[0].user_id;
    const { name, email, password, role, metadata } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
    try {
      const existing = await sql`SELECT id FROM tb_app_users WHERE owner_id = ${ownerId} AND email = ${email.toLowerCase()}`;
      if (existing.length) return res.status(409).json({ error: 'Email already registered' });
      const hash = await bcrypt.hash(password, 10);
      const rows = await sql`INSERT INTO tb_app_users (owner_id, api_key, name, email, password, role, metadata) VALUES (${ownerId}, ${apiKey}, ${name}, ${email.toLowerCase()}, ${hash}, ${role||'user'}, ${JSON.stringify(metadata||{})}) RETURNING id, name, email, role, created_at`;
      const appToken = signToken({ app_user_id: rows[0].id, owner_id: ownerId, email: rows[0].email, role: rows[0].role }, '30d');
      return res.status(201).json({ token: appToken, user: rows[0] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // APP USERS — Login
  if (req.method === 'POST' && action === 'applogin') {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const keyRows = await sql`SELECT * FROM tb_api_keys WHERE api_key = ${apiKey}`;
    if (!keyRows.length) return res.status(401).json({ error: 'Invalid API key' });
    const ownerId = keyRows[0].user_id;
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    try {
      const rows = await sql`SELECT * FROM tb_app_users WHERE owner_id = ${ownerId} AND email = ${email.toLowerCase()}`;
      if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
      if (rows[0].is_banned) return res.status(403).json({ error: 'Account suspended' });
      const match = await bcrypt.compare(password, rows[0].password);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });
      await sql`UPDATE tb_app_users SET last_login = NOW() WHERE id = ${rows[0].id}`;
      const appToken = signToken({ app_user_id: rows[0].id, owner_id: ownerId, email: rows[0].email, role: rows[0].role }, '30d');
      return res.json({ token: appToken, user: { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role, metadata: rows[0].metadata } });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
