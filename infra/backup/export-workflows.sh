#!/usr/bin/env bash
# Nightly: export every n8n workflow through the public API into n8n/workflows/ of a
# disposable clone of this repo, then commit and push with the deploy key.
# Only this script writes n8n/workflows/, so the clone is reset to origin each run.
set -Eeuo pipefail
SCRIPT_NAME=export-workflows.sh
source /usr/local/bin/lib.sh
trap 'on_error $LINENO' ERR

if [[ -z "${N8N_API_KEY:-}" || -z "${GIT_REPO_SSH:-}" ]]; then
  log "N8N_API_KEY or GIT_REPO_SSH not set — skipping workflow export (see RUNBOOK.md → First boot)"
  exit 0
fi

repo=/work/repo
out_rel=n8n/workflows
export GIT_SSH_COMMAND="ssh -i /run/secrets/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/work/known_hosts"

api() { curl -fsS -m 60 -H "X-N8N-API-KEY: ${N8N_API_KEY}" -H "Accept: application/json" "${N8N_API_URL}$1"; }

sync_clone() {
  if [[ ! -d "$repo/.git" ]]; then
    git clone --quiet --branch "$GIT_BRANCH" "$GIT_REPO_SSH" "$repo"
  fi
  git -C "$repo" fetch --quiet origin "$GIT_BRANCH"
  git -C "$repo" reset --quiet --hard "origin/$GIT_BRANCH"
}

export_all() {
  local dir="$repo/$out_rel" cursor="" page count=0
  # Deleted workflows must disappear from Git too, so start from an empty set of JSON files.
  mkdir -p "$dir"
  find "$dir" -maxdepth 1 -name '*.json' -delete
  while :; do
    page=$(api "/workflows?limit=100${cursor:+&cursor=$cursor}")
    # One file per workflow, named <slug>--<id>.json. Pinned test data and static
    # runtime state are stripped: they can hold customer data and churn every run.
    while IFS= read -r wf; do
      local id name slug
      id=$(jq -r '.id' <<<"$wf")
      name=$(jq -r '.name' <<<"$wf")
      slug=$(tr '[:upper:]' '[:lower:]' <<<"$name" | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-60)
      jq -S 'del(.pinData, .staticData)' <<<"$wf" >"$dir/${slug:-workflow}--${id}.json"
      count=$((count + 1))
    done < <(jq -c '.data[]' <<<"$page")
    cursor=$(jq -r '.nextCursor // empty' <<<"$page")
    [[ -n "$cursor" ]] || break
  done
  log "exported ${count} workflows"
}

for attempt in 1 2 3; do
  sync_clone
  export_all
  git -C "$repo" add -A "$out_rel"
  if git -C "$repo" diff --cached --quiet; then
    log "no workflow changes"
    exit 0
  fi
  git -C "$repo" -c user.name="$GIT_AUTHOR_NAME" -c user.email="$GIT_AUTHOR_EMAIL" \
    commit --quiet -m "n8n: nightly workflow export $(date -u +%F)"
  if git -C "$repo" push --quiet origin "HEAD:$GIT_BRANCH"; then
    log "pushed workflow export"
    exit 0
  fi
  log "push rejected (attempt ${attempt}) — refetching"
  sleep $((attempt * 10))
done
on_error "$LINENO"
