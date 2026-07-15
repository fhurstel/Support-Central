# Fiji IT Service Desk — PocketBase backend

A drop-in **PocketBase** backend for the existing React SPA. Instead of the
FastAPI service, PocketBase (Go + SQLite, single binary) stores the data and a
JavaScript compatibility layer reproduces the exact `/api/*` REST contract the
frontend already uses — so **the frontend is unchanged** and everything runs
from **one process on one port**, with data persisted in SQLite.

This is the free, self-hostable path: run it on [PocketHost](https://pockethost.io)
(free PocketBase hosting) or any small box.

## Layout

| Path | Purpose |
| --- | --- |
| `pb_migrations/` | Collection schema + synthetic demo seed (run once, automatically) |
| `pb_hooks/api.pb.js` | Registers the `/api/*` routes |
| `pb_hooks/lib.js` | The handlers — auth, tickets, comments, timers, board, leads, clients, invoices, KB |
| `main.go` | Optional self-contained binary (PocketBase + jsvm + SPA serving) |
| `build.sh` | Builds the SPA into `pb_public/` |
| `pb_public/` | The built SPA (generated; git-ignored) |

Foreign keys use an integer `nid` on every record because the frontend assumes
integer ids; the compatibility layer exposes `nid` as `id`.

## Run locally

```bash
cd pocketbase
./build.sh --binary          # builds SPA into pb_public/ and compiles ./pocketbase
./pocketbase serve --http=0.0.0.0:8090
# open http://localhost:8090  → login admin@example.test / DevAdmin123!
```

No Go? Download the official PocketBase v0.22.x binary, drop it in this folder
(so `pb_migrations/`, `pb_hooks/`, `pb_public/` sit next to it), and run the same
`serve` command — the stock binary already includes the JS hooks engine.

## Deploy free on PocketHost

1. Run `./build.sh` to generate `pb_public/`.
2. Create a free app at [pockethost.io](https://pockethost.io).
3. Upload `pb_migrations/`, `pb_hooks/`, and `pb_public/` to the instance
   (via its file manager or FTP). Migrations create the schema + seed on first
   boot.
4. Open the instance URL → the SPA loads, logged in with the demo accounts.

Your data lives in PocketHost's persistent SQLite — it survives restarts, free.

## Demo logins (first-boot seed)

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.test` | `DevAdmin123!` |
| Technician | `tech@example.test` | `DevTech123!` |
| Guest | `guest@example.test` | `DevGuest123!` |

Change these after first deploy (the seed only runs once). The PocketBase admin
UI is at `/_/`.

## Status

Implemented: auth (login/refresh/me), users, clients (+members), leads (+review),
tickets (list/detail/create/update/close/move/archive), comments, time tracking
(start/stop/manual), kanban board + stats, invoices, knowledge base, voice-agent
settings stub. Attachments, checklists, labels, and activity return empty lists
(the UI renders without them); wire them to collections next if needed.

Pinned to PocketBase **v0.22.x** (hooks/migrations API). Verified end-to-end in a
headless browser: login → dashboard → tickets → ticket detail → live timer write
persisting to SQLite, zero page errors.
