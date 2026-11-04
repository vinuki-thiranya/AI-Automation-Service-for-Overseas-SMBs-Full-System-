#!/usr/bin/env bash
# Update the control plane to the versions pinned in the current main branch.
# Always takes a fresh backup first, so a bad upgrade can be rolled back with restore.sh.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_cmd docker git
load_env

log "pulling latest main"
git -C "$REPO_ROOT" pull --ff-only

log "pre-update backup"
compose exec -T backup backup.sh

log "building and pulling pinned images"
compose build --pull
compose pull --ignore-buildable

log "recreating changed services"
compose up -d --remove-orphans
wait_healthy postgres 120
wait_healthy n8n 300

docker image prune -f >/dev/null
log "update complete — check https://ops.${DOMAIN} and https://status.${DOMAIN}"
