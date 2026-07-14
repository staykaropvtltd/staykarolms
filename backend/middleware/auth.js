// backend/middleware/auth.js
// Authentication middleware.
//
// Hot path (every request):
//   1. Verify JWT LOCALLY with jsonwebtoken — zero network calls.
//      Requires SUPABASE_JWT_SECRET env var (Dashboard → Settings → API → JWT Secret).
//   2. Look up the profile in Redis (if REDIS_URL is set) — zero DB calls on hit.
//   3. Fall back to a single Supabase profile SELECT on Redis miss.
//
// Compared to the old approach (supabase.auth.getUser → remote API call every miss),
// this eliminates at least one network round-trip per request (~200-400 ms on Vercel).

const jwt      = require("jsonwebtoken");
const supabase  = require("../lib/supabase");
const redis     = require("../lib/redis");

// In-process fallback cache — useful when Redis is absent and the backend
// is long-lived (e.g. PM2 / VPS). Worthless on Vercel serverless (new process
// per invocation) but adds zero cost.
const _localCache   = new Map(); // token → { profile, expiresAt }
const LOCAL_TTL_MS  = 60_000;   // 60 s
const REDIS_TTL_S   = 60;       // 60 s

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7).trim();
  const now   = Date.now();

  // ── 1. In-process cache ──────────────────────────────────────
  const local = _localCache.get(token);
  if (local && local.expiresAt > now) {
    req.user = local.profile;
    return next();
  }

  // ── 2. Local JWT verification (no network) ───────────────────
  let decoded;
  if (process.env.SUPABASE_JWT_SECRET) {
    try {
      decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms: ["HS256"] });
    } catch {
      _localCache.delete(token);
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  } else {
    // SUPABASE_JWT_SECRET not set — fall back to remote verification
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        _localCache.delete(token);
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      decoded = { sub: user.id };
    } catch (err) {
      console.error("[auth] remote getUser error:", err.message);
      return res.status(500).json({ error: "Authentication failed" });
    }
  }

  const userId = decoded?.sub;
  if (!userId) {
    return res.status(401).json({ error: "Invalid token: missing user ID" });
  }

  // ── 3. Redis profile cache ───────────────────────────────────
  const cacheKey = `profile:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      const profile = JSON.parse(cached);
      _localCache.set(token, { profile, expiresAt: now + LOCAL_TTL_MS });
      req.user = profile;
      return next();
    } catch { /* corrupt cache entry — fall through to DB */ }
  }

  // ── 4. DB profile fetch (cold path) ─────────────────────────
  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email, role, institution_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      if (profileError) console.error("[auth] profile fetch error:", profileError.message);
      return res.status(401).json({ error: "User profile not found" });
    }

    // Warm caches
    await redis.set(cacheKey, JSON.stringify(profile), REDIS_TTL_S);

    _localCache.set(token, { profile, expiresAt: now + LOCAL_TTL_MS });
    if (_localCache.size > 500) {
      for (const [k, v] of _localCache) {
        if (v.expiresAt <= now) _localCache.delete(k);
      }
    }

    req.user = profile;
    next();
  } catch (err) {
    console.error("[auth] middleware error:", err.message);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

module.exports = authenticate;
