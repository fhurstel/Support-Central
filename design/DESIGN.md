# ReceiptPilot — Design Document

**Product name:** ReceiptPilot
**One-line pitch:** Snap, upload, or forward your receipts and let AI file them — vendor, amount, date, tax, and category extracted automatically, ready for expense reports and tax time.

Version: v1 design pass (2026-07-14). Design-only — no application code exists yet.

---

## 1. Information Architecture / Screen List

```
ReceiptPilot (web app, responsive: desktop + mobile browser)
│
├── /                → Dashboard / Receipt List  (default screen after load)
├── /upload          → Upload flow (modal on desktop, full-screen sheet on mobile)
├── /receipts/:id    → Receipt Detail (extracted data + original image, inline edit)
├── /inbox           → Connected Email Inbox (stub, UI only in v1)
└── /settings        → (out of scope v1 — nav placeholder only, no screen built)
```

Global navigation: a slim left sidebar on desktop (logo, Dashboard, Inbox, Settings-placeholder, "+ Add Receipt" button); collapses to a bottom tab bar + floating "+" action button on mobile widths (< 768px).

There is no auth in v1 — single-user local app. The layout leaves room for an avatar/account menu in the top bar so auth can be added later without redesign.

---

## 2. Screens

### 2.1 Dashboard / Receipt List (`/`)

**Purpose:** The home screen. Shows every receipt (uploaded or email-sourced) in one filterable, searchable list, with summary totals, so the user can see where their money went and jump into any receipt.

**Key UI elements:**
- Top bar: page title, search input (matches vendor name, free text), "+ Add Receipt" primary button.
- Summary strip: 3–4 stat tiles — Total this month, Receipt count, Pending review count, Top category. Tiles are informational only in v1 (not clickable filters, though "Pending review" may later deep-link to a filtered view).
- Filter row:
  - Category filter — pill/chip group (All, Meals, Travel, Office Supplies, Software, Utilities, Other).
  - Date range picker — presets (This month, Last month, Last 90 days, This year, All time) + custom from/to.
  - Vendor filter — populated from distinct vendors in the data (select or type-ahead).
  - "Clear filters" link appears when any filter is active.
- Receipt list:
  - Desktop: table rows — thumbnail, vendor, date, category chip (colored), amount (right-aligned), status badge (Processing / Needs review / Confirmed), source icon (upload ⬆ / email ✉).
  - Mobile: stacked cards with the same fields, thumbnail on the left.
  - Sorted by date descending by default; column-header sort on desktop (date, vendor, amount).
- Row click → Receipt Detail.
- Rows with status `needs_review` get a subtle amber left border / tint to draw the eye.

**States:**
- **Empty (no receipts at all):** Friendly illustration + "No receipts yet. Snap a photo or upload a file to get started." + prominent "+ Add Receipt" button. Secondary hint: "Or connect your email inbox" linking to /inbox.
- **Empty (filters exclude everything):** "No receipts match your filters." + Clear filters button. Summary tiles reflect the filtered (zero) set.
- **Loading:** Skeleton rows (shimmering placeholder table rows / cards) and skeleton stat tiles. No spinner-only screens.
- **Error:** Inline banner "Couldn't load receipts. Retry." with a retry button; list area shows the banner in place of rows.
- **Populated:** As described above. Receipts still processing show a pulsing "Processing" badge and grayed extracted fields ("—") until extraction completes.

### 2.2 Upload Flow (`/upload`, presented as modal/sheet over the dashboard)

**Purpose:** Get a receipt image or PDF into the system with as few taps as possible, and hand off to the (mocked) AI extraction step.

**Key UI elements:**
- Large drag-and-drop zone (desktop) with "Drop receipts here or **browse files**".
- File input accepts `image/*,.pdf` with `capture="environment"` hinting so mobile browsers offer the camera directly.
- Multi-file support: selected files appear as a queue of thumbnails with per-file progress.
- Per-file pipeline states shown inline: Uploading → Extracting (AI) → Done ✓ / Failed ✗ (retry link).
- After all files finish: "View receipts" button returns to the dashboard; newly extracted receipts land with status `needs_review`.

**States:**
- **Empty/initial:** Drop zone + browse button + supported-formats hint (JPG, PNG, HEIC, PDF, max 10 MB each).
- **Loading (in-flight):** Queue list with progress bars and stage labels; the mock extraction step includes an artificial 1–2 s delay so the "Extracting…" state is visible and the real integration slots in later without UX change.
- **Error:** Per-file error rows (unsupported type, too large, mock-extraction failure) with Retry / Remove; other files continue independently. Whole-flow errors are never blocking.
- **Populated (done):** All rows show ✓ with the extracted vendor + amount preview; primary action "View receipts".

### 2.3 Receipt Detail (`/receipts/:id`)

**Purpose:** Show one receipt's original image side-by-side with the AI-extracted fields, let the user verify and correct any field inline, and confirm the receipt.

**Key UI elements:**
- Two-pane layout: original image (zoomable, rotate button; PDF shows first-page render/placeholder) on the left ~55%, data panel on the right. Stacks vertically on mobile (image on top, collapsible).
- Data panel fields, each inline-editable (click-to-edit or always-editable inputs):
  - Vendor (text)
  - Amount (numeric) + Currency (select: USD default; USD/EUR/GBP/CAD in v1)
  - Date (date picker)
  - Category (select over the taxonomy — manual override of the AI's auto-sort)
  - Tax amount (numeric, may be empty)
- Metadata row (read-only): source (Upload / Email), status badge, createdAt.
- Fields the AI was unsure about (mock: randomly flag 0–1 fields) get an amber "Check this" marker.
- Actions: **Confirm** (sets status → confirmed), **Delete** (with confirm dialog), Back to dashboard. Edits save on blur/change (optimistic, with a small "Saved" toast); explicit Save button appears only on mobile stacked layout where blur is unreliable.
- Editing any field on a `needs_review` receipt does not auto-confirm; the user must press Confirm.

**States:**
- **Loading:** Skeleton image block + skeleton field rows.
- **Error (not found / load failure):** "Receipt not found" panel with link back to dashboard.
- **Processing (extraction not finished):** Image shows, data panel shows pulsing placeholders + "AI is reading this receipt…"; fields become editable when extraction lands.
- **Populated:** As above. `needs_review` shows the Confirm CTA prominently; `confirmed` shows a green check and a subdued "Re-open for edits" affordance (fields remain editable; editing a confirmed receipt keeps it confirmed).

### 2.4 Connected Email Inbox — stub (`/inbox`)

**Purpose:** UI-only preview of the future email integration: shows how receipts scanned from a connected inbox would flow into the same list, and sells the feature. No real email access in v1.

**Key UI elements:**
- Header: "Email Receipts" + a mock connection card ("gmail — hurstel@… • Connected" with a green dot) and a disabled "Manage connection" button labeled "Coming soon".
- A static/mocked list of 4–6 email-sourced receipts styled exactly like dashboard rows (source icon ✉), each with sender, subject line, received date, and the extracted vendor/amount — demonstrating parity with uploads. Rows link to normal Receipt Detail (these live in the same mock data store, `source: "email"`).
- Info banner: "Preview — email scanning ships in a later version. These are sample receipts."
- Empty-state variant (if user has no email samples): pitch panel "Connect your inbox and ReceiptPilot will find receipts automatically" + disabled Connect button ("Coming soon").

**States:**
- **Empty:** Pitch panel described above.
- **Loading:** Skeleton connection card + skeleton rows.
- **Error:** Same inline banner pattern as dashboard.
- **Populated:** Connection card + sample email-receipt rows + preview banner.

---

## 3. Data Model

Single core entity in v1. Stored via the mock API layer (see §5).

```ts
type Category =
  | "Meals" | "Travel" | "Office Supplies"
  | "Software" | "Utilities" | "Other";

type Receipt = {
  id: string;                 // uuid
  imageUrl: string;           // object URL / data URL in v1 (localStorage-backed)
  vendor: string;             // extracted, editable
  amount: number;             // total, extracted, editable
  currency: string;           // ISO 4217, default "USD"
  date: string;               // ISO date (YYYY-MM-DD) — receipt/transaction date
  category: Category;         // AI auto-sorted, user-overridable
  taxAmount: number | null;   // extracted; null when not found on receipt
  source: "upload" | "email";
  status: "processing" | "needs_review" | "confirmed";
  createdAt: string;          // ISO datetime — when the record entered the system
};
```

Status lifecycle: `processing` (extraction running) → `needs_review` (extraction done, awaiting user check) → `confirmed` (user pressed Confirm). Failed extraction stays visible on the upload queue with retry; a receipt record is only created once extraction (mock) succeeds, so the list never contains permanently broken rows.

## 4. Category Taxonomy (v1 defaults, fixed set)

1. **Meals** — restaurants, coffee, client dinners
2. **Travel** — flights, hotels, rideshare, parking, fuel
3. **Office Supplies** — stationery, hardware peripherals, furniture
4. **Software** — SaaS subscriptions, licenses, app purchases
5. **Utilities** — phone, internet, electricity
6. **Other** — anything the AI can't confidently place (also the fallback)

Custom categories are explicitly out of scope for v1; the type is a closed union to keep filtering and chip colors simple. Each category has a stable accent color used for its chip everywhere (see §6).

## 5. Suggested Tech Stack

Deliberately lightweight — buildable in a single follow-up coding pass.

- **Frontend:** React 18 + **Vite** (SPA, TypeScript).
- **Routing:** `react-router-dom` (4 routes as in §1).
- **State management:** React Query is overkill for a mock backend — use a single lightweight **Zustand** store (receipts array + filter state) fed by the mock API layer. No Redux.
- **Styling:** **Tailwind CSS** (+ a handful of shared component primitives: Button, Badge, Chip, Modal, Skeleton). No component library dependency; keeps bundle and design control tight.
- **Mock backend:** a plain in-app module `src/api/mockApi.ts` — async functions (`listReceipts`, `getReceipt`, `createReceipt`, `updateReceipt`, `deleteReceipt`) with artificial 300–800 ms latency, persisting to **localStorage** (JSON) and seeding ~10 sample receipts (including 4–5 with `source: "email"` for the inbox stub) on first run. Uploaded images stored as data URLs in localStorage (fine at v1 scale; swap for real storage later).
- **Mock AI extraction:** `src/api/mockExtraction.ts` — takes a File, waits 1–2 s, returns plausible randomized `{vendor, amount, date, category, taxAmount}` from a small sample-vendor table. Interface matches the future real endpoint (`extractReceipt(file): Promise<ExtractedFields>`) so swapping in a real API is a one-file change.
- **No server process** (no Express) — everything runs in the browser, `npm run dev` is the only command. If a server becomes necessary later, the mockApi module's function signatures become fetch calls.
- **Testing (light):** Vitest for the mockApi/extraction modules only; no E2E in v1.

## 6. Visual / UX Style Direction

Clean, calm, and finance-trustworthy: a white/near-white canvas (`#F8FAF9` app background, white cards) with **deep teal-green** (`#0F766E`) as the primary brand color — evokes money and reliability without banker-blue cliché — and warm **amber** (`#D97706`) reserved exclusively for "needs review" attention states. Generous whitespace, 12px-radius cards with hairline borders and soft shadows, Inter/system-ui typography with tabular numerals for amounts. Each category gets a soft pastel chip (teal Meals, sky Travel, violet Software, amber Office Supplies, slate Utilities, gray Other) so the list scans by color at a glance. Tone of voice is helpful and unfussy ("AI is reading this receipt…", "Looks good? Confirm it."). Mobile-first spacing: every control is thumb-sized, the primary "+ Add Receipt" action is always one tap away.

A static preview of the dashboard and detail screens lives at `design/mockup.html` (self-contained, open in any browser).
