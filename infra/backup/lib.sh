#!/usr/bin/env bash
# Shared helpers for the backup container scripts.

log() { printf '%s [%s] %s\n' "$(date -u +%FT%TZ)" "${SCRIPT_NAME:-backup}" "$*"; }

# Post to the ops Telegram chat; silently skipped when not configured.
notify() {
  [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]] || return 0
  curl -fsS -m 15 -o /dev/null \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$1" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" || log "telegram notify failed"
}

# Run on any failing command: log it, alert, exit non-zero.
on_error() {
  local line=$1
  log "FAILED at line ${line}"
  notify "❌ Nuvadesk ${SCRIPT_NAME:-backup} failed on $(hostname) at line ${line}. Check: docker compose logs backup"
  exit 1
}
