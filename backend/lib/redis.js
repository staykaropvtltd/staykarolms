// backend/lib/redis.js
// Shared, lazy Redis client singleton.
// Exports getClient() — returns null when REDIS_URL is not configured so
// every caller can fall back gracefully without knowing about Redis at all.

const Redis = require("ioredis");

let _client = null;
let _failed  = false; // don't retry after a hard failure

function getClient() {
  if (!process.env.REDIS_URL) return null;
  if (_failed) return null;
  if (_client) return _client;

  _client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest:  1,
    enableReadyCheck:      false,
    lazyConnect:           true,
    connectTimeout:        2000,  // 2 s — don't stall request pipeline
    commandTimeout:        500,   // 500 ms per command
  });

  _client.on("error", (err) => {
    console.warn("[Redis] error:", err.message);
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
