const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const tvlRow = await db.get(`SELECT COALESCE(SUM(principal_usd), 0) as v FROM positions WHERE status = 'active'`);
    const last24hRow = await db.get(`SELECT COALESCE(SUM(principal_usd), 0) as v FROM positions WHERE started_at >= ?`, [oneDayAgo]);
    const stakersRow = await db.get(`SELECT COUNT(DISTINCT user_id) as v FROM positions WHERE status = 'active'`);
    const rewardsRow = await db.get(`SELECT COALESCE(SUM(claimed_usd), 0) as v FROM positions`);

    const num = (row) => Number(row.v !== undefined ? row.v : row.count);

    res.json({
      totalValueLocked: num(tvlRow),
      lockedLast24h: num(last24hRow),
      activeStakers: num(stakersRow),
      rewardsPaid: num(rewardsRow),
    });
  } catch (err) {
    console.error('Platform stats error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
