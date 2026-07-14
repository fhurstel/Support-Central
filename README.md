# ReceiptPilot

Snap, upload, or forward your receipts and let AI file them — vendor, amount, date, tax, and
category extracted automatically, ready for expense reports and tax time.

This is a **frontend-only v1** built to the spec in [`design/DESIGN.md`](design/DESIGN.md). There is
no backend server: a mock API module backed by `localStorage` simulates the AI extraction pipeline
(Uploading → Extracting → Done) with artificial latency.

## Tech stack

- React 18 + Vite + TypeScript
- react-router-dom (routing)
- Zustand (state)
- Tailwind CSS (styling, no component library)
- Mock API + mock extraction persisted to `localStorage`
- Vitest (light unit tests for the mock modules)

## Getting started

```bash
npm install
npm run dev      # start the dev server (Vite prints the local URL)
```

Other scripts:

```bash
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build locally
npm test         # run the Vitest unit tests
```

On first load the app seeds ~11 sample receipts (a mix of uploaded and email-sourced, across all
categories, dates, and statuses) into `localStorage` so it's never empty.

To reset the sample data, clear the site's `localStorage` (or run `resetStore()` from
`src/api/mockApi.ts`).

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
  imageUrl: string;          // data URL (localStorage-backed)
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

## Swapping in a real backend / AI

The mock layers are isolated so a real integration is a one-file change:

- `src/api/mockApi.ts` — replace the `localStorage` CRUD functions with `fetch` calls; signatures
  stay the same.
- `src/api/mockExtraction.ts` — replace `extractReceipt(file)` with a call to the real extraction
  endpoint; the `ExtractedFields` return shape stays the same.
