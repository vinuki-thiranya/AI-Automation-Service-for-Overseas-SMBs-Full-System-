#!/usr/bin/env bash
# `docker compose run --rm backup <cmd>` runs a one-off command (e.g. backup.sh, restore-fetch);
# with no arguments the container runs the nightly schedule.
set -euo pipefail

if [[ $# -gt 0 ]]; then
  exec "$@"
fi

if [[ ! -s /run/secrets/deploy_key ]]; then
  echo "warning: /run/secrets/deploy_key missing or empty — workflow export to Git will fail" >&2
fi

exec supercronic -passthrough-logs /etc/recallo/crontab
