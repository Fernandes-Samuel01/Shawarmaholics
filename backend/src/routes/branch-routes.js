const VALID_TYPES = new Set(['OUTLET', 'FRANCHISE']);

function textValue(value, required, max) {
  if (value == null) return required ? null : null;
  if (typeof value !== 'string') return undefined;
  const valueTrimmed = value.trim();
  if (!valueTrimmed && required) return null;
  return valueTrimmed ? valueTrimmed.slice(0, max) : null;
}

function parseBranch(body, partial = false) {
  const input = body || {};
  const allowed = ['code','name','type','address','city','state','country','postal_code','timezone'];
  if (Object.keys(input).some(key => !allowed.includes(key))) return { error: 'Request contains unsupported branch fields' };
  const out = {};
  if (!partial || 'code' in input) {
    const code = textValue(input.code, true, 32);
    if (!code || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/i.test(code)) return { error: 'Branch code must be 3-32 characters using letters, numbers, hyphens or underscores' };
    out.code = code.toUpperCase();
  }
  if (!partial || 'name' in input) {
    const name = textValue(input.name, true, 100);
    if (!name) return { error: 'Branch name is required' };
    out.name = name;
  }
  if (!partial || 'type' in input) {
    const type = textValue(input.type, true, 20);
    if (!type || !VALID_TYPES.has(type.toUpperCase())) return { error: 'Branch type must be OUTLET or FRANCHISE' };
    out.type = type.toUpperCase();
  }
  if (!partial || 'city' in input) {
    const city = textValue(input.city, true, 100);
    if (!city) return { error: 'City is required' };
    out.city = city;
  }
  for (const field of ['address','state','country','postal_code']) {
    if (!partial || field in input) {
      const value = textValue(input[field], false, field === 'address' ? 250 : 100);
      if (value === undefined) return { error: field + ' must be text' };
      out[field] = value;
    }
  }
  if (!partial || 'timezone' in input) {
    const timezone = textValue(input.timezone, true, 80);
    if (!timezone) return { error: 'Timezone is required' };
    try { Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { return { error: 'Invalid IANA timezone' }; }
    out.timezone = timezone;
  }
  if (!partial && out.country == null) out.country = 'India';
  return { value: out };
}

module.exports = function registerBranchRoutes(app, { query, db }) {
  app.get('/api/admin/branches', async (req, res) => {
    try {
      const { rows } = await query('SELECT id,code,name,type,address,city,state,country,postal_code,timezone,is_active,created_at,updated_at FROM branches ORDER BY is_active DESC,name ASC,id ASC');
      res.json({ branches: rows });
    } catch { res.status(500).json({ message: 'Unable to load branch management data' }); }
  });

  app.get('/api/admin/branches/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid branch ID' });
    try {
      const { rows } = await query('SELECT id,code,name,type,address,city,state,country,postal_code,timezone,is_active,created_at,updated_at FROM branches WHERE id=$1',[id]);
      if (!rows[0]) return res.status(404).json({ message: 'Branch not found' });
      res.json({ branch: rows[0] });
    } catch { res.status(500).json({ message: 'Unable to load branch' }); }
  });

  app.post('/api/admin/branches', async (req, res) => {
    const parsed = parseBranch(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const b = parsed.value;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [duplicate] } = await client.query('SELECT id FROM branches WHERE upper(code)=upper($1) FOR UPDATE',[b.code]);
      if (duplicate) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'A branch with this code already exists' }); }
      const { rows: [created] } = await client.query('INSERT INTO branches(code,name,type,address,city,state,country,postal_code,timezone,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING id,code,name,type,address,city,state,country,postal_code,timezone,is_active,created_at,updated_at',[b.code,b.name,b.type,b.address,b.city,b.state,b.country,b.postal_code,b.timezone]);
      await client.query('COMMIT');
      res.status(201).json({ message: 'Branch created successfully', branch: created });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      res.status(e.code === '23505' ? 409 : 500).json({ message: e.code === '23505' ? 'A branch with this code already exists' : 'Unable to create branch' });
    } finally { client.release(); }
  });

  app.patch('/api/admin/branches/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid branch ID' });
    const parsed = parseBranch(req.body, true);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const fields = Object.keys(parsed.value);
    if (!fields.length) return res.status(400).json({ message: 'At least one branch field is required' });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [existing] } = await client.query('SELECT id FROM branches WHERE id=$1 FOR UPDATE',[id]);
      if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Branch not found' }); }
      if (parsed.value.code) {
        const { rows: [duplicate] } = await client.query('SELECT id FROM branches WHERE upper(code)=upper($1) AND id<>$2',[parsed.value.code,id]);
        if (duplicate) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'A branch with this code already exists' }); }
      }
      const values = fields.map(f => parsed.value[f]);
      const assignments = fields.map((f,i) => f + '=$' + (i+1)).join(',');
      const { rows: [updated] } = await client.query(`UPDATE branches SET ${assignments},updated_at=NOW() WHERE id=$${values.length+1} RETURNING id,code,name,type,address,city,state,country,postal_code,timezone,is_active,created_at,updated_at`,[...values,id]);
      await client.query('COMMIT');
      res.json({ message: 'Branch updated successfully', branch: updated });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      res.status(e.code === '23505' ? 409 : 500).json({ message: e.code === '23505' ? 'A branch with this code already exists' : 'Unable to update branch' });
    } finally { client.release(); }
  });

  async function status(req,res,isActive) {
    const id=Number(req.params.id);
    if (!Number.isInteger(id)||id<1) return res.status(400).json({message:'Invalid branch ID'});
    try {
      const {rows:[branch]}=await query('UPDATE branches SET is_active=$1,updated_at=NOW() WHERE id=$2 RETURNING id,code,name,type,address,city,state,country,postal_code,timezone,is_active,created_at,updated_at',[isActive,id]);
      if(!branch) return res.status(404).json({message:'Branch not found'});
      res.json({message:isActive?'Branch activated successfully':'Branch deactivated successfully',branch});
    } catch { res.status(500).json({message:'Unable to update branch status'}); }
  }
  app.patch('/api/admin/branches/:id/activate',(req,res)=>status(req,res,true));
  app.patch('/api/admin/branches/:id/deactivate',(req,res)=>status(req,res,false));

  app.delete('/api/admin/branches/:id', async (req,res) => {
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1) return res.status(400).json({message:'Invalid branch ID'});
    const client=await db.connect();
    try {
      await client.query('BEGIN');
      const {rows:[branch]}=await client.query('SELECT id,name FROM branches WHERE id=$1 FOR UPDATE',[id]);
      if(!branch){await client.query('ROLLBACK');return res.status(404).json({message:'Branch not found'});}
      const {rows:refs}=await client.query(`
        SELECT tc.table_schema,tc.table_name,kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
        WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_schema='public' AND ccu.table_name='branches'
      `);
      const dependencies=[];
      for(const ref of refs){
        if(ref.table_name==='branches') continue;
        const schema=ref.table_schema.replace(/"/g,'""'), table=ref.table_name.replace(/"/g,'""'), col=ref.column_name.replace(/"/g,'""');
        const {rows} = await client.query(`SELECT COUNT(*)::int AS count FROM "${schema}"."${table}" WHERE "${col}"=$1`,[id]);
        if(Number(rows[0]?.count||0)>0) dependencies.push(`${ref.table_name} (${rows[0].count})`);
      }
      if(dependencies.length){await client.query('ROLLBACK');return res.status(409).json({message:'Branch has dependent data and cannot be deleted. Deactivate it instead.',dependencies});}
      await client.query('DELETE FROM branches WHERE id=$1',[id]);
      await client.query('COMMIT');
      res.json({message:'Branch deleted successfully'});
    } catch(e) {
      try{await client.query('ROLLBACK');}catch{}
      res.status(e.code==='23503'?409:500).json({message:e.code==='23503'?'Branch has dependent data and cannot be deleted. Deactivate it instead.':'Unable to delete branch'});
    } finally {client.release();}
  });
};
