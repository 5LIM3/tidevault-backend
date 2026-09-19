const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', '..', 'tidevault.db');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    harbor_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    balance_usd REAL NOT NULL DEFAULT 0,

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

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deposit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    method TEXT NOT NULL,
    network TEXT,
    amount_usd REAL NOT NULL,
    proof_note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount_usd REAL NOT NULL,
    method TEXT NOT NULL,
    destination TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan TEXT NOT NULL,
    principal_usd REAL NOT NULL,
    multiplier REAL NOT NULL,
    days INTEGER NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    claimed_usd REAL NOT NULL DEFAULT 0,
    withdrawn_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

async function get(sql, params = []) {
  return sqlite.prepare(sql).get(...params);
}

async function all(sql, params = []) {
  return sqlite.prepare(sql).all(...params);
}

async function run(sql, params = []) {
  const info = sqlite.prepare(sql).run(...params);
  return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
}

function nowExpr() {
  return "datetime('now')";
}

module.exports = { get, all, run, nowExpr, kind: 'sqlite' };
