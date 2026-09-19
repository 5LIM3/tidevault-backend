// Local dev / no DATABASE_URL -> SQLite file on disk.
// Production with DATABASE_URL set (e.g. a Supabase connection string) -> Postgres.
// Both expose the same { get, all, run, nowExpr } interface so routes don't
// need to know which one is active.
const db = process.env.DATABASE_URL ? require('./pg') : require('./sqlite');

console.log(`[db] using ${db.kind} backend${db.kind === 'postgres' ? ' (Supabase/Postgres)' : ' (local file: tidevault.db)'}`);

module.exports = db;
