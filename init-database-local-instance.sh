#!/bin/sh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cleanDatabase() {
  echo "Cleaning database..."
  if [ -z "$DATABASE_URL" ]; then
    echo "DATABASE_URL is not set. Cannot clean database." >&2
    exit 1
  fi
  psql -h localhost -p 5432 postgres -U postgres -c \
    "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;"
}
main() {
  if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    . "$SCRIPT_DIR/.env"
    set +a
  fi
  cleanDatabase
  echo "Resetting the database"
  pnpm run drizzle:migrate
}
main "$@"
