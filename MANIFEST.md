# Export Manifest

- Package: Fiji IT Service Desk — Claude Code Workspace
- Prepared: 2026-07-14T18:29:25Z
- Source snapshot: `/root/fiji-it-solutions`
- Source files in sanitized workspace before this manifest: 77
- Uncompressed source size before this manifest: 964,821 bytes

## Verification completed

- Fresh Python 3.10 virtual environment created from `uv.lock`
- Backend dependencies installed with `uv sync --locked`
- Python source compiled successfully
- FastAPI application imported successfully
- Fresh SQLite database initialized
- Synthetic seed completed: users, clients, leads, tickets, time entries, comments, knowledge base, invoices, RustDesk devices, and remote sessions
- Checked model/schema alignment for users, clients, client members, tickets, and leads
- Live test API returned `{"status":"healthy","db":"ok"}`
- OpenAPI JSON generated successfully
- Frontend dependencies installed from `package-lock.json`
- Frontend production build completed with Vite 7.3.6
- `npm audit` returned zero vulnerabilities
- Missing SVG build assets were restored under `frontend/public/assets/`
- Credential signature scan returned zero hits
- Forbidden file scan returned zero `.env`, database, backup, private-key, or certificate files
- Symlink scan returned zero symlinks

## Intentionally excluded

- Live `.env` and credentials
- Production and backup databases
- Customer records and uploads
- Voice-agent runtime settings
- RustDesk key material
- `node_modules`
- Python virtual environments
- Generated frontend build
- Caches, logs, bytecode, and Git history from the source server

## Portability/security changes in this export

- Environment-driven CORS, runtime settings, upload, RustDesk, and public URL paths
- Dedicated voice-agent backend token handling; no provider-key reuse
- Public token-prefix debug endpoint removed
- Synthetic seed identities and configurable seed passwords
- Environment-driven schema utilities
- Added missing `python-multipart` dependency
- Updated React Router and Vite to patched versions
- Added clean setup, development, verification, and deployment templates
