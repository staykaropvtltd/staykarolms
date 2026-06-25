const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/users — list users by role + institution
router.get("/", authenticate, async (req, res, next) => {
  try {
    let query = supabase
      .from("profiles")
      .select("id, name, email, role, institution_id, avatar_url, created_at");

    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    if (req.query.role) {
      query = query.eq("role", req.query.role);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/users/:id — single user profile with batch memberships
router.get("/:id", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  try {
    let query = supabase
      .from("profiles")
      .select(`
        id, name, email, role, institution_id, avatar_url, phone, created_at,
        batch_students(
          batch_id,
          batches:batch_id(id, name, status, start_date, end_date)
        )
      `)
      .eq("id", req.params.id);

    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    const { data, error } = await query.single();
    if (error || !data) return res.status(404).json({ error: "User not found" });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/users — create single user (admin/super-admin)
router.post(
  "/",
  authenticate,
  requireRole("admin", "super-admin"),
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

// POST /api/users/bulk — bulk create students from CSV (admin/super-admin)
router.post(
  "/bulk",
  authenticate,
  requireRole("admin", "super-admin"),
  async (req, res, next) => {
    const { students, default_password } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: "students array is required" });
    }
    if (students.length > 200) {
      return res.status(400).json({ error: "Maximum 200 students per import" });
    }

    const tempPassword = default_password || "Welcome@123";
    const created = [];
    const failed = [];

    for (const s of students) {
      const name = String(s.name || "").trim();
      const email = String(s.email || "").toLowerCase().trim();

      if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        failed.push({ email: email || "unknown", reason: "Invalid name or email" });
        continue;
      }

      try {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { name, role: "student" },
        });

        if (authError) {
          failed.push({ email, reason: authError.message });
          continue;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .upsert({
            id: authData.user.id,
            email,
            name,
            role: "student",
            institution_id: req.user.institution_id,
          })
          .select()
          .single();

        if (profileError) {
          failed.push({ email, reason: profileError.message });
          continue;
        }

        created.push(profile);
      } catch (err) {
        failed.push({ email, reason: err.message });
      }
    }

    return res.status(201).json({ data: { created, failed, temp_password: tempPassword } });
  }
);

// PUT /api/users/:id — update user profile (own or admin)
router.put("/:id", authenticate, async (req, res, next) => {
  if (
    req.user.id !== req.params.id &&
    !["admin", "super-admin"].includes(req.user.role)
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { name, avatar_url, phone } = req.body;

  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (phone !== undefined) updates.phone = phone;

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
  requireRole("admin", "super-admin"),
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
