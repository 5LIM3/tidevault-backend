const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT u.id, u.username, u.harbor_id, COALESCE(SUM(p.principal_usd), 0) as totalLocked
      FROM users u
      LEFT JOIN positions p ON p.user_id = u.id AND p.status = 'active'
      WHERE u.show_on_leaderboard = 1
      GROUP BY u.id, u.username, u.harbor_id
      HAVING COALESCE(SUM(p.principal_usd), 0) > 0
      ORDER BY totalLocked DESC
      LIMIT 25
    `);

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      label: r.username,
      totalLockedUsd: Number(r.totallocked !== undefined ? r.totallocked : r.totalLocked),
    }));

    res.json({ leaderboard });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
