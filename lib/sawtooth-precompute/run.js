'use strict';

const state = require('./state');
const { queryGtlLogs } = require('./fetch-gtl-logs');
const { parseMessage } = require('./parse-message');
const { dedupeByDt } = require('./dedupe');
const { pushGauges } = require('./push-metrics');

const DEFAULT_LOOKBACK_SECONDS = 10800;
const DEFAULT_EMIT_DELAY_SECONDS = 120;

/**
 * Reads lookback and emit delay from environment.
 * @returns {{ lookback_seconds: number, emit_delay_seconds: number }}
 */
function getConfig() {
  return {
    lookback_seconds: parseInt(process.env.SAWTOOTH_LOOKBACK_SECONDS, 10) || DEFAULT_LOOKBACK_SECONDS,
    emit_delay_seconds: parseInt(process.env.SAWTOOTH_EMIT_DELAY_SECONDS, 10) || DEFAULT_EMIT_DELAY_SECONDS,
  };
}

/**
 * Main run loop: load state, compute emit ceiling, query GTL logs, parse, dedupe,
 * ASOF reconstruction, two-phase save (preparing → push → pushed → checkpoint), close.
 * Lock/lease held for entire run; cleanup in finally.
 * @returns {Promise<void>}
 */
async function run() {
  const cfg = getConfig();
  const { lookback_seconds, emit_delay_seconds } = cfg;

  let loaded;
  try {
    loaded = await state.loadState();
  } catch (err) {
    console.error('sawtooth-precompute ERROR loadState failed:', err.message);
    throw err;
  }

  if (loaded.last_emitted_minute_epoch === 0) {
    console.warn('sawtooth-precompute WARN cold start (checkpoint=0); first run may backfill many minutes; prefer initializing checkpoint first (see rollout docs)');
  }

  const wall_now = Date.now() / 1000;
  const end_minute = Math.max(0, Math.floor((wall_now - 60 - emit_delay_seconds) / 60) * 60);

  try {
    if (end_minute <= loaded.last_emitted_minute_epoch) {
      console.log('sawtooth-precompute skip (nothing to do)');
      return;
    }

    const window_start = Math.max(0, loaded.last_emitted_minute_epoch - lookback_seconds);
    const window_end = wall_now;

    let rawRows;
    try {
      rawRows = await queryGtlLogs(window_start, window_end);
    } catch (err) {
      console.error('sawtooth-precompute ERROR query failed:', err.message);
      throw err;
    }

    const rows = rawRows
    .map(r => {
      const parsed = parseMessage(r.message);
      if (!parsed) return null;
      return {
        dt: r.dt,
        data_age_seconds: parsed.data_age_seconds,
        battery_state: parsed.battery_state,
        get_timeline_at_epoch_seconds: parsed.get_timeline_at_epoch_seconds,
      };
    })
    .filter(Boolean);

    const gtlList = dedupeByDt(rows);

    if (gtlList.length === 0) {
      console.warn('sawtooth-precompute WARN empty GTL list, advancing checkpoint');
    }

    const from_minute = loaded.last_emitted_minute_epoch + 60;
    const to_minute = end_minute;
    const points = [];
    let skippedNoAnchor = 0;
    let lastAnchorUsed = null;

    let j = -1;
    for (let minute_epoch = from_minute; minute_epoch <= to_minute; minute_epoch += 60) {
      while (j + 1 < gtlList.length && gtlList[j + 1].gtl_epoch <= minute_epoch) {
        j++;
      }
      if (j < 0) {
        skippedNoAnchor++;
        continue;
      }
      const anchor = gtlList[j];
      const value = anchor.is_off_wrist
        ? 0
        : Math.max(0, (anchor.data_age_seconds || 0) + (minute_epoch - anchor.gtl_epoch));
      points.push({ minute_epoch, value });
      lastAnchorUsed = anchor;
    }

    try {
      await state.saveState({
        last_emitted_minute_epoch: loaded.last_emitted_minute_epoch,
        preparing_through_minute: to_minute,
      });
    } catch (err) {
      console.error('sawtooth-precompute ERROR saveState (preparing) failed:', err.message);
      throw err;
    }

    if (points.length > 0) {
      try {
        await pushGauges(points);
      } catch (err) {
        console.error('sawtooth-precompute ERROR push failed:', err.message);
        throw err;
      }
    }

    try {
      await state.saveState({
        last_emitted_minute_epoch: loaded.last_emitted_minute_epoch,
        pushed_through_minute: to_minute,
      });
    } catch (err) {
      console.error('sawtooth-precompute ERROR saveState (pushed) failed:', err.message);
      throw err;
    }

    try {
      await state.saveState({ last_emitted_minute_epoch: to_minute });
    } catch (err) {
      console.error('sawtooth-precompute ERROR saveState (checkpoint) failed; next run will recover via pushed_through_minute', err.message);
      throw err;
    }

    const wall_at_push = Date.now() / 1000;
    const anchorEpoch = lastAnchorUsed ? lastAnchorUsed.gtl_epoch : -1;
    const anchorGtlAgeSeconds = lastAnchorUsed ? Math.round(wall_at_push - lastAnchorUsed.gtl_epoch) : -1;
    const emitDelayActualSeconds = Math.round(wall_at_push - to_minute);
    console.log(
      'sawtooth-precompute pushed gtl_rows=' +
        rawRows.length +
        ' parsed=' +
        rows.length +
        ' deduped=' +
        gtlList.length +
        ' skipped_no_anchor=' +
        skippedNoAnchor +
        ' minutes=' +
        points.length +
        ' end_minute=' +
        to_minute +
        ' anchor_gtl_epoch=' +
        anchorEpoch +
        ' anchor_gtl_age_seconds=' +
        anchorGtlAgeSeconds +
        ' emit_delay_actual_seconds=' +
        emitDelayActualSeconds
    );
  } catch (err) {
    if (err.message && !err.message.includes('sawtooth-precompute ERROR')) {
      console.error('sawtooth-precompute ERROR', err.message);
    }
    throw err;
  } finally {
    await state.close();
  }
}

module.exports = {
  run,
};
