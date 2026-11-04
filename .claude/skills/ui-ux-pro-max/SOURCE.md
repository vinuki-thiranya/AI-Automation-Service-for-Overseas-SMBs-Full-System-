# Source

- **Upstream:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (the original; many forks and repackaged copies exist, so don't update from those)
- **Release:** `v2.15.0`, commit `a38d04c3d5c298c851dbe5e6ee1965ee3de42cb5`, path `.claude/skills/ui-ux-pro-max/`
- **Vendored:** 2026-11-04
- **Licence:** MIT (`LICENSE`, copied from the repository root)
- **Not vendored:** `scripts/tests/` (upstream test suite and fixtures). The repository's other skills (banner-design, brand, design, design-system, slides, ui-styling), CLI and docs are also left out.

## Local changes
- `SKILL.md`: script paths `"${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py"` → `".claude/skills/ui-ux-pro-max/scripts/search.py"`. Run from the repo root; there is no plugin root in a project install.

## Review (2026-11-04)
- **Scripts** (`core.py`, `design_system.py`, `reasoning_contract.py`, `search.py`, `validate_data.py`): Python standard library only.
  - No network access (`urllib.parse` is used only to parse URLs in the data validator).
  - No subprocesses, `eval`/`exec`, environment secrets or telemetry; only `COLORTERM` is read.
  - File writes happen only with `--persist`, under `<output-dir>/design-system/<slug>/`. Slugs are sanitised against path traversal, and existing files aren't overwritten without `--force`.
- **Data and references** (CSV/JSON/MD) were scanned for instruction-injection phrasing. The only hits were ordinary UI guidance about password fields and env vars. URLs point to documentation sites (Google Fonts, framework docs, Apple, Android, W3C).
- **Smoke test:** `python -s -E .claude/skills/ui-ux-pro-max/scripts/search.py "healthcare clinic booking dashboard calm trustworthy" --design-system -p "Nuvadesk"` produced a design system and wrote no files.

To update: download a newer **tagged release** from the upstream repo into a scratch directory, diff against this folder, repeat the review above, then replace the files and update this file.
