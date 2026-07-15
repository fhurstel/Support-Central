# Deploying the Fiji IT Service Desk

The app ships as a single container (React SPA + FastAPI API + SQLite on one
port). Data — tickets, comments, timers, invoices, users — is stored in SQLite
on a **persistent volume mounted at `/data`**, so it survives restarts and
redeploys. This gives you a real, durable, public HTTPS instance.

Two supported targets: **Fly.io** (recommended — free volume, scale-to-zero) and
**Render** (needs a paid instance for the disk).

---

## Option A — Fly.io (recommended)

One-time setup: install flyctl (`curl -L https://fly.io/install.sh | sh`) and
sign in (`fly auth signup` or `fly auth login`).

From the repo root:

```bash
# 1. Create the app from the committed fly.toml (pick a unique name if prompted).
fly launch --copy-config --no-deploy

# 2. Create the persistent volume for SQLite + uploads (same region as the app).
fly volumes create fiji_data --size 1 --region iad

# 3. Set a fixed JWT signing secret (so logins survive restarts).
fly secrets set JWT_SECRET="$(openssl rand -hex 32)"

# 4. (Optional) choose the first-boot demo passwords instead of the defaults.
fly secrets set SEED_ADMIN_PASSWORD="your-admin-pw" \
                SEED_TECH_PASSWORD="your-tech-pw" \
                SEED_GUEST_PASSWORD="your-guest-pw"

# 5. Deploy.
fly deploy
```

Open the printed `https://<your-app>.fly.dev`. First boot seeds the demo data;
after that your changes persist. Log in with `admin@example.test` and the admin
password (default `DevAdmin123!` unless you set one in step 4).

Keep it to **one machine** — SQLite is single-writer. `fly scale count 1`.

Tail logs: `fly logs`. Open a shell: `fly ssh console`.

---

## Option B — Render (paid instance for persistence)

1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. Render reads
   `render.yaml`, provisions a Docker web service on the `starter` plan with a
   1 GB disk at `/data`, and auto-generates `JWT_SECRET`.
3. Deploy. Open the service URL; first boot seeds the demo data.

> The disk requires a paid plan. On the free tier there is no disk and the
> service sleeps when idle, so data would reset — use Fly.io instead if you want
> free persistence.

---

## Changing the admin password after deploy

The seed runs only on first boot. To change a password later, log in and use the
app's user management, or open a shell (`fly ssh console`) and reseed against a
fresh volume. Never commit real passwords or secrets — set them via
`fly secrets` / Render environment variables.

## What persists

Everything under `/data`: the SQLite database (`service_desk.db`), uploaded
attachments, voice-agent settings, and RustDesk key material. Back it up with
`fly ssh console` + `sqlite3 /data/service_desk.db .dump`, or a Fly volume
snapshot.
