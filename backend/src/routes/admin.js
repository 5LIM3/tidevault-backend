const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAdmin, ADMIN_JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD || 'changeme-admin';
  if (!password || password !== expected) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }
  const token = jwt.sign({ admin: true }, ADMIN_JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

router.get('/deposits', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const rows = await db.all(`
      SELECT d.*, u.username as userUsername, u.harbor_id as userHarborId
      FROM deposit_requests d
      JOIN users u ON u.id = d.user_id
      WHERE d.status = ?
      ORDER BY d.created_at DESC
    `, [status]);
    res.json({ deposits: rows.map(normalizeRow) });
  } catch (err) {
    console.error('List deposits error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/deposits/:id/approve', requireAdmin, async (req, res) => {
  try {
    const dep = await db.get('SELECT * FROM deposit_requests WHERE id = ?', [req.params.id]);
    if (!dep) return res.status(404).json({ error: 'Deposit not found.' });
    if (dep.status !== 'pending') return res.status(400).json({ error: 'Already reviewed.' });

    const user = await db.get('SELECT * FROM users WHERE id = ?', [dep.user_id]);

    await db.run(`UPDATE deposit_requests SET status = 'approved', reviewed_at = ${db.nowExpr()} WHERE id = ?`, [dep.id]);
    await db.run('UPDATE users SET balance_usd = balance_usd + ? WHERE id = ?', [Number(dep.amount_usd), dep.user_id]);

    if (!user.funding_method) {
      await db.run('UPDATE users SET funding_method = ?, funding_network = ? WHERE id = ?', [dep.method, dep.network, dep.user_id]);
    }

    await db.run(`
      INSERT INTO transactions (user_id, type, amount, meta)
      VALUES (?, 'deposit', ?, ?)
    `, [dep.user_id, Number(dep.amount_usd), JSON.stringify({ depositId: dep.id, method: dep.method, network: dep.network })]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Approve deposit error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/deposits/:id/decline', requireAdmin, async (req, res) => {
  try {
    const dep = await db.get('SELECT * FROM deposit_requests WHERE id = ?', [req.params.id]);
    if (!dep) return res.status(404).json({ error: 'Deposit not found.' });
    if (dep.status !== 'pending') return res.status(400).json({ error: 'Already reviewed.' });

    await db.run(`UPDATE deposit_requests SET status = 'declined', reviewed_at = ${db.nowExpr()} WHERE id = ?`, [dep.id]);
    await db.run(
      `UPDATE transactions SET status = 'declined' WHERE user_id = ? AND type = 'deposit_request' AND meta LIKE ?`,
      [dep.user_id, `%"depositId":${dep.id}%`]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Decline deposit error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.get('/withdrawals', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const rows = await db.all(`
      SELECT w.*, u.username as userUsername, u.harbor_id as userHarborId
      FROM withdrawal_requests w
      JOIN users u ON u.id = w.user_id
      WHERE w.status = ?
      ORDER BY w.created_at DESC
    `, [status]);
    res.json({ withdrawals: rows.map(normalizeRow) });
  } catch (err) {
    console.error('List withdrawals error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/withdrawals/:id/approve', requireAdmin, async (req, res) => {
  try {
    const wd = await db.get('SELECT * FROM withdrawal_requests WHERE id = ?', [req.params.id]);
    if (!wd) return res.status(404).json({ error: 'Withdrawal not found.' });
    if (wd.status !== 'pending') return res.status(400).json({ error: 'Already reviewed.' });

    await db.run(`UPDATE withdrawal_requests SET status = 'sent', reviewed_at = ${db.nowExpr()} WHERE id = ?`, [wd.id]);
    await db.run(
      `UPDATE transactions SET status = 'completed' WHERE user_id = ? AND type = 'withdrawal' AND meta LIKE ?`,
      [wd.user_id, `%"requestId":${wd.id}%`]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Approve withdrawal error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/withdrawals/:id/decline', requireAdmin, async (req, res) => {
  try {
    const wd = await db.get('SELECT * FROM withdrawal_requests WHERE id = ?', [req.params.id]);
    if (!wd) return res.status(404).json({ error: 'Withdrawal not found.' });
    if (wd.status !== 'pending') return res.status(400).json({ error: 'Already reviewed.' });

    await db.run('UPDATE users SET balance_usd = balance_usd + ? WHERE id = ?', [Number(wd.amount_usd), wd.user_id]);
    await db.run(`UPDATE withdrawal_requests SET status = 'declined', reviewed_at = ${db.nowExpr()} WHERE id = ?`, [wd.id]);
    await db.run(
      `UPDATE transactions SET status = 'declined' WHERE user_id = ? AND type = 'withdrawal' AND meta LIKE ?`,
      [wd.user_id, `%"requestId":${wd.id}%`]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Decline withdrawal error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// Postgres lowercases unquoted aliases; normalize both casings.
function normalizeRow(row) {
  return {
    ...row,
    userUsername: row.userUsername ?? row.userusername,
    userHarborId: row.userHarborId ?? row.userharborid,
    amount_usd: Number(row.amount_usd),
  };
}

module.exports = router;
