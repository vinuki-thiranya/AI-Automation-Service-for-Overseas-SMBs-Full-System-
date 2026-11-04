#!/usr/bin/env bash
# Static checks that run anywhere (no Docker needed): YAML/JSON parse, compose policy,
# client.json schema validation, shell syntax, and a secret scan of tracked files.
#   scripts/validate.sh
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_cmd npx git
PY=""
for c in python3 python; do   # on Windows, python3 may be a Store stub that doesn't run
  if "$c" -c 'import yaml' >/dev/null 2>&1; then PY=$c; break; fi
done
[[ -n "$PY" ]] || die "python3 with PyYAML is required (pip install pyyaml)"
cd "$REPO_ROOT"

log "docker-compose.yml policy"
"$PY" - infra/docker-compose.yml <<'PY'
import sys, yaml
doc = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
errors = []
for name, svc in doc["services"].items():
    image = svc.get("image", "")
    tag = image.rsplit(":", 1)[1] if ":" in image else ""
    if not tag or tag in ("latest", "stable", "next", "beta", "nightly"):
        errors.append(f"{name}: image '{image}' is not pinned to a version")
    if name != "caddy" and svc.get("ports"):
        errors.append(f"{name}: publishes ports; only caddy may")
    for k, v in (svc.get("environment") or {}).items():
        s = str(v)
        if any(w in k for w in ("PASSWORD", "KEY", "TOKEN", "SECRET")) and s and not s.startswith("${"):
            errors.append(f"{name}: {k} has an inline value; use ${{VAR}} from .env")
for svc in ("postgres", "n8n", "core"):
    if "healthcheck" not in doc["services"][svc]:
        errors.append(f"{svc}: missing healthcheck")
if errors:
    print("\n".join(errors)); sys.exit(1)
print(f"ok: {len(doc['services'])} services")
PY

log "JSON files parse"
"$PY" - <<'PY'
import json, pathlib, sys
bad = 0
files = [p for p in pathlib.Path(".").rglob("*.json") if "node_modules" not in p.parts and not p.name.endswith(".secrets.json") and not p.name.startswith("tsconfig")]  # tsconfig is JSONC
for p in files:
    try:
        json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"{p}: {e}"); bad += 1
print(f"ok: {len(files) - bad}/{len(files)} parse")
sys.exit(1 if bad else 0)
PY

log "client configs match config/client.schema.json"
for f in config/clients/*.json; do
  [[ "$f" == *.secrets.json ]] && continue
  npx -y -p ajv-cli@5.0.0 -p ajv-formats@3.0.1 ajv validate --spec=draft2020 -c ajv-formats \
    --strict=false --errors=line -s config/client.schema.json -d "$f"
done

log "shell syntax"
for f in scripts/*.sh infra/backup/*.sh; do bash -n "$f"; done
node --check webchat/widget.js
echo "ok"

if [[ -d node_modules ]]; then
  log "nuvadesk-core: typecheck, unit tests, 50-conversation QA (mock models)"
  npm run --silent typecheck
  npm test --silent
  npm run --silent qa
else
  warn "node_modules missing: run 'npm ci' to include core typecheck, tests and QA"
fi

log "secret scan of tracked files"
if git grep -nIE '((^|[^A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]{10,}|(^|[^A-Za-z0-9_-])sk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}|GOCSPX-[A-Za-z0-9_-]{20,}|1//0[A-Za-z0-9_-]{30,}|re_[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|[0-9]{8,10}:AA[A-Za-z0-9_-]{30,})' -- . ':!scripts/validate.sh'; then
  die "possible secret committed (see above)"
fi
echo "ok: nothing found"
