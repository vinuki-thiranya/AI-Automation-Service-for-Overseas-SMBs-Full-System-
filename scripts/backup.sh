#!/usr/bin/env bash
# Run the nightly backup now (pg_dump → B2), and optionally the workflow export to Git.
#   scripts/backup.sh            # database + Uptime Kuma backup
#   scripts/backup.sh --export   # also export n8n workflows to Git
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_cmd docker

log "running backup"
compose exec -T backup backup.sh

if [[ "${1:-}" == "--export" ]]; then
  log "exporting workflows to Git"
  compose exec -T backup export-workflows.sh
fi

log "remote backups:"
compose exec -T backup sh -c 'rclone lsl "b2:${B2_BUCKET}/${BACKUP_PREFIX}" | sort -k2,3 | tail -n 10'
