#!/usr/bin/env node
'use strict';

// Load .env for local dev only; does not overwrite existing env (Heroku injects Config Vars).
(function loadEnv() {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        const val = m[2].replace(/^["']|["']$/g, '').trim();
        process.env[m[1]] = val;
      }
    });
  }
})();

const run = require('../lib/sawtooth-precompute/run').run;

function msUntilNextMinuteBoundary() {
  const now = Date.now();
  const next = (Math.floor(now / 60000) + 1) * 60000;
  return Math.max(0, next - now);
}

let sigtermReceived = false;
let shutdownResolve = null;

process.on('SIGTERM', () => {
  sigtermReceived = true;
  if (shutdownResolve) shutdownResolve();
});

function sleepUntil(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      shutdownResolve = null;
      resolve();
    }, ms);
    shutdownResolve = () => {
      clearTimeout(t);
      shutdownResolve = null;
      resolve();
    };
  });
}

async function main() {
  while (!sigtermReceived) {
    const ms = msUntilNextMinuteBoundary();
    await sleepUntil(ms);
    if (sigtermReceived) break;
    try {
      await run();
    } catch (err) {
      console.error('sawtooth-clock run ERROR', err.message);
    }
  }
  process.exit(0);
}

main();
