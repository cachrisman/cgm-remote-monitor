'use strict';

const https = require('https');

const PUSH_TIMEOUT_MS = 60000;
const METRIC_NAME = 'complication_visible_recency_seconds';

/**
 * POSTs gauge points to Better Stack ingest (BETTERSTACK_INGEST_HOST/metrics, Bearer token).
 * @param {Array<{ minute_epoch: number, value: number }>} points - One point per minute to push.
 * @returns {Promise<void>}
 * @throws {Error} On missing env, non-2xx, or timeout.
 */
function pushGauges(points) {
  const host = process.env.BETTERSTACK_INGEST_HOST;
  const token = process.env.BETTERSTACK_RECENCY_SOURCE_TOKEN;
  if (!host || !token) {
    throw new Error('sawtooth-precompute: BETTERSTACK_INGEST_HOST and BETTERSTACK_RECENCY_SOURCE_TOKEN required');
  }

  const hostname = host.replace(/^https:\/\//, '').replace(/\/$/, '');
  const body = JSON.stringify(points.map(p => ({
    name: METRIC_NAME,
    gauge: { value: p.value },
    dt: p.minute_epoch,
  })));

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      port: 443,
      path: '/metrics',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body, 'utf8'),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`sawtooth-precompute: push failed: HTTP ${res.statusCode} ${data || res.statusMessage}`));
          return;
        }
        resolve();
      });
    });
    req.on('error', reject);
    req.setTimeout(PUSH_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('sawtooth-precompute: push timeout'));
    });
    req.write(body, 'utf8');
    req.end();
  });
}

module.exports = {
  pushGauges,
};
