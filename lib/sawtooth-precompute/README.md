# Sawtooth precompute (Trio complication visible recency)

**Version:** v1  
**Last updated:** 2026-03-20 09:37 CET

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
| `SAWTOOTH_EMIT_DELAY_SECONDS` | No | 120 | Emit delay (seconds). |
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

This project runs the precompute on a **dedicated worker dyno** that executes the job every 60 seconds. Use the **MongoDB state backend** so the checkpoint survives Heroku’s ephemeral filesystem and restarts.

### 1. Config Vars

In Heroku Dashboard → App → Settings → Config Vars (or `heroku config`), set:

- All required Better Stack vars: `BETTERSTACK_QUERY_HOST`, `BETTERSTACK_QUERY_USER`, `BETTERSTACK_QUERY_PASSWORD`, `BETTERSTACK_INGEST_HOST`, `BETTERSTACK_RECENCY_SOURCE_TOKEN`
- `MONGODB_URI` (same as Nightscout’s; the worker uses a dedicated collection for checkpoint state)

Optional: `SAWTOOTH_LOOKBACK_SECONDS`, `SAWTOOTH_EMIT_DELAY_SECONDS`, `SAWTOOTH_STATE_COLLECTION` (default `sawtooth_precompute_state`).

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

The code will create the checkpoint document on the first successful run (Mongo backend uses upsert). If you skip this step, the first run starts from epoch 0 and may process many minutes (you’ll see a WARN in the logs). To **bound** the first run, set the checkpoint manually. With MongoDB backend, upsert in the state collection (same DB as Nightscout):

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

If the web dyno is Basic or Standard (never sleeps), you can run the job inside the web process on a 60s interval instead of a separate worker. Gate it with an env var (e.g. `SAWTOOTH_RUN_IN_PROCESS=1`) and call `require('./lib/sawtooth-precompute/run').run()` from a setInterval. Use MongoDB backend. This project’s chosen approach is the dedicated worker above.

## Observability (cron / Better Stack)

Heroku’s log drain sets `dt` on the **cron** log source at receive time, so those lines are suitable for correlating precompute behavior with wall clock.

Each successful run emits **one** structured line (no separate `start` / `gtl_rows` lines). Shape:

```text
sawtooth-precompute pushed gtl_rows=<n> parsed=<n> deduped=<n> skipped_no_anchor=<n> minutes=<n> end_minute=<epoch> anchor_gtl_epoch=<epoch> anchor_gtl_age_seconds=<s> emit_delay_actual_seconds=<s>
```

When there is nothing to emit: `sawtooth-precompute skip (nothing to do)`.

- **gtl_rows / parsed / deduped / skipped_no_anchor** — Query and pipeline health (zero rows, parse drops, dedupe collapse, minutes with no ASOF anchor).
- **minutes** — Gauge points pushed this run (same count the old `emitted=` field carried).
- **end_minute** — Last minute included in this emit (same as internal `to_minute`).
- **anchor_gtl_epoch** — `gtl_epoch` of the GTL row that anchored the **last emitted** minute (`-1` if nothing was emitted).
- **anchor_gtl_age_seconds** — Wall time at log minus `anchor_gtl_epoch` (staleness of the precompute’s view at emit time; `-1` if no anchor).
- **emit_delay_actual_seconds** — Wall time at log minus `end_minute` (actual lag vs the emitted minute boundary).

For metrics extracted from this line in Better Stack, filter out sentinel values (`anchor_gtl_age_seconds >= 0`, etc.) so empty runs do not skew averages.

Example extractions (cron log source; adjust `source_id` / team table as needed):

| Metric | Expression (message field) | Notes |
|--------|----------------------------|--------|
| `sawtooth_anchor_gtl_age_seconds` | `toInt64OrNull(replaceRegexpOne(message, '.*anchor_gtl_age_seconds=(\\d+).*', '\\1'))` | Use `>= 0` filter |
| `sawtooth_emit_delay_actual_seconds` | `toInt64OrNull(replaceRegexpOne(message, '.*emit_delay_actual_seconds=(\\d+).*', '\\1'))` | |
| `sawtooth_emitted_count` | `if(message LIKE '%sawtooth-precompute pushed%', toInt64OrNull(replaceRegexpOne(message, '.*minutes=(\\d+).*', '\\1')), NULL)` | Sum per window |
| `sawtooth_gtl_rows` | `if(message LIKE '%sawtooth-precompute pushed%', toInt64OrNull(replaceRegexpOne(message, '.*gtl_rows=(\\d+).*', '\\1')), NULL)` | Same line as `pushed` |

## Limitations (v1)

If the push to Better Stack succeeds but the process exits before `pushed_through_minute` is persisted (e.g. crash or kill), the next run will retry that range and may resend the same metrics. This is a documented v1 limitation, not a code defect.

## Design and rollout

See implementation plan and design in the Trio-dev repo: `docs/in-progress/nightscout-sawtooth-precompute/`.

---

## Changelog

### v1 (2026-03-20 09:37 CET)

- Initial **document** version for this README (not a runtime or npm package version).
- Describes the single consolidated `pushed` log line (pipeline counters + `minutes` + `end_minute` + anchor/emit lag fields), skip line, and Better Stack metric extraction examples.
