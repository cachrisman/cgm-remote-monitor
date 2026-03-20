# Better Stack guide (Nightscout / cgm-remote-monitor)

**Version:** v1.0  
**Last updated:** 2026-03-20

Operational reference for Better Stack: log queries (MCP), metrics extraction (REST), and dashboards. Use with root **`AGENTS.md`** (safety and guardrails).

---

## Authentication

The Better Stack API token is usually **`BETTERSTACK_API_TOKEN`** in process environment (e.g. Heroku config vars, local `.env` — never commit it). The same token may be configured in Cursor’s MCP settings for the **`user-better-stack`** server.

**Never print, log, persist, or summarize the token** (or any value returned by `telemetry_create_cloud_connection_tool`).

---

## Key IDs (this deployment)

| Resource | ID | Notes |
|----------|-----|--------|
| Team | `491594` | Used for MCP `create_cloud_connection` defaults. |
| Logs source (Nightscout) | `1659378` | Default when querying this app’s logs. |

Other log or metric sources in the same team (cron workers, separate services) have their own `source_id` values — **discover** them with `telemetry_list_sources_tool` if the default source is wrong.

---

## Log queries via MCP (`user-better-stack`)

### 1) Create a cloud connection (required before queries)

Call **`telemetry_create_cloud_connection_tool`** with **`team_id` `491594`** and **`source_id` `1659378`** for standard Nightscout log queries.

If that fails (e.g. no team, 401): call **`telemetry_list_teams_tool`** with `{}`, then **`telemetry_list_sources_tool`** with `{"team_id": <id>}`, pick the correct source, and retry **`create_cloud_connection`**.

### 2) Run queries

**`telemetry_query`** with:

- **query** — ClickHouse SQL (see below).
- **table** — e.g. `t491594.nightscout_chrisman_io` for this deployment’s Nightscout logs (adjust if your team/source slug differs).
- **source_id** — `1659378` when using that source.

### 3) Schema and collection names

**`telemetry_get_query_instructions_tool`** with `{"id": <source_id>, "source_type": "logs"}` returns collection names, `raw` JSON fields, and examples. Use it to confirm **hot** vs **S3** table names for long time ranges.

---

## ClickHouse query notes

- **CTE syntax:** `WITH alias AS (expr)` for **scalar** expressions does **not** work in this ClickHouse build. Inline expressions or use a subquery to define aliases.
- **Hot buffer vs full history:** The `remote(...)` hot table holds roughly the **last ~30–40 minutes**. For “last 24 hours” or similar, you usually need **`remote(...)` UNION ALL `s3Cluster(..., ..._s3)`** with the same time bounds on both branches. Exact names come from **`telemetry_get_query_instructions_tool`** for your `source_id`.
- **Recent only:** For the last hour, `FROM remote(<team_source_logs>)` with `WHERE dt > now() - INTERVAL 1 HOUR` is often enough.
- **Message text:** Frequently in the `raw` JSON column, e.g. `JSONExtract(raw, 'message', 'Nullable(String)')`.
- **High volume:** Column **`_pattern`** can be used to group: `GROUP BY _pattern ORDER BY count(*) DESC`.
- **Always** bound time and use a sensible **`LIMIT`**.

### Example patterns (Nightscout source; adjust table/collection names if needed)

Use with the **`table`** and **`source_id`** your connection expects:

- **Volume (hot, last 18h):**  
  `SELECT count(*) AS events_18h FROM remote(t491594_nightscout_chrisman_io_logs) WHERE dt > now() - INTERVAL 18 HOUR`
- **Top patterns:**  
  `SELECT _pattern, count(*) AS cnt FROM remote(t491594_nightscout_chrisman_io_logs) WHERE dt > now() - INTERVAL 18 HOUR GROUP BY _pattern ORDER BY cnt DESC LIMIT 20`

If these collection names fail, use **`telemetry_get_query_instructions_tool`** and substitute the documented names.

---

## Metrics extraction rules (REST API)

The MCP server does **not** create or manage metric extraction rules. Use the **Better Stack REST API**.

### Endpoints

| Action | Method | URL |
|--------|--------|-----|
| List metrics | `GET` | `/api/v2/sources/{source_id}/metrics` |
| Create metric | `POST` | `/api/v2/sources/{source_id}/metrics` |
| Update metric | `PATCH` | `/api/v2/sources/{source_id}/metrics/{metric_id}` |
| Delete metric | `DELETE` | `/api/v2/sources/{source_id}/metrics/{metric_id}` |

Base URL: `https://telemetry.betterstack.com`

### Example (create metric on Nightscout log source)

Replace `{token}` with the real bearer token via env (do not paste tokens into chat or commits):

```bash
curl -X POST \
  "https://telemetry.betterstack.com/api/v2/sources/1659378/metrics" \
  -H "Authorization: Bearer $BETTERSTACK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "metric",
    "attributes": {
      "name": "example_log_counter",
      "sql": "CASE WHEN JSONExtractString(raw, '\''message'\'') LIKE '\''%sawtooth-precompute pushed%'\'' THEN 1 ELSE 0 END",
      "type": "sum"
    }
  }'
```

### Design patterns

- **Regex on structured log lines:** `extract(JSONExtractString(raw, 'message'), 'field_name=([^ ]+)')`
- **Aggregations:** `sum`, `count`, `avg`, `max`, `quantiles` — map to ClickHouse merge functions in dashboards.
- **Extraction rules are not retroactive** — they apply to events received **after** the rule exists. For older data, query raw logs with **`telemetry_query`** or use metrics that already existed when data arrived.

---

## Dashboards (MCP)

| Task | MCP tool |
|------|-----------|
| List dashboards | `telemetry_list_dashboards_tool` |
| Get dashboard details | `telemetry_get_dashboard_details_tool` |
| Export dashboard | `telemetry_export_dashboard_tool` |
| Create / edit / remove chart | `telemetry_create_chart_tool`, `telemetry_edit_chart_tool`, `telemetry_remove_chart_tool` |
| Chart details / building help | `telemetry_get_chart_details_tool`, `telemetry_get_chart_building_instructions_tool` |

### MCP chart editing limits

**`telemetry_edit_chart_tool`** accepts: `id`, `name`, `chart_type`, `query`, `source_variable`, `settings`.

**Not supported via MCP:** some UI-only fields (e.g. certain “explanation” tooltips). **`settings.description`** may still be set via MCP.

### Import / export

- **Export** JSON via **`telemetry_export_dashboard_tool`** (use dashboard id from **list**).
- **Import** creates a **new** dashboard:  
  `POST https://telemetry.betterstack.com/api/v2/dashboards/import` with body `{"name": "...", "data": { ... }}`.  
  Import does not update an existing dashboard in place.

### Dashboard query habits

- Use **`FROM {{source}}`** with dashboard source variables rather than hardcoding raw table names where possible.
- Use **`{{time}}`**, **`{{start_time}}`**, **`{{end_time}}`** for ranges.
- Extracted metrics often appear as **columns**, not a generic `name` row — avoid filters like `AND name = 'metric_name'` unless your data model uses that.

### Known quirks

- **Concurrent chart removals** can deadlock — remove charts **sequentially**.
- **Bad import shape** can yield an empty dashboard — verify the `charts` array in the payload.

---

## Changelog

| Version | Date | Summary |
|---------|------|---------|
| v1.0 | 2026-03-20 | Initial Nightscout-focused guide: MCP log workflow, ClickHouse notes, REST metrics, dashboards. Adapted from an internal multi-app guide; stripped other-product names and paths. |
