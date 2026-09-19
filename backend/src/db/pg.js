const { Pool } = require('pg');

console.log('[DEBUG] DATABASE_URL length:', (process.env.DATABASE_URL || '').length);
console.log('[DEBUG] first char code:', (process.env.DATABASE_URL || '').charCodeAt(0));
console.log('[DEBUG] first 15 chars raw:', JSON.stringify((process.env.DATABASE_URL || '').slice(0, 15)));

const cleanDatabaseUrl = (process.env.DATABASE_URL || '').trim().replace(/^\uFEFF/, '');

const pool = new Pool({
  connectionString: cleanDatabaseUrl,
  ssl: { rejectUnauthorized: false },
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    harbor_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    balance_usd DOUBLE PRECISION NOT NULL DEFAULT 0,

    email TEXT UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0,
    email_verify_token TEXT,
    email_verify_expires TEXT,

    reset_token TEXT,
    reset_expires TEXT,

    referred_by INTEGER,
    notif_reward_tick INTEGER NOT NULL DEFAULT 1,
    notif_weekly_digest INTEGER NOT NULL DEFAULT 1,
    show_on_leaderboard INTEGER NOT NULL DEFAULT 1,

    funding_method TEXT,
    funding_network TEXT,
    funding_destination TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS deposit_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    method TEXT NOT NULL,
    network TEXT,
    amount_usd DOUBLE PRECISION NOT NULL,
    proof_note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount_usd DOUBLE PRECISION NOT NULL,
    method TEXT NOT NULL,
    destination TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS positions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    plan TEXT NOT NULL,
    principal_usd DOUBLE PRECISION NOT NULL,
    multiplier DOUBLE PRECISION NOT NULL,
    days INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    claimed_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    withdrawn_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    meta TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const ready = pool.query(SCHEMA).catch((err) => {
  console.error('Postgres schema init failed:', err.message);
  process.exit(1);
});

function toPgSql(sql) {
  let i = 0;
  return sql
    .replace(/\?/g, () => `$${++i}`)
    .replace(/datetime\('now'\)/gi, 'NOW()');
}

async function get(sql, params = []) {
  await ready;
  const res = await pool.query(toPgSql(sql), params);
  return res.rows[0];
}

async function all(sql, params = []) {
  await ready;
  const res = await pool.query(toPgSql(sql), params);
  return res.rows;
}

async function run(sql, params = []) {
  await ready;
  let pgSql = toPgSql(sql);
  const isInsert = /^\s*INSERT/i.test(sql);
  if (isInsert && !/RETURNING/i.test(sql)) {
    pgSql += ' RETURNING id';
  }
  const res = await pool.query(pgSql, params);
  return {
    lastInsertRowid: isInsert ? res.rows[0]?.id : undefined,
    changes: res.rowCount,
  };
}

function nowExpr() {
  return 'NOW()';
}

module.exports = { get, all, run, nowExpr, kind: 'postgres' };
