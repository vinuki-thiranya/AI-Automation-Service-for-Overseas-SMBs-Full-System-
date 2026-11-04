# Recallo control plane — run on the VPS from the repo root.
# `make help` lists targets. Everything delegates to scripts/ so it also works without make.

COMPOSE := docker compose --project-directory infra -f infra/docker-compose.yml
s ?=

.DEFAULT_GOAL := help
.PHONY: help first-boot bootstrap smoke-test up down restart ps logs update backup export-workflows restore restore-list validate

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

first-boot: ## Generate secrets + deploy key, build and start the stack
	@bash scripts/first-boot.sh

bootstrap: ## Install system workflows in n8n (needs N8N_API_KEY in infra/.env)
	@bash scripts/n8n-bootstrap.sh

smoke-test: ## Trigger a deliberate workflow failure; expect a Telegram alert within a minute
	@set -a; . infra/.env; set +a; \
	curl -fsS -X POST "https://ops.$${DOMAIN}/webhook/system/smoke-test" -H 'Content-Type: application/json' -d '{"smoke":true}' && \
	echo "\nSent. Check Telegram."

up: ## Start (or reconcile) all services
	$(COMPOSE) up -d

down: ## Stop all services (volumes are kept)
	$(COMPOSE) down

restart: ## Restart one service: make restart s=n8n
	$(COMPOSE) restart $(s)

ps: ## Service status and health
	$(COMPOSE) ps

logs: ## Tail logs: make logs s=n8n (all services if s is empty)
	$(COMPOSE) logs -f --tail=200 $(s)

update: ## Pull main, back up, rebuild/pull pinned images, recreate
	@bash scripts/update.sh

backup: ## Run the database backup to B2 now
	@bash scripts/backup.sh

export-workflows: ## Export all n8n workflows to Git now
	@$(COMPOSE) exec -T backup export-workflows.sh

restore-list: ## List backups available in B2
	@bash scripts/restore.sh --list

restore: ## Restore newest backup (args: make restore ARGS="--from 20261104T020000Z --kuma")
	@bash scripts/restore.sh $(ARGS)

validate: ## Static checks (compose policy, JSON, schema, shell syntax, secret scan)
	@bash scripts/validate.sh
