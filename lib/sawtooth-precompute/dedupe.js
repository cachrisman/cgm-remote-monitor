'use strict';

/**
 * Dedupes GTL rows by dt. Per design §4.2: is_off_wrist = true if any row in the group
 * is charging or unknown ("any off-wrist wins"); data_age_seconds from on-wrist rows only.
 * Mixed groups (one off-wrist, one on-wrist) emit as off-wrist (value 0) per Explore semantics.
 * @param {Array<{ dt: number, data_age_seconds: number|null, battery_state: string|null, get_timeline_at_epoch_seconds: number|null }>} rows - Parsed GTL rows (same dt may appear twice).
 * @returns {Array<{ gtl_epoch: number, data_age_seconds: number|null, is_off_wrist: boolean }>} One row per dt, sorted by gtl_epoch.
 */
function dedupeByDt(rows) {
  const byDt = new Map();
  for (const r of rows) {
    const dt = r.dt;
    if (!byDt.has(dt)) {
      byDt.set(dt, []);
    }
    byDt.get(dt).push(r);
  }

  const out = [];
  for (const [dt, group] of byDt) {
    const isOffWrist = group.some(r => r.battery_state === 'charging' || r.battery_state === 'unknown');
    const onWrist = group.filter(r => r.battery_state !== 'charging' && r.battery_state !== 'unknown');
    const ages = onWrist.map(r => r.data_age_seconds).filter(x => x != null);
    const finalDataAge = ages.length ? Math.max(...ages) : null;

    const gtlEpochs = group.map(r => r.get_timeline_at_epoch_seconds).filter(x => x != null);
    let gtl_epoch = gtlEpochs.length ? Math.max(...gtlEpochs) : null;
    if (gtlEpochs.length > 1) {
      const uniq = [...new Set(gtlEpochs)];
      if (uniq.length > 1) {
        gtl_epoch = Math.max(...gtlEpochs);
        console.warn('sawtooth-precompute WARN gtl_epoch tie-break applied for dt=' + dt);
      }
    }
    if (gtl_epoch == null) continue;

    if (!isOffWrist && finalDataAge == null) continue;
    out.push({
      gtl_epoch,
      data_age_seconds: isOffWrist ? null : finalDataAge,
      is_off_wrist: isOffWrist,
    });
  }

  out.sort((a, b) => a.gtl_epoch - b.gtl_epoch);
  return out;
}

module.exports = {
  dedupeByDt,
};
