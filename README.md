# ReceiptPilot

Snap, upload, or forward your receipts and let AI file them — vendor, amount, date, tax, and
category extracted automatically, ready for expense reports and tax time.

Built to the spec in [`design/DESIGN.md`](design/DESIGN.md). The React frontend talks to a small
Express + SQLite backend that stores receipts and runs AI extraction on uploaded images. Extraction
is **Claude-powered when an API key is configured, and falls back to a local mock otherwise**, so the
app works end to end with zero setup.

## Tech stack

- **Frontend:** React 18 + Vite + TypeScript, react-router-dom, Zustand, Tailwind CSS (no component library)
- **Backend:** Node + Express, SQLite via `better-sqlite3`, `multer` for uploads
- **AI extraction:** `@anthropic-ai/sdk` (Claude vision) with a randomized mock fallback
- Vitest (light unit tests for the API client modules)

## Getting started

```bash
npm install
npm run dev      # starts BOTH the Express API (:3001) and Vite (:5173) together
```

`npm run dev` runs the backend and frontend concurrently. Vite proxies `/api/*` to the Express server
(see `vite.config.ts`), so open the URL Vite prints and everything just works with one command.

Other scripts:

```bash
npm run dev:server   # run only the Express API (port 3001)
npm run dev:client   # run only the Vite dev server (port 5173)
npm run build        # type-check + production build to dist/
npm run preview      # serve the production build locally
npm test             # run the Vitest unit tests
```

### Optional: real Claude extraction

By default the server runs in **mock extraction mode** (randomized plausible fields) and prints a
notice on startup. To enable real Claude-powered extraction from receipt images:

```bash
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

When `ANTHROPIC_API_KEY` is set, `POST /api/extract` sends the uploaded image to Claude (model
`claude-sonnet-5`) with a vision prompt, parses the strict-JSON response, and validates/coerces the
fields. If the key is absent, malformed, or the call fails, it degrades gracefully to the mock. The
key is read from the environment and is never logged or persisted.

## Backend API

| Method | Route                 | Description                                        |
| ------ | --------------------- | -------------------------------------------------- |
| GET    | `/api/receipts`       | List all receipts (sorted by date descending)      |
| GET    | `/api/receipts/:id`   | Fetch one receipt (404 if missing)                 |
| POST   | `/api/receipts`       | Create a receipt                                   |
| PATCH  | `/api/receipts/:id`   | Update fields on a receipt                         |
| DELETE | `/api/receipts/:id`   | Delete a receipt                                   |
| POST   | `/api/extract`        | Extract fields from an uploaded image (multipart)  |

Data is persisted to `server/receipts.db` (SQLite, gitignored). On first run the DB is seeded with
~11 sample receipts (a mix of uploaded and email-sourced, across all categories, dates, and statuses)
so the app is never empty. To reset the sample data, delete `server/receipts.db` and restart.

## Screens

| Route            | Screen                                                                         |
| ---------------- | ------------------------------------------------------------------------------ |
| `/`              | Dashboard / Receipt list — stat tiles, category chips, filters, search, table  |
| `/upload`        | Upload flow — file/camera picker with the mocked Uploading → Extracting → Done pipeline |
| `/receipts/:id`  | Receipt detail — image + inline-editable extracted fields, Confirm / Delete    |
| `/inbox`         | Email inbox stub — UI-only preview of email-sourced receipts                   |

## Data model

```ts
type Receipt = {
  id: string;
  imageUrl: string;          // data URL (stored in SQLite)
  vendor: string;
  amount: number;
  currency: string;          // USD default; USD/EUR/GBP/CAD
  date: string;              // YYYY-MM-DD
  category: 'Meals' | 'Travel' | 'Office Supplies' | 'Software' | 'Utilities' | 'Other';
  taxAmount: number | null;
  source: 'upload' | 'email';
  status: 'processing' | 'needs_review' | 'confirmed';
  createdAt: string;         // ISO datetime
};
```

## Project layout

- `src/` — the React frontend.
  - `src/api/mockApi.ts` — the receipts API client (`fetch` calls to `/api/receipts`). The filename
    is kept for history; it is a thin REST client, not a mock. Signatures are unchanged from the
    original localStorage version so the store and components didn't need to change.
  - `src/api/mockExtraction.ts` — `extractReceipt(file)` posts the file to `/api/extract`.
- `server/` — the Express backend.
  - `server/index.js` — HTTP routes (CRUD + `/api/extract`) and CORS.
  - `server/db.js` — SQLite schema, seeding, and CRUD helpers.
  - `server/extract.js` — Claude vision extraction with the mock fallback.
  - `server/seed.js` / `server/receiptImage.js` — sample data (ported from `src/api/seed.ts`).
