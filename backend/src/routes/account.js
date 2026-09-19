const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendMail } = require('../mailer');

const router = express.Router();

function publicUser(u) {
  return {
    id: u.id,
    harborId: u.harbor_id,
    username: u.username,
    firstName: u.first_name,
    lastName: u.last_name,
    phone: u.phone,
    displayName: u.display_name,
    balanceUsd: Number(u.balance_usd),
    email: u.email,
    emailVerified: !!u.email_verified,
    referralCode: u.harbor_id,
    notifRewardTick: u.notif_reward_tick !== 0,
    notifWeeklyDigest: u.notif_weekly_digest !== 0,
    showOnLeaderboard: u.show_on_leaderboard !== 0,
    fundingMethod: u.funding_method,
  };
}

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('Get account error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const { displayName, username, email, notifRewardTick, notifWeeklyDigest, showOnLeaderboard } = req.body || {};
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let nextUsername = user.username;
    if (username !== undefined && username.toLowerCase() !== user.username) {
      if (!USERNAME_RE.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-24 characters: letters, numbers, underscore, or period.' });
      }
      const clash = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username.toLowerCase(), user.id]);
      if (clash) return res.status(409).json({ error: 'That username is already taken.' });
      nextUsername = username.toLowerCase();
    }

    let nextEmail = user.email;
    let emailChanged = false;
    if (email !== undefined) {
      const cleanEmail = email ? String(email).trim().toLowerCase() : null;
      if (cleanEmail !== (user.email || null)) {
        if (cleanEmail) {
          const clash = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [cleanEmail, user.id]);
          if (clash) return res.status(409).json({ error: 'That email is already in use.' });
        }
        nextEmail = cleanEmail;
        emailChanged = true;
      }
    }

    await db.run(`
      UPDATE users SET
        display_name = ?, username = ?, email = ?,
        email_verified = ?, email_verify_token = ?, email_verify_expires = ?,
        notif_reward_tick = ?, notif_weekly_digest = ?, show_on_leaderboard = ?
      WHERE id = ?
    `, [
      displayName !== undefined ? displayName : user.display_name,
      nextUsername,
      nextEmail,
      emailChanged ? 0 : user.email_verified,
      emailChanged ? null : user.email_verify_token,
      emailChanged ? null : user.email_verify_expires,
      notifRewardTick !== undefined ? (notifRewardTick ? 1 : 0) : user.notif_reward_tick,
      notifWeeklyDigest !== undefined ? (notifWeeklyDigest ? 1 : 0) : user.notif_weekly_digest,
      showOnLeaderboard !== undefined ? (showOnLeaderboard ? 1 : 0) : user.show_on_leaderboard,
      user.id,
    ]);

    let updated = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);

    // New/changed email: kick off a fresh verification link automatically.
    if (emailChanged && nextEmail) {
      const verifyToken = crypto.randomBytes(24).toString('hex');
      const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await db.run('UPDATE users SET email_verify_token = ?, email_verify_expires = ? WHERE id = ?', [verifyToken, verifyExpires, user.id]);
      const verifyUrl = `${process.env.APP_URL || 'http://localhost:4000'}/api/auth/verify-email?token=${verifyToken}`;
      sendMail({
        to: nextEmail,
        subject: 'Verify your TideVault email',
        html: `<p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      }).catch((e) => console.error('Verification email failed:', e.message));
      updated = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    }

    res.json({ user: publicUser(updated) });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT type, amount, status, meta, created_at as createdAt
      FROM transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 200
    `, [req.userId]);

    res.json({ transactions: rows.map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null })) });
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.delete('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const activePositions = await db.get(
      "SELECT COUNT(*) as cnt FROM positions WHERE user_id = ? AND status = 'active'",
      [req.userId]
    );
    const cnt = Number(activePositions.cnt !== undefined ? activePositions.cnt : activePositions.count);
    if (cnt > 0) {
      return res.status(400).json({ error: 'Unlock all active plans before deleting your account.' });
    }

    await db.run('DELETE FROM transactions WHERE user_id = ?', [req.userId]);
    await db.run('DELETE FROM positions WHERE user_id = ?', [req.userId]);
    await db.run('DELETE FROM deposit_requests WHERE user_id = ?', [req.userId]);
    await db.run('DELETE FROM withdrawal_requests WHERE user_id = ?', [req.userId]);
    await db.run('UPDATE users SET referred_by = NULL WHERE referred_by = ?', [req.userId]);
    await db.run('DELETE FROM users WHERE id = ?', [req.userId]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Something went wrong deleting your account.' });
  }
});

module.exports = router;
