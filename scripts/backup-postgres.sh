#!/bin/sh
set -eu

umask 077
backup_dir=${1:-backups}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$backup_dir/mirai-tracker-$timestamp.dump"
temporary="$archive.tmp"

mkdir -p "$backup_dir"
trap 'rm -f "$temporary"' EXIT HUP INT TERM

docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$temporary"

test -s "$temporary"
mv "$temporary" "$archive"
shasum -a 256 "$archive" > "$archive.sha256"
trap - EXIT HUP INT TERM

echo "Backup created: $archive"
echo "Checksum created: $archive.sha256"
