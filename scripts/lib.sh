#!/usr/bin/env bash
# Shared helpers for scripts/*.sh. Source it; don't run it.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infra"
ENV_FILE="$INFRA_DIR/.env"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

compose() { docker compose --project-directory "$INFRA_DIR" -f "$INFRA_DIR/docker-compose.yml" "$@"; }

require_cmd() { for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "'$c' is required but not installed"; done; }

load_env() {
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found — copy infra/.env.example and fill it in"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

# Wait until a compose service reports healthy (or running, for services without a healthcheck).
wait_healthy() { # <service> [timeout seconds]
  local svc=$1 timeout=${2:-180} waited=0 id state
  id=$(compose ps -q "$svc")
  [[ -n "$id" ]] || die "service $svc is not running"
  while :; do
    state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")
    [[ "$state" == healthy || "$state" == running ]] && { log "$svc is $state"; return 0; }
    (( waited >= timeout )) && die "$svc not healthy after ${timeout}s (state: $state) — check: make logs s=$svc"
    sleep 5; waited=$((waited + 5))
  done
}

# Call the n8n public API through Caddy (also proves TLS + routing end to end).
n8n_api() { # <METHOD> <path> [json body]
  local method=$1 path=$2 body=${3:-}
  [[ -n "${N8N_API_KEY:-}" ]] || die "N8N_API_KEY is empty in infra/.env — create one in the n8n UI first"
  curl -fsS -m 60 -X "$method" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" -H "Accept: application/json" \
    ${body:+--data "$body"} "https://ops.${DOMAIN}/api/v1${path}"
}
