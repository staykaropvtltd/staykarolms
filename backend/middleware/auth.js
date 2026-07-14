const supabase = require("../lib/supabase");

// Cache verified tokens for 60 s to avoid hammering supabase.auth.getUser()
// on every request and hitting Supabase's rate limit (HTTP 429).
const TOKEN_CACHE_TTL_MS = 60 * 1000;
const tokenCache = new Map(); // token → { profile, expiresAt }

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const now = Date.now();

  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > now) {
    req.user = cached.profile;
    return next();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      tokenCache.delete(token);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Fetch only the fields needed for auth/role decisions.
    // avatar_url is a large string and only needed in /api/auth/me responses,
    // not for every authenticated request.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email, role, institution_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      if (profileError) {
        console.error("Profile fetch error:", profileError);
      }
      return res.status(401).json({ error: "User profile not found" });
    }

    tokenCache.set(token, { profile, expiresAt: now + TOKEN_CACHE_TTL_MS });

    // Prune stale entries when cache grows large
    if (tokenCache.size > 500) {
      for (const [k, v] of tokenCache) {
        if (v.expiresAt <= now) tokenCache.delete(k);
      }
    }

    req.user = profile;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

module.exports = authenticate;
