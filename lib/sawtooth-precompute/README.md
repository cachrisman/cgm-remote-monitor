# Sawtooth precompute (Trio complication visible recency)

**Version:** v4  
**Last updated:** 2026-03-20 17:33 CET

Standalone job that queries Better Stack for Trio GTL logs, reconstructs the per-minute sawtooth, and pushes gauge metrics to the **Trio Complication Recency** Prometheus source. Run by cron every minute.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETTERSTACK_QUERY_HOST` | Yes | — | Connect host for Trio logs SQL (e.g. `eu-nbg-2-connect.betterstackdata.com`). |
| `BETTERSTACK_QUERY_USER` | Yes | — | Basic auth user for Query API. |
| `BETTERSTACK_QUERY_PASSWORD` | Yes | — | Basic auth password for Query API. |
| `BETTERSTACK_INGEST_HOST` | Yes | — | Ingest host for metrics push (e.g. `s2301525.eu-fsn-3.betterstackdata.com`). |
| `BETTERSTACK_RECENCY_SOURCE_TOKEN` | Yes | — | Bearer token for source Trio Complication Recency. |
| `SAWTOOTH_LOOKBACK_SECONDS` | No | 10800 | Lookback for GTL window (3 h). |
| `SAWTOOTH_EMIT_DELAY_SECONDS` | No | 120 | Cold-start emit delay (seconds); used until the dynamic lag tracker has observations. |
| `SAWTOOTH_LAG_WINDOW_SECONDS` | No | 10800 | Rolling window (seconds) for data-horizon-lag observations (3 h). |
| `SAWTOOTH_LAG_BUFFER_SECONDS` | No | 120 | Buffer added on top of `lag_window_max` to compute `effective_emit_delay`. |
| `SAWTOOTH_STATE_FILE` | No | `data/sawtooth-precompute-state.json` | Checkpoint file path when backend=file. |
| `SAWTOOTH_STATE_BACKEND` | No | inferred | `file` or `mongo`; if unset, use mongo when `MONGODB_URI` is set. |
| `SAWTOOTH_STATE_COLLECTION` | No | `sawtooth_precompute_state` | MongoDB collection when backend=mongo. |
| `MONGODB_URI` | When backend=mongo | — | Same as Nightscout (e.g. Heroku). |

Load from `.env` in repo root when running manually; cron should set env or use a wrapper that sources env.

## Cron (VPS / self-hosted)

Run once per minute; only one instance must run.

```bash
* * * * * cd /path/to/cgm-remote-monitor && node bin/sawtooth-precompute.js >> /path/to/logs/sawtooth-precompute.log 2>&1
```

**File backend:** Lock file prevents overlapping runs. **MongoDB backend:** Deploy only one worker or cron; the code also enforces a lease so only one writer runs at a time.

## Running on Heroku

This project runs the precompute on a **dedicated worker dyno** that executes the job every 60 seconds. Use the **MongoDB state backend** so the checkpoint survives Heroku's ephemeral filesystem and restarts.

### 1. Config Vars

In Heroku Dashboard → App → Settings → Config Vars (or `heroku config`), set:

- All required Better Stack vars: `BETTERSTACK_QUERY_HOST`, `BETTERSTACK_QUERY_USER`, `BETTERSTACK_QUERY_PASSWORD`, `BETTERSTACK_INGEST_HOST`, `BETTERSTACK_RECENCY_SOURCE_TOKEN`
- `MONGODB_URI` (same as Nightscout's; the worker uses a dedicated collection for checkpoint state)

Optional: `SAWTOOTH_LOOKBACK_SECONDS`, `SAWTOOTH_EMIT_DELAY_SECONDS`, `SAWTOOTH_LAG_WINDOW_SECONDS`, `SAWTOOTH_LAG_BUFFER_SECONDS`, `SAWTOOTH_STATE_COLLECTION` (default `sawtooth_precompute_state`).

### 2. Procfile

Add a `sawtooth` process that runs the wall-clock-aligned clock loop:

```
web: node lib/server/server.js
sawtooth: node bin/sawtooth-clock.js
```

`sawtooth-clock.js` waits until each wall-clock minute boundary (e.g. :00 seconds), runs one precompute, then waits for the next boundary (no drift). It does not start another run until the current one finishes (no overlap), and handles SIGTERM by stopping after the in-flight run so Heroku can shut the dyno cleanly. Use only one worker process; the MongoDB backend enforces a lease so only one writer runs at a time.

### 3. Scale the worker

After deploy:

```bash
heroku ps:scale sawtooth=1
```

Use an Eco or Basic dyno. Eco workers run 24/7 and consume from your Eco hour pool; if your web dyno is Basic, the sawtooth worker stays awake. If both web and worker are Eco, the worker sleeps when the web sleeps (after 30 min no traffic). Set dyno type (Eco vs Basic) in Dashboard → Resources.

### 4. Cold start (first run, optional)

The code will create the checkpoint document on the first successful run (Mongo backend uses upsert). If you skip this step, the first run starts from epoch 0 and may process many minutes (you'll see a WARN in the logs). To **bound** the first run, set the checkpoint manually. With MongoDB backend, upsert in the state collection (same DB as Nightscout):

- **File:** Write `data/sawtooth-precompute-state.json` with `{"last_emitted_minute_epoch": <epoch>}` where `epoch = floor(now/60)*60 - 3600` (or desired start).
- **Mongo:** Upsert document `{ _id: 'checkpoint', last_emitted_minute_epoch: <epoch>, updated_at: new Date() }` in the state collection.

```javascript
// In mongosh, using the same database as MONGODB_URI:
var epoch = Math.floor(Date.now() / 60000) * 60 - 3600;  // one hour ago, minute-aligned
db.sawtooth_precompute_state.updateOne(
  { _id: 'checkpoint' },
  { $set: { last_emitted_minute_epoch: epoch, updated_at: new Date() } },
  { upsert: true }
);
```
Use your desired start epoch (e.g. one hour ago as above). After that, deploy and scale `sawtooth=1`; the worker will run every 60 seconds.

### Alternative — In-process (Basic/Standard web only)

If the web dyno is Basic or Standard (never sleeps), you can run the job inside the web process on a 60s interval instead of a separate worker. Gate it with an env var (e.g. `SAWTOOTH_RUN_IN_PROCESS=1`) and call `require('./lib/sawtooth-precompute/run').run()` from a setInterval. Use MongoDB backend. This project's chosen approach is the dedicated worker above.

## Observability (cron / Better Stack)

The `nightscout-chrisman-io-cron` Better Stack source receives precompute logs via the JavaScript platform; `dt` on that source is ingest/receive time, suitable for correlating precompute behavior with wall clock.

Each successful run emits **one** structured line. Shape:

```text
sawtooth-precompute pushed gtl_rows=<n> parsed=<n> deduped=<n> skipped_no_anchor=<n> minutes=<n> end_minute=<epoch> anchor_gtl_epoch=<epoch> anchor_gtl_age_seconds=<s> emit_delay_actual_seconds=<s> effective_emit_delay=<s> data_horizon_lag=<s> lag_window_max=<s> lag_obs=<n>
```

When there is nothing to emit:

```text
sawtooth-precompute skip (nothing to do) effective_emit_delay=<s> lag_window_max=<s> lag_obs=<n>
```

### Field reference

- **gtl_rows / parsed / deduped / skipped_no_anchor** — Query and pipeline health.
- **minutes** — Gauge points pushed this run.
- **end_minute** — Last minute included in this emit.
- **anchor_gtl_epoch** — `gtl_epoch` of the GTL row that anchored the last emitted minute (`-1` if nothing emitted).
- **anchor_gtl_age_seconds** — Wall time at log minus `anchor_gtl_epoch` (`-1` if no anchor).
- **emit_delay_actual_seconds** — Wall time at log minus `end_minute`.
- **effective_emit_delay** — Emit delay used for this run (dynamic or cold-start fallback).
- **data_horizon_lag** — `wall_now - max(dt)` across all GTL rows in the query; how far behind the precompute's view is (`-1` if no rows). Only recorded into the rolling window when ≤ 30 min (values above that are WidgetKit gaps, not drain lag).
- **lag_window_max** — Rolling max of `data_horizon_lag` over the lag window; drives `effective_emit_delay` (`-1` on cold start).
- **lag_obs** — Number of lag observations in the rolling window.

### Dynamic emit delay

The emit delay is computed dynamically from observed data-horizon lag rather than a fixed value. Each run measures the gap between wall time and the newest GTL event-time `dt` that's queryable in Better Stack.

Observations are **capped at 30 minutes** (`MAX_PLAUSIBLE_DRAIN_LAG = 1800s`). Gaps larger than that are WidgetKit freezes (no GTL events fired), not log drain latency, and are excluded from the rolling window. Without this cap, a multi-hour freeze would inflate `effective_emit_delay` for hours after recovery — the inverse of the original false-spike problem.

The rolling max of capped observations over `SAWTOOTH_LAG_WINDOW_SECONDS` (default 3 h) plus `SAWTOOTH_LAG_BUFFER_SECONDS` (default 120 s) becomes `effective_emit_delay`. On cold start (no observations), `SAWTOOTH_EMIT_DELAY_SECONDS` is used as the fallback. The lag tracker is in-memory and resets on process restart; observations are available from the second run onward (the first run records but does not yet use them). For cron deployments (new process each run), the dynamic delay is effectively disabled — every run is a cold start. The dynamic delay requires the persistent clock loop (`sawtooth-clock.js`) to accumulate observations across runs.

### Example extractions

For metrics extracted from the `pushed` line in Better Stack, filter out sentinel values (`>= 0`) so empty runs do not skew averages.

| Metric | Expression (message field) | Notes |
|--------|----------------------------|--------|
| `sawtooth_anchor_gtl_age_seconds` | `toInt64OrNull(replaceRegexpOne(message, '.*anchor_gtl_age_seconds=(\\d+).*', '\\1'))` | Use `>= 0` filter |
| `sawtooth_emit_delay_actual_seconds` | `toInt64OrNull(replaceRegexpOne(message, '.*emit_delay_actual_seconds=(\\d+).*', '\\1'))` | |
| `sawtooth_effective_emit_delay` | `toInt64OrNull(replaceRegexpOne(message, '.*effective_emit_delay=(\\d+).*', '\\1'))` | |
| `sawtooth_data_horizon_lag` | `toInt64OrNull(replaceRegexpOne(message, '.*data_horizon_lag=(\\d+).*', '\\1'))` | Use `>= 0` filter |
| `sawtooth_lag_window_max` | `toInt64OrNull(replaceRegexpOne(message, '.*lag_window_max=(\\d+).*', '\\1'))` | Use `>= 0` filter |
| `sawtooth_emitted_count` | `if(message LIKE '%sawtooth-precompute pushed%', toInt64OrNull(replaceRegexpOne(message, '.*minutes=(\\d+).*', '\\1')), NULL)` | Sum per window |
| `sawtooth_gtl_rows` | `if(message LIKE '%sawtooth-precompute pushed%', toInt64OrNull(replaceRegexpOne(message, '.*gtl_rows=(\\d+).*', '\\1')), NULL)` | |

## Limitations

If the push to Better Stack succeeds but the process exits before `pushed_through_minute` is persisted (e.g. crash or kill), the next run will retry that range and may resend the same metrics.

## Design and rollout

See implementation plan and design in the Trio-dev repo: `docs/in-progress/nightscout-sawtooth-precompute/`.

---

## Changelog

### v4 (2026-03-20 17:33 CET)

- **Config parsing fix**: Replaced `parseInt(env) || DEFAULT` with `envInt()` helper that distinguishes 0 from NaN/undefined. Setting `SAWTOOTH_EMIT_DELAY_SECONDS=0` (backfill) or `SAWTOOTH_LAG_BUFFER_SECONDS=0` now works correctly instead of silently falling back to the default. Affects all four config values.
- **Cron vs clock loop clarification**: Added note that the dynamic delay requires the persistent clock loop (`sawtooth-clock.js`); cron deployments (new process each run) always use the cold-start fallback.

### v3 (2026-03-20 16:46 CET)

- **Drain lag observation cap**: `data_horizon_lag` values above 30 min (`MAX_PLAUSIBLE_DRAIN_LAG = 1800s`) are excluded from the rolling window. Prevents WidgetKit freezes (multi-hour inter-GTL gaps) from inflating `effective_emit_delay` for hours after recovery. Without this, a single overnight freeze would cause phantom flatness/silence on the dashboard — the inverse of the original false-spike problem.
- **`SAWTOOTH_LAG_BUFFER_SECONDS` env var**: `LAG_BUFFER_SECONDS` (the buffer added on top of `lag_window_max`) is now configurable via environment, consistent with the other tuning knobs.
- **README wording**: Clarified that lag observations are "available from the second run onward" (first run records but does not use them).

### v2 (2026-03-20 16:14 CET)

- **Dynamic emit delay**: Emit delay is now computed from a rolling max of observed data-horizon lag (wall time minus newest queryable GTL event time) over a configurable window (`SAWTOOTH_LAG_WINDOW_SECONDS`, default 3 h) plus a 2-minute buffer. Replaces fixed `SAWTOOTH_EMIT_DELAY_SECONDS` (now cold-start fallback only). Eliminates false spikes caused by ingest lag exceeding the static delay.
- **New log fields**: `effective_emit_delay`, `data_horizon_lag`, `lag_window_max`, `lag_obs` on both `pushed` and `skip` lines.
- **New env var**: `SAWTOOTH_LAG_WINDOW_SECONDS`.

### v1 (2026-03-20 09:37 CET)

- Initial **document** version for this README (not a runtime or npm package version).
- Describes the single consolidated `pushed` log line (pipeline counters + `minutes` + `end_minute` + anchor/emit lag fields), skip line, and Better Stack metric extraction examples.
