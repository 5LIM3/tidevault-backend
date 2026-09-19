# Deploying TideVault

Local dev uses a SQLite file (`tidevault.db`) and needs zero setup. This guide
is for when you're ready to put it on the real internet with data that
survives redeploys.

## 1. Database — Supabase (Postgres)

1. Create a project at supabase.com (free tier is fine to start).
2. In the dashboard: **Project Settings → Database → Connection string → URI**.
   Copy the **Transaction pooler** string (port `6543`) — Fly machines are
   short-lived/serverless-ish, so the pooled connection avoids exhausting
   Postgres' direct connection limit.
3. You don't need to run any SQL yourself — the backend creates its tables
   automatically on first boot if they don't exist (see `src/db/pg.js`).

## 2. Backend — Fly.io

```bash
# from the backend/ folder
fly auth login
fly apps create your-app-name        # pick something unique
```

Edit `fly.toml` and change `app = "tidevault-backend"` to whatever you just
created.

```bash
fly secrets set \
  DATABASE_URL="postgresql://postgres.xxxx:yourpassword@aws-0-region.pooler.supabase.com:6543/postgres" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  ADMIN_JWT_SECRET="$(openssl rand -hex 32)" \
  ADMIN_PASSWORD="pick-a-real-password" \
  APP_URL="https://your-app-name.fly.dev"

fly deploy
```

That's it — `fly deploy` builds the Dockerfile and ships it. Check it's alive:

```bash
curl https://your-app-name.fly.dev/api/health
```

Admin panel is at `https://your-app-name.fly.dev/admin.html`.

### Optional: real emails (password reset / verification)

Without `RESEND_API_KEY` set, those emails just get logged to
`fly logs` instead of actually sending. To make them real:

```bash
fly secrets set RESEND_API_KEY="re_your_key" RESEND_FROM="TideVault <you@yourdomain.com>"
```

(Resend requires you verify a sending domain for the `RESEND_FROM` address —
their dashboard walks you through it.)

## 3. Frontend

`index.html` is a static file — GitHub Pages, Vercel, Netlify, or literally
any static host works. The only thing to change is the `API_BASE` constant
near the top of the second `<script>` block:

```js
const API_BASE = 'https://your-app-name.fly.dev/api';
```

## 4. Redeploying later

```bash
fly deploy
```

Since `DATABASE_URL` points at Supabase (not a local file inside the Fly
machine), every redeploy keeps all real user data, balances, and positions —
nothing gets wiped.

## Notes / things to tighten before this handles real money

- `ssl: { rejectUnauthorized: false }` in `src/db/pg.js` skips CA verification
  for simplicity. Fine for getting started; swap in Supabase's CA bundle for a
  stricter setup later.
- Deposit addresses in `src/config/plans.js` are demo placeholders — replace
  with real wallet addresses you control before accepting real deposits.
- Nothing here does KYC/AML. If this is ever handling real user funds at
  scale, that's a legal requirement in most jurisdictions, not just a
  nice-to-have.
