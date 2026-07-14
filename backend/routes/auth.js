const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    // Fetch profile concurrently — no need to wait for signIn to finish first
    const [{ data: profile }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, name, email, role, institution_id, avatar_url")
        .eq("id", data.user.id)
        .single(),
    ]);

    // Audit log is fire-and-forget — don't block the login response
    const { logAudit } = require("../lib/audit");
    const userObj = profile || data.user;
    logAudit(req, userObj, "login", "auth", userObj.id, "info", "success", {})
      .catch((aErr) => console.error("[auth] login audit error:", aErr.message));

    return res.json({
      data: {
        session: data.session,
        user: profile || data.user,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/logout
router.post("/logout", authenticate, async (req, res, next) => {
  try {
    // Audit Log
    try {
      const { logAudit } = require("../lib/audit");
      await logAudit(req, req.user, "logout", "auth", req.user.id, "info", "success", {});
    } catch (aErr) {
      console.error("[auth] logout audit error:", aErr.message);
    }

    const { error } = await supabase.auth.signOut();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data: { message: "Logged out successfully" } });
  } catch (err) {
    return next(err);
  }
});

// GET /api/auth/me — returns full profile including avatar_url
router.get("/me", authenticate, async (req, res, next) => {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, name, email, role, institution_id, avatar_url")
      .eq("id", req.user.id)
      .single();
    return res.json({ data: profile || req.user });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
