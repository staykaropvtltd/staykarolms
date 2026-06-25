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

    // Fetch profile to include role
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, name, email, role, institution_id, avatar_url")
      .eq("id", data.user.id)
      .single();

    // Audit Log
    try {
      const { logAudit } = require("../lib/audit");
      const userObj = profile || data.user;
      await logAudit(req, userObj, "login", "auth", userObj.id, "info", "success", {});
    } catch (aErr) {
      console.error("[auth] login audit error:", aErr.message);
    }

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

// GET /api/auth/me
router.get("/me", authenticate, (req, res) => {
  return res.json({ data: req.user });
});

module.exports = router;
