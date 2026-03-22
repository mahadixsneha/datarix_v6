const { getDb, runRaw } = require('../lib/db');
const { requireAuth, cors } = require('../lib/auth');
const { safeName } = require('../lib/sanitize');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireAuth(req, res); if (!user) return;
  const sql = getDb();

  const tableName = req.query.table || (req.body || {}).table;
  if (!tableName) return res.status(400).json({ error: 'table required' });
  const tbRows = await sql`SELECT * FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${tableName}`;
  if (!tbRows.length) return res.status(404).json({ error: 'Table not found' });
  const physName = tbRows[0].physical_name;
  const isCollection = tbRows[0].table_type === 'collection';

  // ===== COLLECTION MODE (MongoDB-style) =====
  if (isCollection) {

    // GET — list documents
    if (req.method === 'GET') {
      try {
        const page = parseInt(req.query.page || '1');
        const limit = Math.min(parseInt(req.query.limit || '20'), 500);
        const offset = (page - 1) * limit;
        const sort = req.query.sort === 'asc' ? 'ASC' : 'DESC';
        const search = req.query.search || '';
        const jsonFilter = req.query.json_filter || '';
        const jsonVal = req.query.json_val || '';

        let where = '';
        let params = [];
        if (jsonFilter && jsonVal) {
          where = `WHERE data->>'${safeName(jsonFilter)}' = $1`;
          params = [jsonVal];
        } else if (search) {
          where = `WHERE data::text ILIKE $1`;
          params = [`%${search}%`];
        }

        const docs = await runRaw(`SELECT id, data, created_at, updated_at FROM "${physName}" ${where} ORDER BY id ${sort} LIMIT ${limit} OFFSET ${offset}`, params);
        const cnt = await runRaw(`SELECT COUNT(*) as count FROM "${physName}" ${where}`, params);
        return res.json({ rows: docs, total: parseInt(cnt[0].count), page, limit, type: 'collection' });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // POST — insert document
    if (req.method === 'POST') {
      try {
        const { data } = req.body || {};
        if (!data) return res.status(400).json({ error: 'data required' });
        const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
        const result = await runRaw(`INSERT INTO "${physName}" (data) VALUES ($1) RETURNING *`, [jsonData]);
        return res.status(201).json({ row: result[0] });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // PUT — update document
    if (req.method === 'PUT') {
      try {
        const { id, data, merge = true } = req.body || {};
        if (!id || !data) return res.status(400).json({ error: 'id and data required' });
        const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
        let updateSQL;
        if (merge) {
          // Merge with existing data (like MongoDB $set)
          updateSQL = `UPDATE "${physName}" SET data = data || $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *`;
        } else {
          // Replace entire document
          updateSQL = `UPDATE "${physName}" SET data = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *`;
        }
        const result = await runRaw(updateSQL, [jsonData, id]);
        return res.json({ row: result[0] });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // DELETE
    if (req.method === 'DELETE') {
      try {
        const id = req.query.id || (req.body || {}).id;
        const ids = (req.body || {}).ids;
        if (ids && Array.isArray(ids)) {
          const safeIds = ids.map(i => parseInt(i)).filter(i => !isNaN(i));
          await runRaw(`DELETE FROM "${physName}" WHERE id = ANY($1)`, [safeIds]);
          return res.json({ success: true, deleted: safeIds.length });
        }
        if (!id) return res.status(400).json({ error: 'id required' });
        await runRaw(`DELETE FROM "${physName}" WHERE id = $1`, [id]);
        return res.json({ success: true });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }
  }

  // ===== SQL TABLE MODE =====

  // GET — list rows with filter + sort
  if (req.method === 'GET') {
    try {
      const page = parseInt(req.query.page || '1');
      const limit = Math.min(parseInt(req.query.limit || '20'), 500);
      const offset = (page - 1) * limit;
      const sortCol = req.query.sort ? safeName(req.query.sort) : 'id';
      const sortDir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
      const search = req.query.search || '';
      const filterCol = req.query.filter_col ? safeName(req.query.filter_col) : '';
      const filterVal = req.query.filter_val || '';
      const filterOp = ['=','!=','>','<','>=','<=','ILIKE'].includes(req.query.filter_op) ? req.query.filter_op : '=';

      let whereClause = '', queryParams = [];
      if (filterCol && filterVal) {
        whereClause = `WHERE "${filterCol}" ${filterOp} $1`;
        queryParams = [filterOp === 'ILIKE' ? `%${filterVal}%` : filterVal];
      } else if (search) {
        const textCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${physName} AND data_type IN ('text','character varying')`;
        if (textCols.length) {
          whereClause = `WHERE ${textCols.map(c => `"${c.column_name}"::text ILIKE $1`).join(' OR ')}`;
          queryParams = [`%${search}%`];
        }
      }

      const rows = await runRaw(`SELECT * FROM "${physName}" ${whereClause} ORDER BY "${sortCol}" ${sortDir} LIMIT ${limit} OFFSET ${offset}`, queryParams);
      const cnt = await runRaw(`SELECT COUNT(*) as count FROM "${physName}" ${whereClause}`, queryParams);
      const cols = await sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = ${physName} ORDER BY ordinal_position`;
      return res.json({ rows, total: parseInt(cnt[0].count), cols, page, limit, type: 'sql' });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // POST — insert row
  if (req.method === 'POST') {
    try {
      const { data } = req.body || {};
      if (!data) return res.status(400).json({ error: 'data required' });
      const entries = Object.entries(data).filter(([k]) => k !== 'id');
      if (!entries.length) return res.status(400).json({ error: 'No data provided' });
      const keys = entries.map(([k]) => `"${safeName(k)}"`).join(', ');
      const vals = entries.map(([, v]) => v === '' ? null : v);
      const phs = vals.map((_, i) => `$${i + 1}`).join(', ');
      const result = await runRaw(`INSERT INTO "${physName}" (${keys}) VALUES (${phs}) RETURNING *`, vals);
      return res.status(201).json({ row: result[0] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // PUT — update row
  if (req.method === 'PUT') {
    try {
      const { id, data } = req.body || {};
      if (!id || !data) return res.status(400).json({ error: 'id and data required' });
      const entries = Object.entries(data).filter(([k]) => k !== 'id');
      if (!entries.length) return res.status(400).json({ error: 'No data' });
      const sets = entries.map(([k], i) => `"${safeName(k)}" = $${i + 1}`).join(', ');
      const vals = [...entries.map(([, v]) => v === '' ? null : v), id];
      const result = await runRaw(`UPDATE "${physName}" SET ${sets} WHERE id = $${vals.length} RETURNING *`, vals);
      return res.json({ row: result[0] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // DELETE
  if (req.method === 'DELETE') {
    try {
      const id = req.query.id || (req.body || {}).id;
      const ids = (req.body || {}).ids;
      if (ids && Array.isArray(ids)) {
        const safeIds = ids.map(i => parseInt(i)).filter(i => !isNaN(i));
        await runRaw(`DELETE FROM "${physName}" WHERE id = ANY($1)`, [safeIds]);
        return res.json({ success: true, deleted: safeIds.length });
      }
      if (!id) return res.status(400).json({ error: 'id required' });
      await runRaw(`DELETE FROM "${physName}" WHERE id = $1`, [id]);
      return res.json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
