'use strict';

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const LOCK_RETRY_MS = 500;
const LOCK_RETRIES = 120; // 60s max wait
const LOCK_STALE_MS = 5 * 60 * 1000; // 5 min
const LOCK_CREATION_GRACE_MS = 15000; // 15 s — do not reap unreadable lock file if mtime is this recent (avoids race with creator)
const MONGO_LEASE_EXPIRY_MS = 5 * 60 * 1000; // 5 min (longer than worst-case run: query + push + DB)

/**
 * Resolves state backend from env: 'file' or 'mongo'. Uses mongo when MONGODB_URI is set unless explicitly file.
 * @returns {'file'|'mongo'}
 */
function getBackend() {
  const explicit = process.env.SAWTOOTH_STATE_BACKEND;
  if (explicit === 'file') return 'file';
  if (explicit === 'mongo') return 'mongo';
  if (process.env.MONGODB_URI) return 'mongo';
  return 'file';
}

/**
 * Path to the checkpoint JSON file (file backend).
 * @returns {string}
 */
function getStateFilePath() {
  return process.env.SAWTOOTH_STATE_FILE || path.join(process.cwd(), 'data', 'sawtooth-precompute-state.json');
}

/**
 * Path to the lock file (same base path as state file with .lock extension).
 * @returns {string}
 */
function getLockFilePath() {
  const stateFile = getStateFilePath();
  return stateFile.replace(/\.json$/i, '.lock');
}

/**
 * Ensures the directory for the given file path exists (creates it recursively if not).
 * @param {string} filePath - Full path to a file.
 */
function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Resolves after the given number of milliseconds.
 * @param {number} ms - Delay in milliseconds.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Checks whether a process with the given PID is still running (Unix: process.kill(pid, 0)).
 * @param {number} pid - Process ID.
 * @returns {boolean}
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// --- File backend with lock (stale detection + async sleep) ---

let fileLockFd = null;

/**
 * If the lock file exists, reads pid/ts and removes the lock if the process is dead or ts is older than LOCK_STALE_MS.
 * If the file is unreadable or invalid JSON, only reaps when mtime is older than LOCK_CREATION_GRACE_MS to avoid
 * deleting a lock that is being created (race between openSync and writeSync).
 * @param {string} lockPath - Path to the lock file.
 * @returns {boolean} True if the lock was removed (stale), false if still held or recently created.
 */
function tryReapStaleLock(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const data = JSON.parse(raw);
    const pid = data.pid;
    const ts = data.ts != null ? data.ts : 0;
    if (!isPidAlive(pid) || (Date.now() - ts > LOCK_STALE_MS)) {
      fs.unlinkSync(lockPath);
      return true;
    }
  } catch (e) {
    try {
      const stat = fs.statSync(lockPath);
      const mtimeMs = stat.mtimeMs != null ? stat.mtimeMs : stat.mtime.getTime();
      const mtimeAge = Date.now() - mtimeMs;
      if (mtimeAge > LOCK_CREATION_GRACE_MS) {
        fs.unlinkSync(lockPath);
        return true;
      }
    } catch (statErr) {
      // file gone or inaccessible; nothing to reap
    }
  }
  return false;
}

/**
 * Acquires the file lock (create .lock with pid/ts). Retries with sleep if lock exists; reaps stale locks.
 * @returns {Promise<void>}
 * @throws {Error} If lock could not be acquired after retries.
 */
async function acquireFileLock() {
  const lockPath = getLockFilePath();
  ensureDirForFile(lockPath);
  for (let i = 0; i < LOCK_RETRIES; i++) {
    try {
      fileLockFd = fs.openSync(lockPath, 'wx');
      const meta = JSON.stringify({ pid: process.pid, ts: Date.now() });
      fs.writeSync(fileLockFd, meta);
      return;
    } catch (err) {
      if (err.code === 'EEXIST') {
        tryReapStaleLock(lockPath);
        if (i < LOCK_RETRIES - 1) {
          const ms = LOCK_RETRY_MS + Math.min(i * 50, 2000);
          await sleep(ms);
        } else {
          throw new Error('sawtooth-precompute: could not acquire lock file after retries');
        }
      } else {
        throw err;
      }
    }
  }
}

/**
 * Releases the file lock: closes fd, unlinks lock file. No-op if not held.
 */
function releaseFileLock() {
  if (fileLockFd != null) {
    try {
      fs.closeSync(fileLockFd);
      fileLockFd = null;
      fs.unlinkSync(getLockFilePath());
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Reads checkpoint from the state file. Throws on read/parse failure (fail closed).
 * @returns {{ last_emitted_minute_epoch: number, preparing_through_minute: number|null, pushed_through_minute: number|null }}
 * @throws {Error} On read or JSON parse failure.
 */
function loadStateFile() {
  const statePath = getStateFilePath();
  if (!fs.existsSync(statePath)) {
    return { last_emitted_minute_epoch: 0, preparing_through_minute: null, pushed_through_minute: null };
  }
  let raw;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch (e) {
    throw new Error('sawtooth-precompute: failed to read state file: ' + e.message);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('sawtooth-precompute: state file is corrupt or invalid JSON; aborting to avoid unbounded backfill');
  }
  const epoch = typeof data.last_emitted_minute_epoch === 'number' ? data.last_emitted_minute_epoch : 0;
  const preparing = typeof data.preparing_through_minute === 'number' ? data.preparing_through_minute : null;
  const pushed = typeof data.pushed_through_minute === 'number' ? data.pushed_through_minute : null;
  return {
    last_emitted_minute_epoch: Math.max(0, epoch),
    preparing_through_minute: preparing,
    pushed_through_minute: pushed,
  };
}

/**
 * Writes checkpoint to the state file (atomic: write to temp then rename).
 * @param {{ last_emitted_minute_epoch: number, preparing_through_minute?: number|null, pushed_through_minute?: number|null }} state
 */
function saveStateFile(state) {
  const statePath = getStateFilePath();
  ensureDirForFile(statePath);
  const payload = {
    last_emitted_minute_epoch: state.last_emitted_minute_epoch,
    preparing_through_minute: state.preparing_through_minute != null ? state.preparing_through_minute : null,
    pushed_through_minute: state.pushed_through_minute != null ? state.pushed_through_minute : null,
  };
  const tmpPath = statePath + '.' + process.pid + '.' + Date.now();
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 0), 'utf8');
  fs.renameSync(tmpPath, statePath);
}

// --- MongoDB backend (lease for overlap protection) ---

let mongoClient = null;
const LEASE_ID = 'lease';

/**
 * Returns the MongoDB collection used for checkpoint and lease (from SAWTOOTH_STATE_COLLECTION or default).
 * @returns {import('mongodb').Collection}
 * @throws {Error} If MongoDB client is not connected.
 */
function getMongoCollection() {
  if (!mongoClient) {
    throw new Error('sawtooth-precompute: MongoDB not connected');
  }
  const collName = process.env.SAWTOOTH_STATE_COLLECTION || 'sawtooth_precompute_state';
  return mongoClient.db().collection(collName);
}

/**
 * Connects to MongoDB using MONGODB_URI. Idempotent (reuses existing client).
 * @returns {Promise<void>}
 * @throws {Error} If MONGODB_URI is missing.
 */
async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('sawtooth-precompute: MONGODB_URI required for MongoDB backend');
  }
  if (mongoClient) return;
  mongoClient = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
}

/**
 * Acquires the Mongo lease (single-writer). Insert lease doc or take over if expired.
 * Uses findOneAndUpdate with returnOriginal: false (mongodb 3.6); result.value is the updated doc.
 * @returns {Promise<void>}
 * @throws {Error} If lease is held by another instance.
 */
async function acquireMongoLease() {
  await connectMongo();
  const coll = getMongoCollection();
  const now = new Date();
  const expired = new Date(now.getTime() - MONGO_LEASE_EXPIRY_MS);

  try {
    await coll.insertOne({
      _id: LEASE_ID,
      pid: process.pid,
      ts: now,
    });
    return;
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  
  const result = await coll.findOneAndUpdate(
    { _id: LEASE_ID, ts: { $lte: expired } },
    { $set: { pid: process.pid, ts: now } },
    { returnOriginal: false }
  );
  
  if (result && result.value && result.value.pid === process.pid) {
    return;
  }
  
  const doc = await coll.findOne({ _id: LEASE_ID });
  if (doc && doc.pid === process.pid) {
    return;
  }
  
  if (!doc) {
    return acquireMongoLease();
  }
  
  throw new Error('sawtooth-precompute: lease held by another instance (single writer required)');
}

/**
 * Releases the Mongo lease by deleting the lease document for this process.
 * @returns {Promise<void>}
 */
async function releaseMongoLease() {
  if (!mongoClient) return;
  const coll = getMongoCollection();
  await coll.deleteOne({ _id: LEASE_ID, pid: process.pid });
}

/**
 * Loads checkpoint from Mongo. Applies recovery: if pushed_through_minute set, advance and clear; if only preparing, clear without advancing.
 * @returns {Promise<{ last_emitted_minute_epoch: number, preparing_through_minute: null, pushed_through_minute: null }>}
 */
async function loadStateMongo() {
  await connectMongo();
  const coll = getMongoCollection();
  const doc = await coll.findOne({ _id: 'checkpoint' });
  let epoch = doc && typeof doc.last_emitted_minute_epoch === 'number'
    ? doc.last_emitted_minute_epoch
    : 0;
  const preparing = doc && typeof doc.preparing_through_minute === 'number' ? doc.preparing_through_minute : null;
  const pushed = doc && typeof doc.pushed_through_minute === 'number' ? doc.pushed_through_minute : null;

  if (pushed != null) {
    epoch = Math.max(epoch, pushed);
    console.log('sawtooth-precompute recovery: advanced checkpoint from pushed_through_minute to ' + epoch);
    await coll.updateOne(
      { _id: 'checkpoint' },
      { $set: { last_emitted_minute_epoch: epoch, preparing_through_minute: null, pushed_through_minute: null, updated_at: new Date() } },
      { upsert: true }
    );
    return { last_emitted_minute_epoch: Math.max(0, epoch), preparing_through_minute: null, pushed_through_minute: null };
  }
  if (preparing != null) {
    console.log('sawtooth-precompute recovery: cleared stale preparing_through_minute (will retry range)');
    await coll.updateOne(
      { _id: 'checkpoint' },
      { $set: { preparing_through_minute: null, pushed_through_minute: null, updated_at: new Date() } },
      { upsert: true }
    );
  }

  return {
    last_emitted_minute_epoch: Math.max(0, epoch),
    preparing_through_minute: null,
    pushed_through_minute: null,
  };
}

/**
 * Persists checkpoint to Mongo (upsert checkpoint document with last_emitted, preparing, pushed).
 * @param {{ last_emitted_minute_epoch: number, preparing_through_minute?: number|null, pushed_through_minute?: number|null }} state
 * @returns {Promise<void>}
 */
async function saveStateMongo(state) {
  await connectMongo();
  const coll = getMongoCollection();
  const set = {
    last_emitted_minute_epoch: state.last_emitted_minute_epoch,
    preparing_through_minute: state.preparing_through_minute != null ? state.preparing_through_minute : null,
    pushed_through_minute: state.pushed_through_minute != null ? state.pushed_through_minute : null,
    updated_at: new Date(),
  };
  await coll.updateOne(
    { _id: 'checkpoint' },
    { $set: set },
    { upsert: true }
  );
}

/**
 * Closes the MongoDB client connection. No-op if not connected.
 * @returns {Promise<void>}
 */
async function closeMongo() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
  }
}

// --- Public API ---

/**
 * Loads checkpoint (file or Mongo). For file: acquires lock first. Applies two-phase recovery if needed.
 * @returns {Promise<{ last_emitted_minute_epoch: number, preparing_through_minute: number|null, pushed_through_minute: number|null }>}
 */
async function loadState() {
  const backend = getBackend();
  if (backend === 'file') {
    await acquireFileLock();
    try {
      const s = loadStateFile();
      if (s.pushed_through_minute != null) {
        s.last_emitted_minute_epoch = Math.max(s.last_emitted_minute_epoch, s.pushed_through_minute);
        console.log('sawtooth-precompute recovery: advanced checkpoint from pushed_through_minute to ' + s.last_emitted_minute_epoch);
        s.preparing_through_minute = null;
        s.pushed_through_minute = null;
        saveStateFile(s);
      } else if (s.preparing_through_minute != null) {
        console.log('sawtooth-precompute recovery: cleared stale preparing_through_minute (will retry range)');
        s.preparing_through_minute = null;
        s.pushed_through_minute = null;
        saveStateFile(s);
      }
      return s;
    } catch (e) {
      releaseFileLock();
      throw e;
    }
  }
  await acquireMongoLease();
  try {
    return await loadStateMongo();
  } catch (e) {
    await releaseMongoLease();
    throw e;
  }
}

/**
 * Saves checkpoint. File backend: writes file only (does not release lock). Mongo: upserts checkpoint doc.
 * @param {{ last_emitted_minute_epoch: number, preparing_through_minute?: number|null, pushed_through_minute?: number|null }} state
 * @returns {Promise<void>}
 */
async function saveState(state) {
  const backend = getBackend();
  if (backend === 'file') {
    saveStateFile(state);
    return;
  }
  await saveStateMongo(state);
}

/**
 * Releases the file lock only (no-op for Mongo). Called by close().
 */
function releaseLock() {
  if (getBackend() === 'file') {
    releaseFileLock();
  }
}

/**
 * Releases lock/lease and closes Mongo connection. Safe to call multiple times.
 * @returns {Promise<void>}
 */
async function close() {
  releaseLock();
  if (getBackend() === 'mongo') {
    await releaseMongoLease();
  }
  await closeMongo();
}

module.exports = {
  getBackend,
  loadState,
  saveState,
  releaseLock,
  close,
};
