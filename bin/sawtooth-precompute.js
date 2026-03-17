#!/usr/bin/env node
'use strict';

// Load .env for local dev only; does not overwrite existing env (Heroku injects Config Vars).
// Parser is minimal and may mishandle inline comments, escaped quotes, and multiline values.
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

run()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('sawtooth-precompute ERROR', err.message);
    process.exit(1);
  });
