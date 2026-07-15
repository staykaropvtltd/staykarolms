// backend/middleware/auth.js
// Authentication middleware — optimized for Vercel serverless + high concurrency.
//
// Hot path per request:
//   1. In-process cache (within same warm lambda) — 0 network calls.
//   2. Redis cache keyed by SHA-256(token) — 0 Supabase calls on hit.
//      A Redis hit skips both remote JWT verification AND the profile DB fetch.
//      This collapses auth cost to a single ~1 ms Redis GET across cold-start lambdas.
//   3. Cold path (first request per token): remote JWT verify + profile DB fetch → cache both.
//
// Redis TTL is bounded by the token's own expiry so revoked/expired tokens
// are never served from cache past their real expiry.

const crypto   = require("crypto");
const jwt      = require("jsonwebtoken");
const supabase = require("../lib/supabase");
const redis    = require("../lib/redis");

const _localCache  = new Map(); // cacheKey → { profile, expiresAt }
const LOCAL_TTL_MS = 60_000;    // 60 s — within a warm lambda invocation
const REDIS_TTL_S  = 300;       // 5 min — max Redis TTL (bounded by token expiry below)

// Derive a short, stable key from the token without logging the secret material.
function tokenCacheKey(token) {
  return "auth:" + crypto.createHash("sha256").update(token).digest("hex").slice(0, 40);
}

// Extract the JWT exp claim without verifying the signature.
// Used only to bound the Redis TTL so we never cache past real expiry.
function unsafeExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch { return null; }
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token    = header.slice(7).trim();
  const now      = Date.now();
  const cacheKey = tokenCacheKey(token);

  // ── 1. In-process cache (warm lambda — zero network) ─────────
  const local = _localCache.get(cacheKey);
  if (local && local.expiresAt > now) {
    req.user = local.profile;
    return next();
  }

  // ── 2. Redis cache (cross-lambda — zero Supabase calls on hit) ──
  // All Vercel instances share Redis, so a warm Redis entry means no
  // JWT re-verification and no profile DB lookup for any instance.
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      const profile = JSON.parse(cached);
      _localCache.set(cacheKey, { profile, expiresAt: now + LOCAL_TTL_MS });
      req.user = profile;
      return next();
    } catch { /* corrupt entry — fall through to cold path */ }
  }

  // ── 3. Cold path: verify JWT ──────────────────────────────────
  let userId;
  if (process.env.SUPABASE_JWT_SECRET) {
    // Local HS256 verification — zero network calls
    try {
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms: ["HS256"] });
      userId = decoded?.sub;
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  } else {
    // Remote ES256 verification (Supabase default) — one Supabase API call
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      userId = user.id;
    } catch (err) {
      console.error("[auth] remote getUser error:", err.message);
      return res.status(500).json({ error: "Authentication failed" });
    }
  }

  if (!userId) return res.status(401).json({ error: "Invalid token: missing user ID" });

  // ── 4. Cold path: fetch profile from DB ───────────────────────
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, name, email, role, institution_id")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      if (error) console.error("[auth] profile fetch error:", error.message);
      return res.status(401).json({ error: "User profile not found" });
    }

    // Compute Redis TTL: honour the token's real expiry so the cache never
    // outlives the token. Fall back to REDIS_TTL_S if exp is unreadable.
    const exp = unsafeExp(token);
    const ttl = exp
      ? Math.max(1, Math.min(REDIS_TTL_S, exp - Math.floor(now / 1000) - 10))
      : REDIS_TTL_S;

    await redis.set(cacheKey, JSON.stringify(profile), ttl);
    _localCache.set(cacheKey, { profile, expiresAt: now + LOCAL_TTL_MS });

    // Prune stale in-process entries
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
