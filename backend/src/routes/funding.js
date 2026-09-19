const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { DEPOSIT_ADDRESSES } = require('../config/plans');

const router = express.Router();

router.get('/deposit-address', requireAuth, (req, res) => {
  const { method, network } = req.query;

  if (method === 'usdt') {
    const net = network || 'trc20';
    const address = DEPOSIT_ADDRESSES.usdt[net];
    if (!address) return res.status(400).json({ error: 'Unsupported network for USDT.' });
    return res.json({ method: 'usdt', network: net, address });
  }
  if (method === 'btc') {
    return res.json({ method: 'btc', address: DEPOSIT_ADDRESSES.btc.default });
  }
  return res.status(400).json({ error: 'Unsupported funding method.' });
});

router.post('/deposit-request', requireAuth, async (req, res) => {
  try {
    const { method, network, amountUsd, proofNote } = req.body || {};

    if (!['usdt', 'btc', 'giftcard'].includes(method)) {
      return res.status(400).json({ error: 'Unsupported funding method.' });
    }
    const amount = Number(amountUsd);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Enter a valid amount.' });
    }
    if (!proofNote || !String(proofNote).trim()) {
      return res.status(400).json({ error: method === 'giftcard' ? 'Enter the gift card code and value.' : 'Enter your transaction ID as proof.' });
    }

    const info = await db.run(`
      INSERT INTO deposit_requests (user_id, method, network, amount_usd, proof_note)
      VALUES (?, ?, ?, ?, ?)
    `, [req.userId, method, method === 'usdt' ? (network || 'trc20') : null, amount, String(proofNote).trim()]);

    await db.run(`
      INSERT INTO transactions (user_id, type, amount, status, meta)
      VALUES (?, 'deposit_request', ?, 'pending', ?)
    `, [req.userId, amount, JSON.stringify({ depositId: info.lastInsertRowid, method, network: method === 'usdt' ? (network || 'trc20') : undefined })]);

    res.status(201).json({ id: info.lastInsertRowid, status: 'pending' });
  } catch (err) {
    console.error('Deposit request error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/withdraw-request', requireAuth, async (req, res) => {
  try {
    const { amountUsd, destination } = req.body || {};
    const amount = Number(amountUsd);

    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.funding_method) {
      return res.status(400).json({ error: 'Fund your account at least once before requesting a withdrawal.' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Enter a valid amount.' });
    }
    if (amount > Number(user.balance_usd)) {
      return res.status(400).json({ error: 'Insufficient balance.' });
    }
    if (!destination || !String(destination).trim()) {
      return res.status(400).json({ error: 'Enter a destination (wallet address or gift card recipient).' });
    }

    await db.run('UPDATE users SET balance_usd = balance_usd - ? WHERE id = ?', [amount, user.id]);

    const info = await db.run(`
      INSERT INTO withdrawal_requests (user_id, amount_usd, method, destination)
      VALUES (?, ?, ?, ?)
    `, [user.id, amount, user.funding_method, String(destination).trim()]);

    await db.run(`
      INSERT INTO transactions (user_id, type, amount, status, meta)
      VALUES (?, 'withdrawal', ?, 'pending', ?)
    `, [user.id, -amount, JSON.stringify({ requestId: info.lastInsertRowid, method: user.funding_method })]);

    res.status(201).json({ id: info.lastInsertRowid, status: 'pending' });
  } catch (err) {
    console.error('Withdraw request error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
