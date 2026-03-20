# AGENTS.md — v2.1

Instructions for AI agents working in this repository (**Nightscout / cgm-remote-monitor**).

## Non-negotiable safety rules

1) **Never print or inspect secrets** (API keys, tokens, database URIs, Better Stack credentials, session cookies, Heroku config, or contents of `.env` / `my.env` / similar).

2) **Do not commit or push** unless explicitly asked. Summarize changes first.

3) **For plan/workflow document edits**, increment the document’s version and update its changelog in the same change.

4) **If you stash at the beginning of a workflow, pop at the end.** The worktree should match the prior state aside from commits you were asked to make. Use `git stash -u` when untracked files matter.

## Self-review protocol

After completing any task that modifies **3 or more files**, or involves a refactor, rename, or architectural change, perform a review pass before presenting the result:

1. Re-read every file you modified from top to bottom.
2. Confirm imports/requires resolve and no references were broken.
3. Confirm the change is complete — no half-finished edits or stale TODOs.
4. Confirm naming is consistent across affected files.
5. Confirm the change matches the request — no scope creep, nothing missing.
6. If the project has an authoritative automated check for your change (e.g. `npm test`), run it when appropriate and when the environment allows.
7. If you find an issue, fix it and restart the review from step 1.
8. Only present the result once the review passes.

## Untracked files and `git clean`

- **`git clean -fd` removes untracked files.** Any local-only doc or script can be lost. Stash or commit before running clean/reset workflows you do not control.

## Better Stack MCP usage

**Read first:** [`docs/betterstack-guide.md`](docs/betterstack-guide.md) — MCP workflow (cloud connection → query), ClickHouse quirks, REST metrics API, dashboards, and **default `source_id` / table hints** for this deployment.

Agents may use the **`user-better-stack`** MCP server to query logs. If `telemetry_list_teams_tool` returns no teams or `telemetry_query` returns 401 / credential errors, configuration or tokens need fixing on the user side. See [Better Stack API token docs](https://betterstack.com/docs/logs/api/getting-started/#obtaining-a-logtail-api-token).

**Never log, echo, persist, or summarize credentials** from MCP tools or env files.

### Log search (summary)

1. Create a cloud connection before querying (defaults and failure handling: **`docs/betterstack-guide.md`**).
2. Run **`telemetry_query`** with SQL, **`table`**, and **`source_id`** as documented there.
3. Use **`telemetry_get_query_instructions_tool`** for schema and collection names when unsure.

### Interpretation

- Summarize in plain language before dumping raw rows.
- State when nothing relevant appears in the window.

## Diabetes & Nightscout safety guardrails

- Treat Nightscout and related CGM data as **observational telemetry**, not medical guidance.
- Do not infer intent, causality, or clinical meaning beyond what the data supports.
- For glucose-related summaries, use neutral phrasing (e.g. “a rapid rise was observed”, “data indicates a gap or delay”, “no anomalies were detected in the logs”).

**Goal:** Answer “what happened?” with clear, time-scoped, non-speculative summaries while respecting privacy and safety boundaries.

## Repo-specific notes (this codebase)

- **Tests:** `npm test` (see `package.json`; may require env such as `my.test.env` / `tests/ci.test.env` per project docs).
- **Sawtooth precompute job:** `lib/sawtooth-precompute/` — README and observability conventions live there.
- **Production server:** typically `node lib/server/server.js` / `npm start` — do not expose secrets when debugging.

## Reporting template

- Goal  
- Changes made (file-by-file)  
- Commands run  
- Result  
- If failure: top error excerpt + likely cause + next step  
- If success: sensible next step for the user  

---

## Changelog

### v2.1 (2026-03-20)
- Dropped the submodule safety rule — this repository does not use git submodules. Renumbered the remaining safety rules.

### v2 (2026-03-20)
- Removed references to other repositories and products. Better Stack details moved to **`docs/betterstack-guide.md`**; this file points there and keeps only a short MCP summary plus safety rules.

### v1 (2026-03-20)
- Initial version: safety, self-review, stash/clean, Better Stack MCP, diabetes guardrails, reporting.
