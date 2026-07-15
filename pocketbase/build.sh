#!/usr/bin/env bash
# Build the SPA and stage it for the PocketBase build.
#   ./build.sh            # build frontend -> pb_public
#   ./build.sh --binary   # also compile the self-contained Go binary (needs Go)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERE="$ROOT/pocketbase"

echo "==> Building frontend"
(cd "$ROOT/frontend" && npm ci && npm run build)

echo "==> Staging SPA into pocketbase/pb_public"
rm -rf "$HERE/pb_public" && mkdir -p "$HERE/pb_public"
cp -r "$ROOT/dist/." "$HERE/pb_public/"

if [[ "${1:-}" == "--binary" ]]; then
  echo "==> Compiling PocketBase binary"
  (cd "$HERE" && go build -o pocketbase .)
  echo "Done. Run: cd pocketbase && ./pocketbase serve --http=0.0.0.0:8090"
else
  echo "Done. pb_public is ready. Deploy with a standard PocketBase binary or PocketHost."
fi
