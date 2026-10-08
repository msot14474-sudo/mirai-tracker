#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 BACKUP_FILE" >&2
  exit 2
fi

archive=$1
checksum="$archive.sha256"
test -f "$archive"
test -f "$checksum"

shasum -a 256 -c "$checksum"
docker compose exec -T postgres pg_restore --list < "$archive" > /dev/null

check_database="mirai_restore_check_$(date +%s)_$$"
cleanup() {
  docker compose exec -T postgres sh -c \
    "dropdb -U \"\$POSTGRES_USER\" --if-exists \"$check_database\"" \
    > /dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

docker compose exec -T postgres sh -c \
  "createdb -U \"\$POSTGRES_USER\" \"$check_database\""
docker compose exec -T postgres sh -c \
  "pg_restore -U \"\$POSTGRES_USER\" -d \"$check_database\" --no-owner --no-acl" \
  < "$archive"
docker compose exec -T postgres sh -c \
  "psql -U \"\$POSTGRES_USER\" -d \"$check_database\" -v ON_ERROR_STOP=1 -Atc 'SELECT current_database();'" \
  > /dev/null

cleanup
trap - EXIT HUP INT TERM
echo "Backup verified by restoring into a temporary database: $archive"
