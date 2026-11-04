# n8n/workflows — machine-written

The backup container writes this folder every night: it exports every workflow from the live n8n instance as `<slug>--<id>.json`, with `pinData` and `staticData` stripped.

- **Do not hand-edit these files.** Change templates in [`../templates/`](../templates/) and re-import them, or edit in n8n and let the export capture it.
- Restore from here with `make restore ARGS="--workflows-from-git"` (see [RUNBOOK.md](../../RUNBOOK.md) §6).
