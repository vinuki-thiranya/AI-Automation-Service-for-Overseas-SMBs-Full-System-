#!/usr/bin/env bash
# Nightly: dump n8n's Postgres (and Supabase, if configured) plus Uptime Kuma data,
# upload to b2:<bucket>/<prefix>/<kind>/, prune anything older than the retention window.
set -Eeuo pipefail
SCRIPT_NAME=backup.sh
source /usr/local/bin/lib.sh
trap 'on_error $LINENO' ERR

stamp=$(date -u +%Y%m%dT%H%M%SZ)
dir=/work/dumps
mkdir -p "$dir"
remote="b2:${B2_BUCKET}/${BACKUP_PREFIX}"

upload() { # <local file> <kind>
  rclone copyto --checksum "$1" "${remote}/$2/$(basename "$1")"
  log "uploaded $(basename "$1") ($(du -h "$1" | cut -f1)) → ${remote}/$2/"
}

log "n8n postgres dump starting"
pg_dump --format=custom --no-owner --file "$dir/n8n-${stamp}.dump"
pg_restore --list "$dir/n8n-${stamp}.dump" >/dev/null   # proves the archive is readable
upload "$dir/n8n-${stamp}.dump" n8n

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  log "supabase dump starting"
  # Client data only: the public schema (+ app helpers). Supabase-managed schemas are recreated by the platform.
  pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
    --schema=public --schema=app --file "$dir/supabase-${stamp}.dump"
  pg_restore --list "$dir/supabase-${stamp}.dump" >/dev/null
  upload "$dir/supabase-${stamp}.dump" supabase
fi

if [[ -d /sources/uptime-kuma ]]; then
  tar -czf "$dir/uptime-kuma-${stamp}.tar.gz" -C /sources uptime-kuma
  upload "$dir/uptime-kuma-${stamp}.tar.gz" uptime-kuma
fi

log "pruning remote backups older than ${BACKUP_RETENTION_DAYS} days"
rclone delete --min-age "${BACKUP_RETENTION_DAYS}d" "$remote"

rm -f "$dir"/*
log "backup complete"

# Uptime Kuma push monitor: alerts if no successful backup checks in for 26 hours.
if [[ -n "${BACKUP_PUSH_URL:-}" ]]; then
  curl -fsS -m 10 -o /dev/null "${BACKUP_PUSH_URL}?status=up&msg=OK" || log "push monitor ping failed"
fi
