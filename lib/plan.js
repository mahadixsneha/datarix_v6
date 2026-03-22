const { getDb } = require('./db');

async function getPlan(planName) {
  const sql = getDb();
  const rows = await sql`SELECT * FROM tb_plans WHERE name = ${planName || 'free'}`;
  return rows[0] || { max_tables: 10, max_rows_per_table: 1000, max_api_keys: 1, max_app_users: 100, csv_export: false, csv_import: false, webhooks: false };
}

async function getUserPlan(userId) {
  const sql = getDb();
  const rows = await sql`SELECT plan FROM tb_users WHERE id = ${userId}`;
  return rows[0]?.plan || 'free';
}

async function checkLimit(userId, type) {
  const sql = getDb();
  const planName = await getUserPlan(userId);
  const plan = await getPlan(planName);
  if (type === 'tables') {
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM tb_table_registry WHERE user_id = ${userId}`;
    if (parseInt(count) >= plan.max_tables) return { allowed: false, message: `Plan limit: max ${plan.max_tables} tables. Upgrade to add more.` };
  }
  if (type === 'api_keys') {
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM tb_api_keys WHERE user_id = ${userId}`;
    if (parseInt(count) >= plan.max_api_keys) return { allowed: false, message: `Plan limit: max ${plan.max_api_keys} API keys.` };
  }
  if (type === 'app_users') {
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM tb_app_users WHERE owner_id = ${userId}`;
    if (parseInt(count) >= plan.max_app_users) return { allowed: false, message: `Plan limit: max ${plan.max_app_users} app users.` };
  }
  return { allowed: true, plan };
}

module.exports = { getPlan, getUserPlan, checkLimit };
