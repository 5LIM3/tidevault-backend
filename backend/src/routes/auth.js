const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');
const { sendMail } = require('../mailer');
const { generateUniqueHarborId } = require('../harborId');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

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

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, username, phone, password, referralCode } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-24 characters: letters, numbers, underscore, or period.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    let referrer = null;
    if (referralCode) {
      referrer = await db.get('SELECT * FROM users WHERE harbor_id = ?', [String(referralCode).trim()]);
    }

    const harborId = await generateUniqueHarborId();
    const passwordHash = bcrypt.hashSync(password, 10);
    const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || username;

    const info = await db.run(`
      INSERT INTO users (harbor_id, username, first_name, last_name, phone, password_hash, display_name, referred_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [harborId, username.toLowerCase(), firstName || null, lastName || null, phone || null, passwordHash, displayName, referrer ? referrer.id : null]);

    const user = await db.get('SELECT * FROM users WHERE id = ?', [info.lastInsertRowid]);

    if (referrer) {
      await db.run('UPDATE users SET balance_usd = balance_usd + 5 WHERE id = ?', [referrer.id]);
      await db.run(`
        INSERT INTO transactions (user_id, type, amount, meta)
        VALUES (?, 'referral_bonus', 5, ?)
      `, [referrer.id, JSON.stringify({ referredUserId: user.id })]);
    }

    const token = signToken(user.id);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Enter your username/Harbor ID and password.' });
    }

    const id = String(identifier).trim().toLowerCase();
    const user = await db.get('SELECT * FROM users WHERE username = ? OR harbor_id = ?', [id, String(identifier).trim()]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username/Harbor ID or password.' });
    }

    const token = signToken(user.id);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong logging in.' });
  }
});

router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('Missing token.');

    const user = await db.get('SELECT * FROM users WHERE email_verify_token = ?', [token]);
    if (!user || new Date(user.email_verify_expires) < new Date()) {
      return res.status(400).send('This verification link is invalid or expired.');
    }

    await db.run('UPDATE users SET email_verified = 1, email_verify_token = NULL, email_verify_expires = NULL WHERE id = ?', [user.id]);
    res.send('Email verified — you can close this tab and return to TideVault.');
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).send('Something went wrong verifying your email.');
  }
});

router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.email) return res.status(400).json({ error: 'Add an email in your Profile first.' });
    if (user.email_verified) return res.json({ ok: true, alreadyVerified: true });

    const verifyToken = makeToken();
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.run('UPDATE users SET email_verify_token = ?, email_verify_expires = ? WHERE id = ?', [verifyToken, verifyExpires, user.id]);

    const verifyUrl = `${process.env.APP_URL || 'http://localhost:4000'}/api/auth/verify-email?token=${verifyToken}`;
    sendMail({
      to: user.email,
      subject: 'Verify your TideVault email',
      html: `<p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    }).catch((e) => console.error('Verification email failed:', e.message));

    res.json({ ok: true });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/request-password-reset', async (req, res) => {
  try {
    const { identifier } = req.body || {};
    if (!identifier) return res.status(400).json({ error: 'Enter your username or Harbor ID.' });

    const id = String(identifier).trim().toLowerCase();
    const user = await db.get('SELECT * FROM users WHERE username = ? OR harbor_id = ?', [id, String(identifier).trim()]);
    if (!user || !user.email) {
      // Don't leak whether the account exists; also nothing to email if no address on file.
      return res.json({ ok: true });
    }

    const resetToken = makeToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [resetToken, resetExpires, user.id]);

    const resetUrl = `${process.env.APP_URL || 'http://localhost:4000'}/reset-password.html?token=${resetToken}`;
    sendMail({
      to: user.email,
      subject: 'Reset your TideVault password',
      html: `<p>This link expires in 1 hour and can only be used once:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    }).catch((e) => console.error('Reset email failed:', e.message));

    res.json({ ok: true });
  } catch (err) {
    console.error('Password reset request error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const user = await db.get('SELECT * FROM users WHERE reset_token = ?', [token]);
    if (!user || !user.reset_expires || new Date(user.reset_expires) < new Date()) {
      return res.status(400).json({ error: 'This reset link is invalid or expired.' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await db.run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [passwordHash, user.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
