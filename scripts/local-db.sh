#!/usr/bin/env bash
#
# Stands up a throwaway Postgres, applies every migration in order, and starts
# the Neon HTTP shim so the unmodified application can run against it.
#
# Until this existed the accounting code could only run in production, which is
# why none of it ever had. One command now gets a real ledger on a laptop.
#
#   ./scripts/local-db.sh up      create, migrate, start the shim
#   ./scripts/local-db.sh reset   drop and rebuild from the migrations
#   ./scripts/local-db.sh down    stop the shim and the server
#
# Then, in another shell:
#   DATABASE_URL=postgresql://postgres@localhost:5433/kretivos \
#   NEON_HTTP_ENDPOINT=http://localhost:4444 npm run dev
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/var/lib/postgresql/kretiv}"
PGPORT="${PGPORT:-5433}"
PROXY_PORT="${PROXY_PORT:-4444}"
DB="${DB:-kretivos}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="postgresql://postgres@localhost:${PGPORT}/${DB}"

start_postgres() {
  if [ ! -d "$PGDATA/base" ]; then
    mkdir -p "$(dirname "$PGDATA")"
    chown postgres:postgres "$(dirname "$PGDATA")" 2>/dev/null || true
    su postgres -c "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
  fi
  if ! su postgres -c "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
    su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/server.log -o '-p $PGPORT -k /tmp' start" >/dev/null
    sleep 2
  fi
}

migrate() {
  # Ordered by filename, and the files are numbered, so sort is the sequence.
  for file in $(ls "$ROOT"/db/migrations/*.sql | sort); do
    if psql "$URL" -v ON_ERROR_STOP=1 -q -f "$file" >/dev/null 2>&1; then
      echo "  ok    $(basename "$file")"
    else
      echo "  FAIL  $(basename "$file")"
      psql "$URL" -v ON_ERROR_STOP=1 -f "$file" 2>&1 | grep -i error | head -3
      exit 1
    fi
  done
}

start_proxy() {
  pkill -f "neon-local-proxy.mjs" 2>/dev/null || true
  nohup node "$ROOT/scripts/neon-local-proxy.mjs" --port "$PROXY_PORT" --database "$URL" \
    > "${TMPDIR:-/tmp}/kretivos-neon-proxy.log" 2>&1 &
  disown 2>/dev/null || true
  sleep 1
}

case "${1:-up}" in
  up)
    start_postgres
    psql "postgresql://postgres@localhost:${PGPORT}/postgres" -q -tc \
      "select 1 from pg_database where datname='${DB}'" | grep -q 1 \
      || psql "postgresql://postgres@localhost:${PGPORT}/postgres" -q -c "create database ${DB};"
    echo "Applying migrations:"
    migrate
    start_proxy
    echo
    echo "DATABASE_URL=$URL"
    echo "NEON_HTTP_ENDPOINT=http://localhost:$PROXY_PORT"
    ;;
  reset)
    start_postgres
    pkill -f "neon-local-proxy.mjs" 2>/dev/null || true
    psql "postgresql://postgres@localhost:${PGPORT}/postgres" -q -c "drop database if exists ${DB};"
    psql "postgresql://postgres@localhost:${PGPORT}/postgres" -q -c "create database ${DB};"
    echo "Applying migrations:"
    migrate
    start_proxy
    echo "Reset complete."
    ;;
  down)
    pkill -f "neon-local-proxy.mjs" 2>/dev/null || true
    su postgres -c "$PGBIN/pg_ctl -D $PGDATA stop" >/dev/null 2>&1 || true
    echo "Stopped."
    ;;
  *)
    echo "Usage: $0 {up|reset|down}" >&2
    exit 1
    ;;
esac
