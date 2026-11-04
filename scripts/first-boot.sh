#!/usr/bin/env bash
# First boot of the control plane on a prepared VPS (after hetzner-setup.sh).
# Idempotent: safe to re-run; it never overwrites existing secrets.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_cmd docker openssl

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$INFRA_DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  die "created $ENV_FILE from the example — fill in DOMAIN, ACME_EMAIL, CLOUDFLARE_API_TOKEN, B2_* and TELEGRAM_*, then re-run"
fi
chmod 600 "$ENV_FILE"

# Generate machine secrets that are still placeholders.
for var in POSTGRES_PASSWORD N8N_ENCRYPTION_KEY; do
  if grep -qE "^${var}=CHANGE_ME$" "$ENV_FILE"; then
    sed -i "s|^${var}=CHANGE_ME$|${var}=$(openssl rand -hex 24)|" "$ENV_FILE"
    log "generated $var"
  fi
done

missing=$(grep -E '^[A-Z0-9_]+=CHANGE_ME$' "$ENV_FILE" | cut -d= -f1 || true)
[[ -z "$missing" ]] || die "still CHANGE_ME in infra/.env: $(echo $missing)"

# Deploy key for the nightly workflow export (write access on the GitHub repo).
mkdir -p "$INFRA_DIR/secrets"
chmod 700 "$INFRA_DIR/secrets"
if [[ ! -s "$INFRA_DIR/secrets/deploy_key" ]]; then
  if [[ -s "$HOME/.ssh/recallo_deploy" ]]; then
    cp "$HOME/.ssh/recallo_deploy" "$INFRA_DIR/secrets/deploy_key"
    log "reused deploy key from ~/.ssh/recallo_deploy"
  else
    ssh-keygen -q -t ed25519 -N '' -C "recallo-backup@$(hostname)" -f "$INFRA_DIR/secrets/deploy_key"
    warn "new deploy key — add this to GitHub → repo → Settings → Deploy keys, with WRITE access:"
    cat "$INFRA_DIR/secrets/deploy_key.pub"
  fi
fi
chmod 600 "$INFRA_DIR/secrets/deploy_key"

mkdir -p "$REPO_ROOT/n8n/workflows"

log "building images"
compose build --pull
log "starting stack"
compose up -d
wait_healthy postgres 120
wait_healthy n8n 240

load_env
cat <<EOF

Stack is up. Next steps (RUNBOOK.md → First boot):
  1. Open https://ops.${DOMAIN} and create the n8n owner account (use a password manager).
  2. n8n → Settings → n8n API → create an API key; set N8N_API_KEY in infra/.env.
  3. Run: make bootstrap      (installs the Telegram error workflow, recreates the backup container)
  4. Run: make smoke-test     (a deliberate failure should reach Telegram within a minute)
  5. Open https://status.${DOMAIN}, create the Uptime Kuma admin, add monitors (RUNBOOK.md → Monitoring).
  6. Copy N8N_ENCRYPTION_KEY from infra/.env into your password manager NOW.
EOF
