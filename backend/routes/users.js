const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/users — list users by role + institution
// Optional query params: ?limit=N&page=N for pagination (default: all up to 2000).
router.get("/", authenticate, async (req, res, next) => {
  try {
    const limit  = req.query.limit  ? Math.min(2000, Math.max(1, parseInt(req.query.limit,  10) || 2000)) : 2000;
    const page   = req.query.page   ? Math.max(1, parseInt(req.query.page,   10) || 1) : 1;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("profiles")
      .select("id, name, email, role, institution_id, avatar_url, created_at");

    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    if (req.query.role) {
      query = query.eq("role", req.query.role);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data, meta: { page, limit } });
  } catch (err) {
    return next(err);
  }
});

// GET /api/users/:id — single user profile with batch memberships
router.get("/:id", authenticate, requireRole("admin", "faculty", "super-admin"), async (req, res, next) => {
  try {
    let query = supabase
      .from("profiles")
      .select(`
        id, name, email, role, institution_id, avatar_url, created_at,
        batch_students(
          batch_id,
          batches:batch_id(id, name, status, start_date, end_date)
        )
      `)
      .eq("id", req.params.id);

    if (req.user.role !== "super-admin" && req.user.institution_id) {
      query = query.eq("institution_id", req.user.institution_id);
    }

    const { data, error } = await query.single();
    if (error || !data) return res.status(404).json({ error: "User not found" });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/users — create single user (admin/faculty/super-admin)
router.post(
  "/",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { email, password, name, role, institution_id } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: "email, password, name, role are required" });
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
      });

      if (authError) return res.status(400).json({ error: authError.message });

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: authData.user.id,
          email,
          name,
          role,
          institution_id: institution_id || req.user.institution_id,
        })
        .select()
        .single();

      if (profileError) return res.status(400).json({ error: profileError.message });
      return res.status(201).json({ data: profile });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/users/bulk — bulk create students from CSV (admin/faculty/super-admin)
router.post(
  "/bulk",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { students, default_password } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: "students array is required" });
    }
    if (students.length > 200) {
      return res.status(400).json({ error: "Maximum 200 students per import" });
    }

    const tempPassword = default_password || "Welcome@123";
    const failed = [];

    // 1. Validate all inputs up-front (no DB calls)
    const valid = [];
    for (const s of students) {
      const name = String(s.name || "").trim();
      const email = String(s.email || "").toLowerCase().trim();
      if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        failed.push({ email: email || "unknown", reason: "Invalid name or email" });
      } else {
        valid.push({ name, email });
      }
    }

    // 2. Create auth users concurrently in batches of 10 to respect Supabase rate limits.
    //    Each inner batch is fully parallel; outer batches are sequential.
    const AUTH_BATCH = 10;
    const authResults = [];

    for (let i = 0; i < valid.length; i += AUTH_BATCH) {
      const chunk = valid.slice(i, i + AUTH_BATCH);
      const results = await Promise.all(
        chunk.map(async ({ name, email }) => {
          try {
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
              email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: { name, role: "student" },
            });
            if (authError) {
              failed.push({ email, reason: authError.message });
              return null;
            }
            return { name, email, userId: authData.user.id };
          } catch (err) {
            failed.push({ email, reason: err.message });
            return null;
          }
        })
      );
      authResults.push(...results.filter(Boolean));
    }

    // 3. Single batch upsert replaces N individual profile inserts.
    let created = [];
    if (authResults.length > 0) {
      const profileRows = authResults.map(({ name, email, userId }) => ({
        id: userId,
        email,
        name,
        role: "student",
        institution_id: req.user.institution_id,
      }));

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .upsert(profileRows)
        .select();

      if (profileError) {
        for (const r of authResults) {
          failed.push({ email: r.email, reason: profileError.message });
        }
      } else {
        created = profiles || [];
      }
    }

    return res.status(201).json({ data: { created, failed, temp_password: tempPassword } });
  }
);

// PUT /api/users/:id — update user profile (own or admin/faculty)
router.put("/:id", authenticate, async (req, res, next) => {
  if (
    req.user.id !== req.params.id &&
    !["admin", "faculty", "super-admin"].includes(req.user.role)
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { name, avatar_url, status } = req.body;

  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/users/:id
router.delete(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { error } = await supabase.auth.admin.deleteUser(req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: { message: "User deleted" } });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
