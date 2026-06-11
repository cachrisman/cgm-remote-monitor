'use strict';

/**
 * Temporary sanitized payload capture for migration fixture evidence
 * (Track B item 7 of docs/personal-migration-2-week-plan.md).
 *
 * Logs one JSON line per incoming API write document to stdout, where the
 * Heroku log drain ships it to Better Stack. Array bodies are logged one
 * line per element so lines stay small (Heroku truncates long lines) and
 * fixtures stay granular.
 *
 * Copy this file into the legacy repo as lib/server/nscap.js and mount it
 * AFTER each router's own body parsers — see README.md in this directory.
 * It must never run before the router's parser and must never break the
 * write path: all failures are swallowed.
 *
 * Enable with NSCAP_ENABLED=true (heroku config:set NSCAP_ENABLED=true).
 * Disable with NSCAP_ENABLED unset/false — mounted middleware becomes a
 * no-op, so rollback never requires a code change.
 */

var SECRET_KEYS = ['secret', 'api_secret', 'api-secret', 'token', 'authorization'];
var MAX_ITEM_CHARS = 6000;

function sanitize (value) {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value && typeof value === 'object') {
    var out = {};
    Object.keys(value).forEach(function (key) {
      if (SECRET_KEYS.indexOf(key.toLowerCase()) !== -1) {
        return;
      }
      out[key] = sanitize(value[key]);
    });
    return out;
  }
  return value;
}

function logItem (collection, item, seq, batchSize) {
  var line = JSON.stringify({
    col: collection,
    ts: new Date().toISOString(),
    seq: seq,
    n: batchSize,
    doc: sanitize(item)
  });
  if (line.length > MAX_ITEM_CHARS) {
    line = JSON.stringify({
      col: collection,
      ts: new Date().toISOString(),
      seq: seq,
      n: batchSize,
      truncated: true,
      keys: Object.keys(item || {})
    });
  }
  console.log('NSCAP1 ' + line);
}

module.exports = function nscap (collection) {
  return function nscapMiddleware (req, res, next) {
    try {
      if (process.env.NSCAP_ENABLED === 'true' &&
          (req.method === 'POST' || req.method === 'PUT') &&
          req.body && Object.keys(req.body).length > 0) {
        var items = Array.isArray(req.body) ? req.body : [req.body];
        for (var i = 0; i < items.length; i++) {
          logItem(collection, items[i], i, items.length);
        }
      }
    } catch (err) {
      // Capture must never break the write path; swallow everything.
    }
    next();
  };
};
