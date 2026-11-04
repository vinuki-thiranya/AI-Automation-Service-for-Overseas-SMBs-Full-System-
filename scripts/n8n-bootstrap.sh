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

cat <<EOF

Bootstrap done. Error workflow ID: $error_id
Every production workflow must set Settings → Error workflow to this ID
(Phase 2 templates and scripts/new-client.ts do this automatically).
Now run: make smoke-test
EOF
