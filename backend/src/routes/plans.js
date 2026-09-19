const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { PLANS, MIN_LOCK_USD } = require('../config/plans');

const router = express.Router();

function computeAccrued(pos) {
  const start = new Date(pos.started_at).getTime();
  const end = new Date(pos.ends_at).getTime();
  const now = Date.now();
  const principal = Number(pos.principal_usd);
  const multiplier = Number(pos.multiplier);
  const claimed = Number(pos.claimed_usd);
  const totalReward = principal * (multiplier - 1);

  if (pos.status === 'withdrawn') {
    return { accruedTotal: claimed, claimable: 0, totalReward, progress: 1 };
  }

  const clampedNow = Math.min(Math.max(now, start), end);
  const progress = end === start ? 1 : (clampedNow - start) / (end - start);
  const accruedTotal = totalReward * progress;
  const claimable = Math.max(0, accruedTotal - claimed);

  return { accruedTotal, claimable, totalReward, progress };
}

router.get('/', (req, res) => {
  res.json({
    plans: Object.values(PLANS),
    minLockUsd: MIN_LOCK_USD,
  });
});

router.post('/lock', requireAuth, async (req, res) => {
  try {
    const { plan, amountUsd } = req.body || {};
    const def = PLANS[plan];
    if (!def) return res.status(400).json({ error: 'Unknown plan.' });

    const amount = Number(amountUsd);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Enter a valid amount.' });
    }
    if (amount < MIN_LOCK_USD) {
      return res.status(400).json({ error: `Minimum lock amount is $${MIN_LOCK_USD}.` });
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (amount > Number(user.balance_usd)) {
      return res.status(400).json({ error: 'Insufficient balance. Fund your account first.', code: 'INSUFFICIENT_BALANCE' });
    }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + def.days * 24 * 60 * 60 * 1000);

    await db.run('UPDATE users SET balance_usd = balance_usd - ? WHERE id = ?', [amount, user.id]);

    const info = await db.run(`
      INSERT INTO positions (user_id, plan, principal_usd, multiplier, days, started_at, ends_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [user.id, def.key, amount, def.multiplier, def.days, startedAt.toISOString(), endsAt.toISOString()]);

    await db.run(`
      INSERT INTO transactions (user_id, type, amount, meta)
      VALUES (?, 'stake', ?, ?)
    `, [user.id, -amount, JSON.stringify({ positionId: info.lastInsertRowid, plan: def.key })]);

    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    console.error('Lock plan error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.get('/positions', requireAuth, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM positions WHERE user_id = ? ORDER BY started_at DESC', [req.userId]);
    const positions = rows.map((pos) => {
      const acc = computeAccrued(pos);
      return {
        id: pos.id,
        plan: pos.plan,
        principalUsd: Number(pos.principal_usd),
        multiplier: Number(pos.multiplier),
        days: pos.days,
        startedAt: pos.started_at,
        endsAt: pos.ends_at,
        status: pos.status,
        claimedUsd: Number(pos.claimed_usd),
        accruedTotalUsd: acc.accruedTotal,
        claimableUsd: acc.claimable,
        totalRewardUsd: acc.totalReward,
        progress: acc.progress,
      };
    });
    res.json({ positions });
  } catch (err) {
    console.error('Get positions error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/claim', requireAuth, async (req, res) => {
  try {
    const { positionId } = req.body || {};
    const pos = await db.get('SELECT * FROM positions WHERE id = ? AND user_id = ?', [positionId, req.userId]);
    if (!pos) return res.status(404).json({ error: 'Position not found.' });
    if (pos.status !== 'active') return res.status(400).json({ error: 'This position is no longer active.' });

    const acc = computeAccrued(pos);
    if (acc.claimable <= 0) return res.status(400).json({ error: 'Nothing to claim yet.' });

    await db.run('UPDATE positions SET claimed_usd = claimed_usd + ? WHERE id = ?', [acc.claimable, pos.id]);
    await db.run('UPDATE users SET balance_usd = balance_usd + ? WHERE id = ?', [acc.claimable, req.userId]);
    await db.run(`
      INSERT INTO transactions (user_id, type, amount, meta)
      VALUES (?, 'reward', ?, ?)
    `, [req.userId, acc.claimable, JSON.stringify({ positionId: pos.id, plan: pos.plan })]);

    res.json({ claimedUsd: acc.claimable });
  } catch (err) {
    console.error('Claim error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/unlock', requireAuth, async (req, res) => {
  try {
    const { positionId } = req.body || {};
    const pos = await db.get('SELECT * FROM positions WHERE id = ? AND user_id = ?', [positionId, req.userId]);
    if (!pos) return res.status(404).json({ error: 'Position not found.' });
    if (pos.status !== 'active') return res.status(400).json({ error: 'This position is no longer active.' });

    const acc = computeAccrued(pos);
    const totalCredit = Number(pos.principal_usd) + acc.claimable;

    await db.run(
      `UPDATE positions SET status = 'withdrawn', claimed_usd = claimed_usd + ?, withdrawn_at = ${db.nowExpr()} WHERE id = ?`,
      [acc.claimable, pos.id]
    );
    await db.run('UPDATE users SET balance_usd = balance_usd + ? WHERE id = ?', [totalCredit, req.userId]);
    await db.run(`
      INSERT INTO transactions (user_id, type, amount, meta)
      VALUES (?, 'unstake', ?, ?)
    `, [req.userId, totalCredit, JSON.stringify({ positionId: pos.id, plan: pos.plan, rewardsIncluded: acc.claimable })]);

    res.json({ principalUsd: Number(pos.principal_usd), rewardsClaimedUsd: acc.claimable, totalCreditUsd: totalCredit });
  } catch (err) {
    console.error('Unlock error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
