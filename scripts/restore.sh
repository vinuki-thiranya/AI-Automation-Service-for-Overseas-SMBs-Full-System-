#!/usr/bin/env bash
# Restore n8n (and optionally Uptime Kuma) from Backblaze B2.
#
#   scripts/restore.sh --list                      # show available backups
#   scripts/restore.sh [--from <timestamp>] [--kuma] [--workflows-from-git] [--yes]
#
#   --from <ts>            restore n8n-<ts>.dump (default: newest)
#   --kuma                 also restore the matching Uptime Kuma archive
#   --workflows-from-git   after the DB restore, re-import n8n/workflows/*.json from this checkout
#                          (use when the dump is older than the last Git export, or the dump is unusable)
#   --yes                  don't ask for confirmation
#
# The target n8n must use the SAME N8N_ENCRYPTION_KEY as the source, or every credential is unreadable.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_cmd docker
load_env

from="" kuma=false from_git=false yes=false list=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --from) from=$2; shift 2 ;;
    --kuma) kuma=true; shift ;;
    --workflows-from-git) from_git=true; shift ;;
    --yes) yes=true; shift ;;
    --list) list=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

remote_ls() { compose run --rm --no-deps -T backup sh -c "rclone lsf \"b2:\${B2_BUCKET}/\${BACKUP_PREFIX}/$1/\" | sort"; }

if $list; then
  for kind in n8n supabase uptime-kuma; do echo "== $kind"; remote_ls "$kind" | tail -n 15; done
  exit 0
fi

if [[ -z "$from" ]]; then
  dump=$(remote_ls n8n | tail -n 1)
  [[ -n "$dump" ]] || die "no n8n dumps found in b2:${B2_BUCKET}/${BACKUP_PREFIX}/n8n/"
else
  dump="n8n-${from}.dump"
fi
stamp=${dump#n8n-}; stamp=${stamp%.dump}

log "restore plan: n8n database ← ${dump}$($kuma && echo ", Uptime Kuma ← uptime-kuma-${stamp}.tar.gz")$($from_git && echo ", then workflows from Git")"
if ! $yes; then
  read -r -p "This REPLACES the current n8n database. Type 'restore' to continue: " answer
  [[ "$answer" == restore ]] || die "aborted"
fi

log "stopping n8n"
compose stop n8n
compose up -d postgres backup
wait_healthy postgres 120

log "downloading ${dump}"
compose exec -T backup sh -c "mkdir -p /work/restore && rclone copyto \"b2:\${B2_BUCKET}/\${BACKUP_PREFIX}/n8n/${dump}\" /work/restore/${dump}"

log "restoring database"
compose exec -T backup sh -c "pg_restore --clean --if-exists --no-owner --dbname=\"\$PGDATABASE\" /work/restore/${dump}"

if $kuma; then
  archive="uptime-kuma-${stamp}.tar.gz"
  log "restoring Uptime Kuma from ${archive}"
  compose exec -T backup sh -c "rclone copyto \"b2:\${B2_BUCKET}/\${BACKUP_PREFIX}/uptime-kuma/${archive}\" /work/restore/${archive}"
  compose stop uptime-kuma
  # The backup container mounts Kuma's volume read-only, so unpack with a throwaway container.
  docker run --rm \
    -v recallo_uptime_kuma_data:/sources/uptime-kuma \
    -v recallo_backup_work:/work \
    alpine:3.24.3 sh -c "rm -rf /sources/uptime-kuma/* && tar -xzf /work/restore/${archive} -C /sources"
  compose start uptime-kuma
fi

compose exec -T backup sh -c 'rm -rf /work/restore'

log "starting n8n"
compose up -d n8n
wait_healthy n8n 300

if $from_git; then
  log "re-importing workflows from n8n/workflows (overwrites by workflow ID)"
  compose exec -T n8n n8n import:workflow --separate --input=/opt/recallo/n8n/workflows
  compose restart n8n
  wait_healthy n8n 300
fi

log "restore complete. Verify: open https://ops.${DOMAIN}, check credentials open without errors, run 'make smoke-test'."
