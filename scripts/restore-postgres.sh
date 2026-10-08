#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: MIRAI_RESTORE_CONFIRM=RESTORE_MIRAI_TRACKER $0 BACKUP_FILE" >&2
  exit 2
fi

if [ "${MIRAI_RESTORE_CONFIRM:-}" != "RESTORE_MIRAI_TRACKER" ]; then
  echo "Restore refused: set MIRAI_RESTORE_CONFIRM=RESTORE_MIRAI_TRACKER after reviewing the recovery runbook." >&2
  exit 2
fi

archive=$1
checksum="$archive.sha256"
test -f "$archive"
test -f "$checksum"
shasum -a 256 -c "$checksum"
docker compose exec -T postgres pg_restore --list < "$archive" > /dev/null

docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' \
  < "$archive"

echo "Database restored from: $archive"
