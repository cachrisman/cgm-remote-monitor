# Sawtooth Precompute v2 — Code Review

## Sawtooth precompute: dynamic emit delay, off-wrist fix, query retry

**4 files changed, +163 / -38** (uncommitted working tree vs `main`)

These changes span four areas of `lib/sawtooth-precompute/`:

1. **Dynamic emit delay with drain lag cap** (`run.js`) — replaces fixed `emit_delay_seconds` with a rolling-max-based dynamic delay, capped at 30 min to exclude WidgetKit freeze gaps.
2. **Config parsing fix** (`run.js`) — `envInt()` helper replaces `parseInt || DEFAULT` so setting env vars to 0 works correctly.
3. **Off-wrist detection fix** (`dedupe.js`) — `battery_state=unknown` no longer triggers off-wrist; only `charging` does.
4. **Query retry on transient errors** (`fetch-gtl-logs.js`) — one retry with 5 s delay on ETIMEDOUT/ECONNRESET/503.
5. **README overhaul** (`README.md`) — documents all new fields, dynamic delay mechanism, env vars, cron vs clock loop distinction, metric extraction examples.

### `run.js` — Dynamic emit delay, drain lag cap, config parsing fix

- Replaced fixed `emit_delay_seconds` with `effectiveEmitDelay`: rolling max of observed `data_horizon_lag` (wall time minus newest queryable GTL `dt`) over a configurable window (`SAWTOOTH_LAG_WINDOW_SECONDS`, default 3 h) plus `SAWTOOTH_LAG_BUFFER_SECONDS` (default 120 s). Falls back to `emit_delay_seconds` on cold start (no observations).
- Capped drain lag observations at `MAX_PLAUSIBLE_DRAIN_LAG = 1800` (30 min). Values above this are WidgetKit freeze gaps (no GTL events fired), not log drain latency, and are excluded from the rolling window. Without this cap, a multi-hour freeze would inflate `effective_emit_delay` for hours after recovery.
- Raw `data_horizon_lag` is still logged on the `pushed` line for observability; only the rolling window is filtered.
- Added `envInt()` helper that distinguishes 0 from NaN/undefined, fixing `SAWTOOTH_EMIT_DELAY_SECONDS=0` for backfill (design §4.5).
- New env vars: `SAWTOOTH_LAG_WINDOW_SECONDS`, `SAWTOOTH_LAG_BUFFER_SECONDS`.
- New log fields on both `pushed` and `skip` lines: `effective_emit_delay`, `data_horizon_lag`, `lag_window_max`, `lag_obs`.

### `dedupe.js` — Off-wrist detection narrowed to charging only

- `battery_state=unknown` (common during CGM provider restarts) no longer triggers `is_off_wrist`. Only `battery_state=charging` does.
- Prevents false zero periods on the sawtooth when the watch briefly reports `unknown` during normal operation.
- JSDoc updated to reflect the new semantics.

### `fetch-gtl-logs.js` — Transient query retry

- Added `isTransient(err)` helper: matches ETIMEDOUT, ECONNRESET, ECONNREFUSED, 503, and generic timeout.
- `queryGtlLogs` now retries once (`MAX_RETRIES = 1`) with a 5 s delay on transient errors before throwing.
- Non-transient errors (e.g. 400, 401, parse errors) throw immediately without retry.
- Logs a WARN on retry: `sawtooth-precompute WARN query attempt N failed (...), retrying in 5000ms`.

### `README.md` — Documentation overhaul (v1 → v4)

- Added env var table entries for `SAWTOOTH_LAG_WINDOW_SECONDS`, `SAWTOOTH_LAG_BUFFER_SECONDS`.
- Added "Dynamic emit delay" section documenting the mechanism, 30-min cap rationale, cron vs clock loop distinction.
- Added field reference for all new log fields.
- Added metric extraction expressions for `effective_emit_delay`, `data_horizon_lag`, `lag_window_max`.
- Updated Heroku optional env var list.
- Changelog entries v2–v4.

```diff
diff --git a/lib/sawtooth-precompute/README.md b/lib/sawtooth-precompute/README.md
index 59fb69e9..fed7cd38 100644
--- a/lib/sawtooth-precompute/README.md
+++ b/lib/sawtooth-precompute/README.md
@@ -1,7 +1,7 @@
 # Sawtooth precompute (Trio complication visible recency)
 
-**Version:** v1  
-**Last updated:** 2026-03-20 09:37 CET
+**Version:** v4  
+**Last updated:** 2026-03-20 17:33 CET
 
 Standalone job that queries Better Stack for Trio GTL logs, reconstructs the per-minute sawtooth, and pushes gauge metrics to the **Trio Complication Recency** Prometheus source. Run by cron every minute.
 
@@ -15,7 +15,9 @@ Standalone job that queries Better Stack for Trio GTL logs, reconstructs the per
 | `BETTERSTACK_INGEST_HOST` | Yes | — | Ingest host for metrics push (e.g. `s2301525.eu-fsn-3.betterstackdata.com`). |
 | `BETTERSTACK_RECENCY_SOURCE_TOKEN` | Yes | — | Bearer token for source Trio Complication Recency. |
 | `SAWTOOTH_LOOKBACK_SECONDS` | No | 10800 | Lookback for GTL window (3 h). |
-| `SAWTOOTH_EMIT_DELAY_SECONDS` | No | 120 | Emit delay (seconds). |
+| `SAWTOOTH_EMIT_DELAY_SECONDS` | No | 120 | Cold-start emit delay (seconds); used until the dynamic lag tracker has observations. |
+| `SAWTOOTH_LAG_WINDOW_SECONDS` | No | 10800 | Rolling window (seconds) for data-horizon-lag observations (3 h). |
+| `SAWTOOTH_LAG_BUFFER_SECONDS` | No | 120 | Buffer added on top of `lag_window_max` to compute `effective_emit_delay`. |
 | `SAWTOOTH_STATE_FILE` | No | `data/sawtooth-precompute-state.json` | Checkpoint file path when backend=file. |
 | `SAWTOOTH_STATE_BACKEND` | No | inferred | `file` or `mongo`; if unset, use mongo when `MONGODB_URI` is set. |
 | `SAWTOOTH_STATE_COLLECTION` | No | `sawtooth_precompute_state` | MongoDB collection when backend=mongo. |
@@ -35,16 +37,16 @@ Run once per minute; only one instance must run.
 
 ## Running on Heroku
 
-This project runs the precompute on a **dedicated worker dyno** that executes the job every 60 seconds. Use the **MongoDB state backend** so the checkpoint survives Heroku's ephemeral filesystem and restarts.
+This project runs the precompute on a **dedicated worker dyno** that executes the job every 60 seconds. Use the **MongoDB state backend** so the checkpoint survives Heroku's ephemeral filesystem and restarts.
 
 ### 1. Config Vars
 
 In Heroku Dashboard → App → Settings → Config Vars (or `heroku config`), set:
 
 - All required Better Stack vars: `BETTERSTACK_QUERY_HOST`, `BETTERSTACK_QUERY_USER`, `BETTERSTACK_QUERY_PASSWORD`, `BETTERSTACK_INGEST_HOST`, `BETTERSTACK_RECENCY_SOURCE_TOKEN`
-- `MONGODB_URI` (same as Nightscout's; the worker uses a dedicated collection for checkpoint state)
+- `MONGODB_URI` (same as Nightscout's; the worker uses a dedicated collection for checkpoint state)
 
-Optional: `SAWTOOTH_LOOKBACK_SECONDS`, `SAWTOOTH_EMIT_DELAY_SECONDS`, `SAWTOOTH_STATE_COLLECTION` (default `sawtooth_precompute_state`).
+Optional: `SAWTOOTH_LOOKBACK_SECONDS`, `SAWTOOTH_EMIT_DELAY_SECONDS`, `SAWTOOTH_LAG_WINDOW_SECONDS`, `SAWTOOTH_LAG_BUFFER_SECONDS`, `SAWTOOTH_STATE_COLLECTION` (default `sawtooth_precompute_state`).
 
 ### 2. Procfile
 
@@ -69,7 +71,7 @@ Use an Eco or Basic dyno. Eco workers run 24/7 and consume from your Eco hour po
 
 ### 4. Cold start (first run, optional)
 
-The code will create the checkpoint document on the first successful run (Mongo backend uses upsert). If you skip this step, the first run starts from epoch 0 and may process many minutes (you'll see a WARN in the logs). To **bound** the first run, set the checkpoint manually. With MongoDB backend, upsert in the state collection (same DB as Nightscout):
+The code will create the checkpoint document on the first successful run (Mongo backend uses upsert). If you skip this step, the first run starts from epoch 0 and may process many minutes (you'll see a WARN in the logs). To **bound** the first run, set the checkpoint manually. With MongoDB backend, upsert in the state collection (same DB as Nightscout):
 
 - **File:** Write `data/sawtooth-precompute-state.json` with `{"last_emitted_minute_epoch": <epoch>}` where `epoch = floor(now/60)*60 - 3600` (or desired start).
 - **Mongo:** Upsert document `{ _id: 'checkpoint', last_emitted_minute_epoch: <epoch>, updated_at: new Date() }` in the state collection.
@@ -87,41 +89,62 @@ Use your desired start epoch (e.g. one hour ago as above). After that, deploy an
 
 ### Alternative — In-process (Basic/Standard web only)
 
-If the web dyno is Basic or Standard (never sleeps), you can run the job inside the web process on a 60s interval instead of a separate worker. Gate it with an env var (e.g. `SAWTOOTH_RUN_IN_PROCESS=1`) and call `require('./lib/sawtooth-precompute/run').run()` from a setInterval. Use MongoDB backend. This project's chosen approach is the dedicated worker above.
+If the web dyno is Basic or Standard (never sleeps), you can run the job inside the web process on a 60s interval instead of a separate worker. Gate it with an env var (e.g. `SAWTOOTH_RUN_IN_PROCESS=1`) and call `require('./lib/sawtooth-precompute/run').run()` from a setInterval. Use MongoDB backend. This project's chosen approach is the dedicated worker above.
 
 ## Observability (cron / Better Stack)
 
-Heroku's log drain sets `dt` on the **cron** log source at receive time, so those lines are suitable for correlating precompute behavior with wall clock.
+The `nightscout-chrisman-io-cron` Better Stack source receives precompute logs via the JavaScript platform; `dt` on that source is ingest/receive time, suitable for correlating precompute behavior with wall clock.
 
-Each successful run emits **one** structured line (no separate `start` / `gtl_rows` lines). Shape:
+Each successful run emits **one** structured line. Shape:
 
 ```text
-sawtooth-precompute pushed gtl_rows=<n> parsed=<n> deduped=<n> skipped_no_anchor=<n> minutes=<n> end_minute=<epoch> anchor_gtl_epoch=<epoch> anchor_gtl_age_seconds=<s> emit_delay_actual_seconds=<s>
+sawtooth-precompute pushed gtl_rows=<n> parsed=<n> deduped=<n> skipped_no_anchor=<n> minutes=<n> end_minute=<epoch> anchor_gtl_epoch=<epoch> anchor_gtl_age_seconds=<s> emit_delay_actual_seconds=<s> effective_emit_delay=<s> data_horizon_lag=<s> lag_window_max=<s> lag_obs=<n>
 ```
 
-When there is nothing to emit: `sawtooth-precompute skip (nothing to do)`.
+When there is nothing to emit:
 
-- **gtl_rows / parsed / deduped / skipped_no_anchor** — Query and pipeline health (zero rows, parse drops, dedupe collapse, minutes with no ASOF anchor).
-- **minutes** — Gauge points pushed this run (same count the old `emitted=` field carried).
-- **end_minute** — Last minute included in this emit (same as internal `to_minute`).
-- **anchor_gtl_epoch** — `gtl_epoch` of the GTL row that anchored the **last emitted** minute (`-1` if nothing was emitted).
-- **anchor_gtl_age_seconds** — Wall time at log minus `anchor_gtl_epoch` (staleness of the precompute's view at emit time; `-1` if no anchor).
-- **emit_delay_actual_seconds** — Wall time at log minus `end_minute` (actual lag vs the emitted minute boundary).
+```text
+sawtooth-precompute skip (nothing to do) effective_emit_delay=<s> lag_window_max=<s> lag_obs=<n>
+```
+
+### Field reference
+
+- **gtl_rows / parsed / deduped / skipped_no_anchor** — Query and pipeline health.
+- **minutes** — Gauge points pushed this run.
+- **end_minute** — Last minute included in this emit.
+- **anchor_gtl_epoch** — `gtl_epoch` of the GTL row that anchored the last emitted minute (`-1` if nothing emitted).
+- **anchor_gtl_age_seconds** — Wall time at log minus `anchor_gtl_epoch` (`-1` if no anchor).
+- **emit_delay_actual_seconds** — Wall time at log minus `end_minute`.
+- **effective_emit_delay** — Emit delay used for this run (dynamic or cold-start fallback).
+- **data_horizon_lag** — `wall_now - max(dt)` across all GTL rows in the query; how far behind the precompute's view is (`-1` if no rows). Only recorded into the rolling window when ≤ 30 min (values above that are WidgetKit gaps, not drain lag).
+- **lag_window_max** — Rolling max of `data_horizon_lag` over the lag window; drives `effective_emit_delay` (`-1` on cold start).
+- **lag_obs** — Number of lag observations in the rolling window.
+
+### Dynamic emit delay
+
+The emit delay is computed dynamically from observed data-horizon lag rather than a fixed value. Each run measures the gap between wall time and the newest GTL event-time `dt` that's queryable in Better Stack.
+
+Observations are **capped at 30 minutes** (`MAX_PLAUSIBLE_DRAIN_LAG = 1800s`). Gaps larger than that are WidgetKit freezes (no GTL events fired), not log drain latency, and are excluded from the rolling window. Without this cap, a multi-hour freeze would inflate `effective_emit_delay` for hours after recovery — the inverse of the original false-spike problem.
 
-For metrics extracted from this line in Better Stack, filter out sentinel values (`anchor_gtl_age_seconds >= 0`, etc.) so empty runs do not skew averages.
+The rolling max of capped observations over `SAWTOOTH_LAG_WINDOW_SECONDS` (default 3 h) plus `SAWTOOTH_LAG_BUFFER_SECONDS` (default 120 s) becomes `effective_emit_delay`. On cold start (no observations), `SAWTOOTH_EMIT_DELAY_SECONDS` is used as the fallback. The lag tracker is in-memory and resets on process restart; observations are available from the second run onward (the first run records but does not yet use them). For cron deployments (new process each run), the dynamic delay is effectively disabled — every run is a cold start. The dynamic delay requires the persistent clock loop (`sawtooth-clock.js`) to accumulate observations across runs.
 
-Example extractions (cron log source; adjust `source_id` / team table as needed):
+### Example extractions
+
+For metrics extracted from the `pushed` line in Better Stack, filter out sentinel values (`>= 0`) so empty runs do not skew averages.
 
 | Metric | Expression (message field) | Notes |
 |--------|----------------------------|--------|
 | `sawtooth_anchor_gtl_age_seconds` | `toInt64OrNull(replaceRegexpOne(message, '.*anchor_gtl_age_seconds=(\\d+).*', '\\1'))` | Use `>= 0` filter |
 | `sawtooth_emit_delay_actual_seconds` | `toInt64OrNull(replaceRegexpOne(message, '.*emit_delay_actual_seconds=(\\d+).*', '\\1'))` | |
+| `sawtooth_effective_emit_delay` | `toInt64OrNull(replaceRegexpOne(message, '.*effective_emit_delay=(\\d+).*', '\\1'))` | |
+| `sawtooth_data_horizon_lag` | `toInt64OrNull(replaceRegexpOne(message, '.*data_horizon_lag=(\\d+).*', '\\1'))` | Use `>= 0` filter |
+| `sawtooth_lag_window_max` | `toInt64OrNull(replaceRegexpOne(message, '.*lag_window_max=(\\d+).*', '\\1'))` | Use `>= 0` filter |
 | `sawtooth_emitted_count` | `if(message LIKE '%sawtooth-precompute pushed%', toInt64OrNull(replaceRegexpOne(message, '.*minutes=(\\d+).*', '\\1')), NULL)` | Sum per window |
-| `sawtooth_gtl_rows` | `if(message LIKE '%sawtooth-precompute pushed%', toInt64OrNull(replaceRegexpOne(message, '.*gtl_rows=(\\d+).*', '\\1')), NULL)` | Same line as `pushed` |
+| `sawtooth_gtl_rows` | `if(message LIKE '%sawtooth-precompute pushed%', toInt64OrNull(replaceRegexpOne(message, '.*gtl_rows=(\\d+).*', '\\1')), NULL)` | |
 
-## Limitations (v1)
+## Limitations
 
-If the push to Better Stack succeeds but the process exits before `pushed_through_minute` is persisted (e.g. crash or kill), the next run will retry that range and may resend the same metrics. This is a documented v1 limitation, not a code defect.
+If the push to Better Stack succeeds but the process exits before `pushed_through_minute` is persisted (e.g. crash or kill), the next run will retry that range and may resend the same metrics.
 
 ## Design and rollout
 
@@ -131,6 +154,23 @@ See implementation plan and design in the Trio-dev repo: `docs/in-progress/night
 
 ## Changelog
 
+### v4 (2026-03-20 17:33 CET)
+
+- **Config parsing fix**: Replaced `parseInt(env) || DEFAULT` with `envInt()` helper that distinguishes 0 from NaN/undefined. Setting `SAWTOOTH_EMIT_DELAY_SECONDS=0` (backfill) or `SAWTOOTH_LAG_BUFFER_SECONDS=0` now works correctly instead of silently falling back to the default. Affects all four config values.
+- **Cron vs clock loop clarification**: Added note that the dynamic delay requires the persistent clock loop (`sawtooth-clock.js`); cron deployments (new process each run) always use the cold-start fallback.
+
+### v3 (2026-03-20 16:46 CET)
+
+- **Drain lag observation cap**: `data_horizon_lag` values above 30 min (`MAX_PLAUSIBLE_DRAIN_LAG = 1800s`) are excluded from the rolling window. Prevents WidgetKit freezes (multi-hour inter-GTL gaps) from inflating `effective_emit_delay` for hours after recovery. Without this, a single overnight freeze would cause phantom flatness/silence on the dashboard — the inverse of the original false-spike problem.
+- **`SAWTOOTH_LAG_BUFFER_SECONDS` env var**: `LAG_BUFFER_SECONDS` (the buffer added on top of `lag_window_max`) is now configurable via environment, consistent with the other tuning knobs.
+- **README wording**: Clarified that lag observations are "available from the second run onward" (first run records but does not use them).
+
+### v2 (2026-03-20 16:14 CET)
+
+- **Dynamic emit delay**: Emit delay is now computed from a rolling max of observed data-horizon lag (wall time minus newest queryable GTL event time) over a configurable window (`SAWTOOTH_LAG_WINDOW_SECONDS`, default 3 h) plus a 2-minute buffer. Replaces fixed `SAWTOOTH_EMIT_DELAY_SECONDS` (now cold-start fallback only). Eliminates false spikes caused by ingest lag exceeding the static delay.
+- **New log fields**: `effective_emit_delay`, `data_horizon_lag`, `lag_window_max`, `lag_obs` on both `pushed` and `skip` lines.
+- **New env var**: `SAWTOOTH_LAG_WINDOW_SECONDS`.
+
 ### v1 (2026-03-20 09:37 CET)
 
 - Initial **document** version for this README (not a runtime or npm package version).
diff --git a/lib/sawtooth-precompute/dedupe.js b/lib/sawtooth-precompute/dedupe.js
index c2fbafd7..13183e1f 100644
--- a/lib/sawtooth-precompute/dedupe.js
+++ b/lib/sawtooth-precompute/dedupe.js
@@ -1,9 +1,9 @@
 'use strict';
 
 /**
- * Dedupes GTL rows by dt. Per design §4.2: is_off_wrist = true if any row in the group
- * is charging or unknown ("any off-wrist wins"); data_age_seconds from on-wrist rows only.
- * Mixed groups (one off-wrist, one on-wrist) emit as off-wrist (value 0) per Explore semantics.
+ * Dedupes GTL rows by dt. is_off_wrist = true only when battery_state is 'charging'.
+ * 'unknown' (common during provider restarts) is treated as on-wrist to avoid false zeros.
+ * Mixed groups with any 'charging' row emit as off-wrist (value 0).
  * @param {Array<{ dt: number, data_age_seconds: number|null, battery_state: string|null, get_timeline_at_epoch_seconds: number|null }>} rows - Parsed GTL rows (same dt may appear twice).
  * @returns {Array<{ gtl_epoch: number, data_age_seconds: number|null, is_off_wrist: boolean }>} One row per dt, sorted by gtl_epoch.
  */
@@ -19,8 +19,8 @@ function dedupeByDt(rows) {
 
   const out = [];
   for (const [dt, group] of byDt) {
-    const isOffWrist = group.some(r => r.battery_state === 'charging' || r.battery_state === 'unknown');
-    const onWrist = group.filter(r => r.battery_state !== 'charging' && r.battery_state !== 'unknown');
+    const isOffWrist = group.some(r => r.battery_state === 'charging');
+    const onWrist = group.filter(r => r.battery_state !== 'charging');
     const ages = onWrist.map(r => r.data_age_seconds).filter(x => x != null);
     const finalDataAge = ages.length ? Math.max(...ages) : null;
 
diff --git a/lib/sawtooth-precompute/fetch-gtl-logs.js b/lib/sawtooth-precompute/fetch-gtl-logs.js
index 38baee47..ba7eb058 100644
--- a/lib/sawtooth-precompute/fetch-gtl-logs.js
+++ b/lib/sawtooth-precompute/fetch-gtl-logs.js
@@ -3,6 +3,8 @@
 const https = require('https');
 
 const QUERY_TIMEOUT_MS = 30000;
+const RETRY_DELAY_MS = 5000;
+const MAX_RETRIES = 1;
 const TRIO_LOGS_TABLE = 't491594_trio_logs';
 const TRIO_S3_TABLE = 't491594_trio_s3';
 const GTL_FILTER = "JSONExtract(raw, 'message', 'Nullable(String)') LIKE '%event=complication_get_timeline_called%'";
@@ -119,16 +121,33 @@ function postQuery(sql) {
   });
 }
 
+function isTransient(err) {
+  const msg = (err.message || '').toLowerCase();
+  return msg.includes('etimedout') || msg.includes('econnreset') || msg.includes('econnrefused')
+    || msg.includes('503') || msg.includes('timeout');
+}
+
 /**
  * Fetches GTL log rows from Better Stack (Trio logs) for the given time window.
+ * Retries once on transient errors (ETIMEDOUT, ECONNRESET, 503, etc.).
  * @param {number} windowStartSec - Window start (Unix seconds).
  * @param {number} windowEndSec - Window end (Unix seconds).
  * @returns {Promise<Array<{ dt: number, message: string }>>}
  */
 async function queryGtlLogs(windowStartSec, windowEndSec) {
   const sql = buildSql(windowStartSec, windowEndSec);
-  const rows = await postQuery(sql);
-  return rows;
+  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
+    try {
+      return await postQuery(sql);
+    } catch (err) {
+      if (attempt < MAX_RETRIES && isTransient(err)) {
+        console.warn('sawtooth-precompute WARN query attempt ' + (attempt + 1) + ' failed (' + err.message + '), retrying in ' + RETRY_DELAY_MS + 'ms');
+        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
+        continue;
+      }
+      throw err;
+    }
+  }
 }
 
 module.exports = {
diff --git a/lib/sawtooth-precompute/run.js b/lib/sawtooth-precompute/run.js
index 695e647b..d0c1fcc6 100644
--- a/lib/sawtooth-precompute/run.js
+++ b/lib/sawtooth-precompute/run.js
@@ -8,18 +8,58 @@ const { pushGauges } = require('./push-metrics');
 
 const DEFAULT_LOOKBACK_SECONDS = 10800;
 const DEFAULT_EMIT_DELAY_SECONDS = 120;
+const DEFAULT_LAG_WINDOW_SECONDS = 10800;
+const DEFAULT_LAG_BUFFER_SECONDS = 120;
+// Observations above this ceiling are WidgetKit gaps, not drain lag — exclude
+// them from the rolling max so a multi-hour freeze doesn't inflate the delay
+// for hours after recovery.
+const MAX_PLAUSIBLE_DRAIN_LAG = 1800;
+
+function envInt(name, defaultVal) {
+  const raw = process.env[name];
+  if (raw == null || raw === '') return defaultVal;
+  const val = parseInt(raw, 10);
+  return isNaN(val) ? defaultVal : val;
+}
 
 /**
- * Reads lookback and emit delay from environment.
- * @returns {{ lookback_seconds: number, emit_delay_seconds: number }}
+ * Reads lookback, emit delay, lag window, and lag buffer from environment.
+ * @returns {{ lookback_seconds: number, emit_delay_seconds: number, lag_window_seconds: number, lag_buffer_seconds: number }}
  */
 function getConfig() {
   return {
-    lookback_seconds: parseInt(process.env.SAWTOOTH_LOOKBACK_SECONDS, 10) || DEFAULT_LOOKBACK_SECONDS,
-    emit_delay_seconds: parseInt(process.env.SAWTOOTH_EMIT_DELAY_SECONDS, 10) || DEFAULT_EMIT_DELAY_SECONDS,
+    lookback_seconds: envInt('SAWTOOTH_LOOKBACK_SECONDS', DEFAULT_LOOKBACK_SECONDS),
+    emit_delay_seconds: envInt('SAWTOOTH_EMIT_DELAY_SECONDS', DEFAULT_EMIT_DELAY_SECONDS),
+    lag_window_seconds: envInt('SAWTOOTH_LAG_WINDOW_SECONDS', DEFAULT_LAG_WINDOW_SECONDS),
+    lag_buffer_seconds: envInt('SAWTOOTH_LAG_BUFFER_SECONDS', DEFAULT_LAG_BUFFER_SECONDS),
   };
 }
 
+// Rolling window of data-horizon-lag observations (module-level, persists across clock loop calls).
+const lagObservations = [];
+
+// O(n) shift is fine — at one observation per minute over a 3h window the
+// array never exceeds ~180 entries.
+function trimLagObservations(now, windowSeconds) {
+  const cutoff = now - windowSeconds;
+  while (lagObservations.length > 0 && lagObservations[0].wall < cutoff) {
+    lagObservations.shift();
+  }
+}
+
+function getMaxObservedLag(now, windowSeconds) {
+  trimLagObservations(now, windowSeconds);
+  let max = -1;
+  for (let i = 0; i < lagObservations.length; i++) {
+    if (lagObservations[i].lag > max) max = lagObservations[i].lag;
+  }
+  return max;
+}
+
+function recordLagObservation(wall, lag) {
+  lagObservations.push({ wall, lag });
+}
+
 /**
  * Main run loop: load state, compute emit ceiling, query GTL logs, parse, dedupe,
  * ASOF reconstruction, two-phase save (preparing → push → pushed → checkpoint), close.
@@ -28,7 +68,7 @@ function getConfig() {
  */
 async function run() {
   const cfg = getConfig();
-  const { lookback_seconds, emit_delay_seconds } = cfg;
+  const { lookback_seconds, emit_delay_seconds, lag_window_seconds, lag_buffer_seconds } = cfg;
 
   let loaded;
   try {
@@ -43,11 +83,21 @@ async function run() {
   }
 
   const wall_now = Date.now() / 1000;
-  const end_minute = Math.max(0, Math.floor((wall_now - 60 - emit_delay_seconds) / 60) * 60);
+
+  const lagWindowMax = getMaxObservedLag(wall_now, lag_window_seconds);
+  const effectiveEmitDelay = lagWindowMax >= 0
+    ? lagWindowMax + lag_buffer_seconds
+    : emit_delay_seconds;
+  const end_minute = Math.max(0, Math.floor((wall_now - 60 - effectiveEmitDelay) / 60) * 60);
 
   try {
     if (end_minute <= loaded.last_emitted_minute_epoch) {
-      console.log('sawtooth-precompute skip (nothing to do)');
+      console.log(
+        'sawtooth-precompute skip (nothing to do)' +
+          ' effective_emit_delay=' + Math.round(effectiveEmitDelay) +
+          ' lag_window_max=' + (lagWindowMax >= 0 ? Math.round(lagWindowMax) : -1) +
+          ' lag_obs=' + lagObservations.length
+      );
       return;
     }
 
@@ -62,6 +112,18 @@ async function run() {
       throw err;
     }
 
+    let dataHorizonLag = -1;
+    if (rawRows.length > 0) {
+      let maxDt = rawRows[0].dt;
+      for (let i = 1; i < rawRows.length; i++) {
+        if (rawRows[i].dt > maxDt) maxDt = rawRows[i].dt;
+      }
+      dataHorizonLag = Math.round(wall_now - maxDt);
+      if (dataHorizonLag >= 0 && dataHorizonLag <= MAX_PLAUSIBLE_DRAIN_LAG) {
+        recordLagObservation(wall_now, dataHorizonLag);
+      }
+    }
+
     const rows = rawRows
     .map(r => {
       const parsed = parseMessage(r.message);
@@ -162,7 +224,11 @@ async function run() {
         ' anchor_gtl_age_seconds=' +
         anchorGtlAgeSeconds +
         ' emit_delay_actual_seconds=' +
-        emitDelayActualSeconds
+        emitDelayActualSeconds +
+        ' effective_emit_delay=' + Math.round(effectiveEmitDelay) +
+        ' data_horizon_lag=' + dataHorizonLag +
+        ' lag_window_max=' + (lagWindowMax >= 0 ? Math.round(lagWindowMax) : -1) +
+        ' lag_obs=' + lagObservations.length
     );
   } catch (err) {
     if (err.message && !err.message.includes('sawtooth-precompute ERROR')) {
```
