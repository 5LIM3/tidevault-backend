process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT — kept alive for debugging]', err.message);
});

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const fundingRoutes = require('./routes/funding');
const plansRoutes = require('./routes/plans');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');
const platformStatsRoutes = require('./routes/platformStats');
const activityRoutes = require('./routes/activity');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Serve the admin page and reset-password page as static files if present
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/funding', fundingRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/platform-stats', platformStatsRoutes);
app.use('/api/activity', activityRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`TideVault backend running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
});
