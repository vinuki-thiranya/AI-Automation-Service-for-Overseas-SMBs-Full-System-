#!/usr/bin/env bash
# Installs the system workflows into n8n through its public API:
#   - "System — Error → Telegram" (+ the agency/telegram-alerts credential)
#   - "System — Smoke test (always fails)" wired to that error workflow, activated
# Idempotent: existing workflows (matched by name) are left alone.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_cmd curl jq docker
load_env

TEMPLATES="$REPO_ROOT/n8n/templates/system"

find_workflow_id() { # <name>
  local cursor="" page id
  while :; do
    page=$(n8n_api GET "/workflows?limit=100${cursor:+&cursor=$cursor}")
    id=$(jq -r --arg n "$1" '.data[] | select(.name == $n) | .id' <<<"$page" | head -n1)
    [[ -n "$id" ]] && { echo "$id"; return 0; }
    cursor=$(jq -r '.nextCursor // empty' <<<"$page")
    [[ -n "$cursor" ]] || return 0
  done
}

# Recreate the backup container so it picks up N8N_API_KEY for the nightly export.
log "recreating backup container with the current infra/.env"
compose up -d backup

# 1. Error workflow
error_name=$(jq -r .name "$TEMPLATES/error-to-telegram.json")
error_id=$(find_workflow_id "$error_name")
if [[ -n "$error_id" ]]; then
  log "'$error_name' already exists ($error_id)"
else
  log "creating credential agency/telegram-alerts"
  cred_body=$(jq -n --arg t "$TELEGRAM_BOT_TOKEN" \
    '{name: "agency/telegram-alerts", type: "telegramApi", data: {accessToken: $t, baseUrl: "https://api.telegram.org"}}')
  cred_id=$(n8n_api POST /credentials "$cred_body" | jq -r .id)

  body=$(jq --arg chat "$TELEGRAM_CHAT_ID" --arg cred "$cred_id" '
      (.nodes[] | select(.type == "n8n-nodes-base.telegram") | .parameters.chatId) = $chat
    | (.nodes[] | select(.type == "n8n-nodes-base.telegram") | .credentials.telegramApi.id) = $cred
    ' "$TEMPLATES/error-to-telegram.json")
  error_id=$(n8n_api POST /workflows "$body" | jq -r .id)
  log "created '$error_name' ($error_id)"
fi

# 2. Smoke-test workflow
smoke_name=$(jq -r .name "$TEMPLATES/smoke-test-error.json")
smoke_id=$(find_workflow_id "$smoke_name")
if [[ -n "$smoke_id" ]]; then
  log "'$smoke_name' already exists ($smoke_id)"
else
  body=$(jq --arg e "$error_id" '.settings.errorWorkflow = $e' "$TEMPLATES/smoke-test-error.json")
  smoke_id=$(n8n_api POST /workflows "$body" | jq -r .id)
  log "created '$smoke_name' ($smoke_id)"
fi
n8n_api POST "/workflows/$smoke_id/activate" >/dev/null
log "smoke-test workflow active"

# 3. nuvadesk-core schedules (Phase 2): tick every 5 min, nightly rollup, hourly reports.
PACKAGES="$REPO_ROOT/n8n/templates/packages"
[[ -n "${CORE_JOB_TOKEN:-}" && "$CORE_JOB_TOKEN" != CHANGE_ME ]] || die "CORE_JOB_TOKEN is not set in infra/.env (re-run make first-boot)"
scheduler_name=$(jq -r .name "$PACKAGES/core-scheduler.json")
scheduler_id=$(find_workflow_id "$scheduler_name")
if [[ -n "$scheduler_id" ]]; then
  # Reuse the credential the existing scheduler already points at.
  core_cred_id=$(n8n_api GET "/workflows/$scheduler_id" | jq -r '[.nodes[] | .credentials.httpHeaderAuth.id? // empty][0]')
else
  log "creating credential agency/core-jobs"
  cred_body=$(jq -n --arg v "Bearer $CORE_JOB_TOKEN" '{name: "agency/core-jobs", type: "httpHeaderAuth", data: {name: "Authorization", value: $v}}')
  core_cred_id=$(n8n_api POST /credentials "$cred_body" | jq -r .id)
fi
for tpl in core-scheduler core-nightly core-reports; do
  name=$(jq -r .name "$PACKAGES/$tpl.json")
  id=$(find_workflow_id "$name")
  if [[ -z "$id" ]]; then
    body=$(sed -e "s/__CORE_JOBS_CREDENTIAL_ID__/$core_cred_id/g" -e "s/__ERROR_WORKFLOW_ID__/$error_id/g" "$PACKAGES/$tpl.json")
    id=$(n8n_api POST /workflows "$body" | jq -r .id)
    log "created '$name' ($id)"
  else
    log "'$name' already exists ($id)"
  fi
  n8n_api POST "/workflows/$id/activate" >/dev/null
done
log "core schedules active (credential $core_cred_id)"

cat <<EOF

Bootstrap done.
  Error workflow ID:          $error_id
  Core jobs credential ID:    $core_cred_id
Every production workflow must set Settings → Error workflow to the error workflow ID
(the templates and scripts/new-client.ts do this automatically).
Now run: make smoke-test
EOF
