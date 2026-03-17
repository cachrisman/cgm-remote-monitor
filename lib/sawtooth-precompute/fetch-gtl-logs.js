'use strict';

const https = require('https');

const QUERY_TIMEOUT_MS = 30000;
const TRIO_LOGS_TABLE = 't491594_trio_logs';
const TRIO_S3_TABLE = 't491594_trio_s3';
const GTL_FILTER = "JSONExtract(raw, 'message', 'Nullable(String)') LIKE '%event=complication_get_timeline_called%'";

/**
 * Builds the ClickHouse SQL for GTL logs. Uses S3 union when window > 40 min (2400 s).
 * @param {number} windowStartSec - Window start (Unix seconds).
 * @param {number} windowEndSec - Window end (Unix seconds).
 * @returns {string} SQL string (FORMAT JSONEachRow).
 */
function buildSql(windowStartSec, windowEndSec) {
  const useUnion = (windowEndSec - windowStartSec) > 2400;
  const dtBetween = `dt BETWEEN toDateTime(${Math.floor(windowStartSec)}) AND toDateTime(${Math.floor(windowEndSec)})`;
  const selectCols = 'toUnixTimestamp(dt) AS dt, JSONExtract(raw, \'message\', \'Nullable(String)\') AS message';

  if (useUnion) {
    return [
      'SELECT dt, message FROM (',
      `  SELECT ${selectCols} FROM remote(${TRIO_LOGS_TABLE}) WHERE ${dtBetween} AND ${GTL_FILTER}`,
      '  UNION ALL',
      `  SELECT ${selectCols} FROM s3Cluster(primary, ${TRIO_S3_TABLE}) WHERE _row_type = 1 AND ${dtBetween} AND ${GTL_FILTER}`,
      ') ORDER BY dt ASC FORMAT JSONEachRow'
    ].join('\n');
  }

  return [
    `SELECT ${selectCols} FROM remote(${TRIO_LOGS_TABLE})`,
    `WHERE ${dtBetween} AND ${GTL_FILTER}`,
    'ORDER BY dt ASC FORMAT JSONEachRow'
  ].join('\n');
}

/**
 * Parses Better Stack JSONEachRow response body into rows with dt and message.
 * @param {string} body - Raw response body (one JSON object per line).
 * @returns {Array<{ dt: number, message: string }>}
 * @throws {Error} On invalid or missing dt in any line.
 */
function parseJsonEachRow(body) {
  const rows = [];
  const lines = (body || '').trim().split('\n').filter(line => line.length > 0);
  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i]);
      const dt = obj.dt != null ? Number(obj.dt) : null;
      const message = obj.message != null ? String(obj.message) : '';
      if (dt == null || typeof dt !== 'number' || isNaN(dt)) {
        throw new Error('Missing or invalid dt in row');
      }
      rows.push({ dt, message });
    } catch (e) {
      throw new Error(`sawtooth-precompute: parse error at line ${i + 1}: ${e.message}`);
    }
  }
  return rows;
}

/**
 * POSTs SQL to Better Stack Query API (Basic auth, text/plain body). Parses JSONEachRow response.
 * @param {string} sql - Full SQL including FORMAT JSONEachRow.
 * @returns {Promise<Array<{ dt: number, message: string }>>}
 * @throws {Error} On missing env, non-2xx, timeout, or parse error.
 */
function postQuery(sql) {
  const host = process.env.BETTERSTACK_QUERY_HOST;
  const user = process.env.BETTERSTACK_QUERY_USER;
  const password = process.env.BETTERSTACK_QUERY_PASSWORD;
  if (!host || !user || !password) {
    throw new Error('sawtooth-precompute: BETTERSTACK_QUERY_HOST, BETTERSTACK_QUERY_USER, BETTERSTACK_QUERY_PASSWORD required');
  }

  const auth = Buffer.from(`${user}:${password}`).toString('base64');
  const path = '/?output_format_pretty_row_numbers=0';
  const body = sql;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host.replace(/^https:\/\//, '').replace(/\/$/, ''),
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(body, 'utf8'),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`sawtooth-precompute: query failed: HTTP ${res.statusCode} ${res.statusMessage}`));
          return;
        }
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        if (contentType.indexOf('json') === -1 && contentType.indexOf('plain') === -1) {
          reject(new Error(`sawtooth-precompute: unexpected Content-Type: ${res.headers['content-type']}`));
          return;
        }
        try {
          resolve(parseJsonEachRow(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(QUERY_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('sawtooth-precompute: query timeout'));
    });
    req.write(body, 'utf8');
    req.end();
  });
}

/**
 * Fetches GTL log rows from Better Stack (Trio logs) for the given time window.
 * @param {number} windowStartSec - Window start (Unix seconds).
 * @param {number} windowEndSec - Window end (Unix seconds).
 * @returns {Promise<Array<{ dt: number, message: string }>>}
 */
async function queryGtlLogs(windowStartSec, windowEndSec) {
  const sql = buildSql(windowStartSec, windowEndSec);
  const rows = await postQuery(sql);
  return rows;
}

module.exports = {
  queryGtlLogs,
  buildSql,
};
