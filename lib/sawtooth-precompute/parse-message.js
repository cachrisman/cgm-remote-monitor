'use strict';

const DATA_AGE_RE = /data_age_seconds=(\d+)/;
const BATTERY_STATE_RE = /battery_state=(charging|unplugged|unknown)/;
const GTL_EPOCH_RE = /get_timeline_at_epoch_seconds=(\d+)/;

/**
 * Extracts GTL fields from a log message string. Returns null if not a GTL event.
 * @param {string} messageStr - Raw message (e.g. from Better Stack log row).
 * @returns {{ data_age_seconds: number|null, battery_state: string|null, get_timeline_at_epoch_seconds: number|null }|null}
 */
function parseMessage(messageStr) {
  if (typeof messageStr !== 'string') return null;
  if (!messageStr.includes('event=complication_get_timeline_called')) return null;

  const dataAgeMatch = messageStr.match(DATA_AGE_RE);
  const batteryMatch = messageStr.match(BATTERY_STATE_RE);
  const gtlEpochMatch = messageStr.match(GTL_EPOCH_RE);

  const data_age_seconds = dataAgeMatch ? parseInt(dataAgeMatch[1], 10) : null;
  const battery_state = batteryMatch ? batteryMatch[1] : null;
  const get_timeline_at_epoch_seconds = gtlEpochMatch ? parseInt(gtlEpochMatch[1], 10) : null;

  return {
    data_age_seconds,
    battery_state,
    get_timeline_at_epoch_seconds,
  };
}

module.exports = {
  parseMessage,
};
