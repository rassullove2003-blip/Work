#!/usr/bin/env bash
# Применяет миграции и seed к временному локальному PostgreSQL и запускает проверки RLS.
# Требуется PostgreSQL 15+ (initdb, pg_ctl, psql). Docker и Supabase CLI не нужны.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
# initdb нельзя запускать от root: в этом случае работаем от пользователя postgres.
AS_PG=0
if [ "$(id -u)" = "0" ]; then chown postgres "$TMP"; AS_PG=1; fi
run() { if [ "$AS_PG" = 1 ]; then su postgres -s /bin/bash -c "$(printf '%q ' "$@")"; else "$@"; fi; }
cleanup() { run "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
run "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
run "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP" -l "$TMP/log" start >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "→ миграция $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
echo "→ seed.sql"; "${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
echo "→ проверки RLS"; "${PSQL[@]}" -o /dev/null -f "$ROOT/supabase/tests/rls_test.sql" 2>&1 | sed 's/^psql:.*NOTICE:  //'
