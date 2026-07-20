// backend/lib/redis.js
// Shared, lazy Redis client singleton.
// Exports getClient() — returns null when REDIS_URL is not configured so
// every caller can fall back gracefully without knowing about Redis at all.

const Redis = require("ioredis");

let _client = null;
let _failed  = false; // set after repeated errors — stops retrying dead connections
let _errorCount = 0;
const MAX_ERRORS_BEFORE_CIRCUIT_OPEN = 5;

function getClient() {
  if (!process.env.REDIS_URL) return null;
  if (_failed) return null;
  if (_client) return _client;

  // A malformed REDIS_URL (or any other construction-time error) must never
  // crash the caller — Redis is always an optional accelerator, never a
  // dependency the request pipeline can fail on.
  try {
    _client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest:  1,
      enableReadyCheck:      false,
      lazyConnect:           true,
      connectTimeout:        3000,  // 3 s
      commandTimeout:        2000,  // 2 s — Upstash cold-start can reach ~1 s
    });
  } catch (err) {
    _failed = true;
    console.error("[Redis] failed to construct client — Redis disabled:", err.message);
    return null;
  }

  _client.on("error", (err) => {
    _errorCount++;
    console.warn(`[Redis] error (${_errorCount}/${MAX_ERRORS_BEFORE_CIRCUIT_OPEN}):`, err.message);
    if (_errorCount >= MAX_ERRORS_BEFORE_CIRCUIT_OPEN) {
      _failed = true;
      _client = null;
      console.error("[Redis] circuit open — Redis disabled until process restart");
    }
  });

  _client.on("connect", () => {
    _errorCount = 0; // reset on successful connection
  });

  return _client;
}

// Convenience wrappers so callers don't need to handle null

async function get(key) {
  const c = getClient();
  if (!c) return null;
  try { return await c.get(key); }
  catch { return null; }
}

async function set(key, value, exSeconds) {
  const c = getClient();
  if (!c) return;
  try {
    if (exSeconds) await c.set(key, value, "EX", exSeconds);
    else           await c.set(key, value);
  } catch { /* no-op */ }
}

async function del(key) {
  const c = getClient();
  if (!c) return;
  try { await c.del(key); }
  catch { /* no-op */ }
}

async function ping() {
  const c = getClient();
  if (!c) return null;
  try { return await c.ping(); }
  catch { return null; }
}

module.exports = { getClient, get, set, del, ping };
