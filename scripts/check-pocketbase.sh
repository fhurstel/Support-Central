#!/usr/bin/env bash
# End-to-end contract check for the PocketBase compatibility layer.
#
# Boots a throwaway PocketBase on port 18099 with a fresh pb_data, logs in, and
# asserts every endpoint the 2026-07-16 review added/fixed returns the expected
# data. Then restarts the server on the SAME pb_data and asserts a created
# record survived (persistence). Exits non-zero on the first failed assertion.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PB_DIR="$ROOT/pocketbase"
PORT=18099
B="http://127.0.0.1:$PORT"
# PocketBase resolves pb_hooks/pb_migrations relative to pb_data's PARENT dir,
# so the throwaway pb_data lives in a temp base that links to the real ones.
BASE="$(mktemp -d)"
ln -s "$PB_DIR/pb_hooks" "$BASE/pb_hooks"
ln -s "$PB_DIR/pb_migrations" "$BASE/pb_migrations"
DATA="$BASE/pb_data"
LOG="$(mktemp)"
PB_PID=""

RED=$'\033[31m'; GRN=$'\033[32m'; NC=$'\033[0m'
fails=0
pass() { echo "${GRN}PASS${NC} $1"; }
fail() { echo "${RED}FAIL${NC} $1"; fails=$((fails + 1)); }

cleanup() {
  if [[ -n "$PB_PID" ]]; then kill "$PB_PID" 2>/dev/null || true; fi
  # Belt-and-braces: free the port if something is still listening.
  local p
  p=$(ss -ltnp 2>/dev/null | grep ":$PORT" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)
  [[ -n "${p:-}" ]] && kill "$p" 2>/dev/null || true
  rm -rf "$BASE" "$LOG"
}
trap cleanup EXIT

start_pb() {
  ( cd "$PB_DIR" && ./pocketbase serve --http=127.0.0.1:$PORT --dir="$DATA" >"$LOG" 2>&1 ) &
  PB_PID=$!
  for _ in $(seq 1 40); do
    if curl -fs "$B/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 0.25
  done
  echo "PocketBase did not come up; log:"; cat "$LOG"; exit 1
}
stop_pb() {
  [[ -n "$PB_PID" ]] && kill "$PB_PID" 2>/dev/null || true
  wait "$PB_PID" 2>/dev/null || true
  PB_PID=""
}

login() {
  curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))'
}

# python assertion helper: reads JSON from stdin, evaluates EXPR (var d),
# prints nothing; exits 0 if truthy else 1.
assert_json() { python3 -c "import sys,json
d=json.load(sys.stdin)
sys.exit(0 if ($1) else 1)"; }

echo "== boot fresh PocketBase =="
rm -rf "$DATA"
start_pb
grep -iqE 'error|panic' "$LOG" && { echo "startup log contains errors:"; cat "$LOG"; exit 1; }
pass "fresh pb_data boots clean"

TOK=$(login admin@example.test 'DevAdmin123!')
[[ -n "$TOK" ]] && pass "admin login" || { fail "admin login"; exit 1; }
GTOK=$(login guest@example.test 'DevGuest123!')
[[ -n "$GTOK" ]] && pass "guest login" || fail "guest login"

h() { curl -s -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' "$@"; }
g() { curl -s -H "Authorization: Bearer $GTOK" -H 'Content-Type: application/json' "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# A1 — voice settings POST persists + echoes
h -X POST "$B/api/settings/voice-agent" -d '{"provider":"nvidia_nim","nvidia_nim_model":"nvidia/nemotron-3-super-120b-a12b:free"}' \
  | assert_json 'd["provider"]=="nvidia_nim" and d["nvidia_nim_model"]=="nvidia/nemotron-3-super-120b-a12b:free" and len(d["available_models"])>0' \
  && pass "A1 voice-settings POST" || fail "A1 voice-settings POST"
h "$B/api/settings/voice-agent" | assert_json 'd["provider"]=="nvidia_nim"' \
  && pass "A1 voice-settings GET reflects save" || fail "A1 voice-settings GET reflects save"

# A3 — lead create + approve => converted_ticket_id set + ticket exists
LID=$(h -X POST "$B/api/leads" -d '{"source":"WEB","sender_name":"Check User","subject":"Need help"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
[[ -n "$LID" ]] && pass "A3 lead create (#$LID)" || fail "A3 lead create"
CTID=$(h -X POST "$B/api/leads/$LID/review" -d '{"action":"approve","client_id":1,"title":"From lead"}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["converted_ticket_id"] if d.get("status")=="CONVERTED" and d.get("converted_ticket_id") else "")')
[[ -n "$CTID" ]] && pass "A3 approve sets converted_ticket_id (#$CTID) + status CONVERTED" || fail "A3 approve conversion"
h "$B/api/tickets/$CTID" | assert_json 'd["client_id"]==1 and d["title"]=="From lead"' \
  && pass "A3 converted ticket exists with client attached" || fail "A3 converted ticket exists"

# A4 — client members add/edit/delete
MID=$(h -X POST "$B/api/clients/1/members" -d '{"name":"Jane Doe","personal_phone":"555-0999","is_primary":true}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
[[ -n "$MID" ]] && pass "A4 client member add (#$MID)" || fail "A4 client member add"
h -X PATCH "$B/api/clients/1/members/$MID" -d '{"role":"IT Manager"}' | assert_json 'd["role"]=="IT Manager" and d["personal_phone"]=="555-0999"' \
  && pass "A4 client member edit" || fail "A4 client member edit"
h -X DELETE "$B/api/clients/1/members/$MID" >/dev/null
h "$B/api/clients/1/members" | assert_json 'all(m["id"]!='"$MID"' for m in d)' \
  && pass "A4 client member delete (soft, hidden from list)" || fail "A4 client member delete"

# A5 — invoice create
h -X POST "$B/api/invoices" -d '{"client_id":1,"ticket_id":1,"notes":"n"}' \
  | assert_json 'd["invoice_number"].startswith("INV-") and d["total_amount"]>=0' \
  && pass "A5 invoice create" || fail "A5 invoice create"

# A6 — ticket members add/remove + serTicket members
h -X POST "$B/api/tickets/1/members" -d '{"user_id":2}' >/dev/null
h "$B/api/tickets/1" | assert_json 'any(m["id"]==2 for m in d["members"]) and "2" in d["member_ids_json"]' \
  && pass "A6 ticket member add appears in serTicket members + member_ids_json" || fail "A6 ticket member add"
h -X DELETE "$B/api/tickets/1/members/2" >/dev/null
h "$B/api/tickets/1" | assert_json 'all(m["id"]!=2 for m in d["members"])' \
  && pass "A6 ticket member remove" || fail "A6 ticket member remove"

# A7 — ticket copy (labels + checklists copied, (copy) suffix)
COPYID=$(h -X POST "$B/api/tickets/1/copy" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["id"] if d["title"].endswith("(copy)") and len(d["labels"])>=1 and len(d["checklists"])>=1 else "")')
[[ -n "$COPYID" ]] && pass "A7 ticket copy (#$COPYID, labels+checklists+suffix)" || fail "A7 ticket copy"

# A8 — ticket delete
h -X DELETE "$B/api/tickets/$COPYID" >/dev/null
[[ "$(code -H "Authorization: Bearer $TOK" "$B/api/tickets/$COPYID")" == "404" ]] \
  && pass "A8 ticket delete (gone after)" || fail "A8 ticket delete"

# A2 — time entry PATCH + DELETE
h -X PATCH "$B/api/tickets/1/time/1" -d '{"description":"edited","duration_seconds":3600}' \
  | assert_json 'd["description"]=="edited" and d["duration_seconds"]==3600' \
  && pass "A2 time entry PATCH" || fail "A2 time entry PATCH"
h -X DELETE "$B/api/tickets/3/time/2" >/dev/null
h "$B/api/tickets/3/time" | assert_json 'all(e["id"]!=2 for e in d)' \
  && pass "A2 time entry DELETE" || fail "A2 time entry DELETE"

# A9 — call log create
h -X POST "$B/api/call-logs" -d '{"channel":"PHONE","direction":"INBOUND","caller_name":"Bob"}' \
  | assert_json 'd["channel"]=="PHONE" and d["direction"]=="INBOUND" and d["id"]>0' \
  && pass "A9 call-log create" || fail "A9 call-log create"
h "$B/api/call-logs" | assert_json 'len(d)>=1' && pass "A9 call-log list" || fail "A9 call-log list"

# A10 — board reorder persists after re-fetch
h -X POST "$B/api/board/reorder" -d '{"items":[{"ticket_id":2,"status":"DONE","position":99}]}' >/dev/null
h "$B/api/tickets/2" | assert_json 'd["status"]=="DONE" and d["position"]==99' \
  && pass "A10 board reorder persists" || fail "A10 board reorder persists"

# A11 — GUEST cannot see PRIVATE comments; guest mutations blocked
ADMIN_CT=$(h "$B/api/comments/ticket/1" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
GUEST_HAS_PRIVATE=$(g "$B/api/comments/ticket/1" | python3 -c 'import sys,json;print(any(c["visibility"]=="PRIVATE" for c in json.load(sys.stdin)))')
[[ "$GUEST_HAS_PRIVATE" == "False" && "$ADMIN_CT" -ge 1 ]] \
  && pass "A11 GUEST cannot see PRIVATE comments (admin sees $ADMIN_CT)" || fail "A11 GUEST private comment leak"
[[ "$(code -X POST -H "Authorization: Bearer $GTOK" -H 'Content-Type: application/json' -d '{"name":"x"}' "$B/api/labels")" == "403" ]] \
  && pass "A11 GUEST label create blocked (403)" || fail "A11 GUEST label create blocked"
[[ "$(code -X POST -H "Authorization: Bearer $GTOK" -H 'Content-Type: application/json' -d '{"client_id":1}' "$B/api/invoices")" == "403" ]] \
  && pass "A11 GUEST invoice create blocked (403)" || fail "A11 GUEST invoice create blocked"

# A12 — poppy stubs return non-404 graceful data
[[ "$(code -H "Authorization: Bearer $TOK" "$B/api/poppy/boards")" == "200" ]] \
  && pass "A12 poppy/boards non-404" || fail "A12 poppy/boards non-404"
h "$B/api/poppy/boards" | assert_json 'd["boards"]==[]' && pass "A12 poppy/boards empty data" || fail "A12 poppy/boards empty data"

# activity coverage — created on ticket create, moved on PATCH status change
NTID=$(h -X POST "$B/api/tickets" -d '{"title":"Activity check","status":"NEW"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
h -X PATCH "$B/api/tickets/$NTID" -d '{"status":"IN_PROGRESS"}' >/dev/null
h "$B/api/tickets/$NTID/activity" | assert_json 'any(a["type"]=="created" for a in d) and any(a["type"]=="moved" for a in d)' \
  && pass "B activity: created + moved logged" || fail "B activity: created + moved logged"

echo "== restart on same pb_data (persistence) =="
stop_pb
start_pb
TOK=$(login admin@example.test 'DevAdmin123!')
h "$B/api/tickets/$CTID" | assert_json 'd["title"]=="From lead"' \
  && pass "persistence: converted ticket #$CTID survived restart" || fail "persistence after restart"
h "$B/api/call-logs" | assert_json 'len(d)>=1' \
  && pass "persistence: call-log survived restart" || fail "persistence: call-log survived restart"

echo
if [[ "$fails" -eq 0 ]]; then
  echo "${GRN}All PocketBase contract checks passed.${NC}"
else
  echo "${RED}$fails check(s) failed.${NC}"; exit 1
fi
