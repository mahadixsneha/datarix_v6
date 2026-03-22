const { neon } = require('@neondatabase/serverless');
let _sql = null;
function getDb() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}
async function runRaw(query, params = []) {
  const sql = getDb();
  return params.length > 0 ? await sql(query, params) : await sql(query);
}
module.exports = { getDb, runRaw };
