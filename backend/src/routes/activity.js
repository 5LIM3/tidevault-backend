const express = require('express');
const db = require('../db');

const router = express.Router();

function maskUsername(username) {
  if (!username) return 'someone';
  if (username.length <= 3) return username[0] + '*'.repeat(Math.max(1, username.length - 1));
  const first = username.slice(0, 2);
  const last = username.slice(-1);
  const stars = '*'.repeat(Math.max(1, username.length - 3));
  return `${first}${stars}${last}`;
}

const LABELS = {
  stake: 'new plan',
  unstake: 'withdrew',
  reward: 'claim',
  deposit: 'deposit approved',
  deposit_request: 'deposit requested',
  referral_bonus: 'referral bonus',
};

router.get('/', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT t.type, t.amount, t.created_at as createdAt, u.username, u.show_on_leaderboard
      FROM transactions t
      JOIN users u ON u.id = t.user_id
      WHERE t.type IN ('stake', 'unstake', 'reward', 'deposit', 'referral_bonus')
      ORDER BY t.created_at DESC
      LIMIT 20
    `);

    const activity = rows.map((r) => ({
      label: maskUsername(r.username) + ' ' + (LABELS[r.type] || r.type) + ' $' + Math.abs(Number(r.amount)).toLocaleString(undefined, { maximumFractionDigits: 2 }),
      createdAt: r.createdAt || r.createdat,
    }));

    res.json({ activity });
  } catch (err) {
    console.error('Activity feed error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
