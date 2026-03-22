function safeName(name) {
  return (name || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);
}
function userTableName(userId, tableName) {
  return `u${userId}_${safeName(tableName)}`;
}
const ALLOWED_TYPES = ['TEXT','INTEGER','REAL','BOOLEAN','DATE','TIMESTAMP','SERIAL','BIGINT','NUMERIC','VARCHAR'];
function safeType(t) {
  const up = (t || 'TEXT').toUpperCase();
  return ALLOWED_TYPES.includes(up) ? up : 'TEXT';
}
module.exports = { safeName, userTableName, safeType };
