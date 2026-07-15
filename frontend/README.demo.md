# Offline interactive demo build

A self-contained build of the SPA that runs entirely in the browser with **no
backend** — useful for sharing a clickable preview (e.g. as a hosted static
file) where you can't expose the API.

## What it is

- `src/main.demo.jsx` — demo entry: installs the mock, then boots the app under
  a `HashRouter` (so client-side routes work from a single static file).
- `src/demoMock.js` — overrides `window.fetch`; serves baked-in data for `/api`
  reads and applies writes (comments, timers, status, etc.) in memory.
- `src/demoData.json` — snapshot of synthetic seed responses captured from the
  backend. All identities are `.test` / 555 synthetic data — no real records.
- `vite.config.demo.js` — single-bundle build (`inlineDynamicImports`, CSS not
  split) so the output can be inlined into one HTML file.

The real app is untouched: `main.jsx` (BrowserRouter, real API) remains the
canonical entry, and none of these files are imported by it.

## Build

```bash
cd frontend
npm run build:demo          # -> ../dist-demo/{app.js,app.css,index.demo.html}
```

To produce a single self-contained HTML file, inline `dist-demo/app.css` and
`dist-demo/app.js` into one page (and inline the two `assets/bg-*.svg` the CSS
references as `data:` URIs).

## Refreshing the baked data

With the backend running and seeded, re-capture the API responses into
`src/demoData.json` (log in as the demo admin, GET each list/detail endpoint,
follow the trailing-slash redirects), then rebuild.
