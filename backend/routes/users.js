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

// POST /api/users/nominal-roll — bulk onboard students from a college nominal roll CSV.
//
// Accepts { students, email_domain, password_mode, default_password?, batch_id? }.
// Generates email as  <sanitised_roll_no>@<email_domain>.
// Sets password to the roll number (password_mode="roll_no") or a custom value.
// Skips duplicate Supabase auth users (counts them as already_existed) rather than failing.
// Optionally auto-assigns every student (new + pre-existing) to batch_id.
// Cap: 400 students per call — frontend must chunk larger files.
router.post(
  "/nominal-roll",
  authenticate,
  requireRole("admin", "super-admin"),
  async (req, res, next) => {
    const {
      students,
      email_domain,
      password_mode,
      default_password,
      batch_id,
    } = req.body;

    // ── Input validation ─────────────────────────────────────────────────────
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: "students array is required" });
    }
    if (students.length > 400) {
      return res.status(400).json({ error: "Maximum 400 students per request — split into batches on the client." });
    }
    if (!email_domain || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(email_domain)) {
      return res.status(400).json({ error: "email_domain is required (e.g. cmrtc.edu.in)" });
    }
    if (password_mode === "custom" && (!default_password || default_password.length < 6)) {
      return res.status(400).json({ error: "default_password must be at least 6 characters when password_mode is 'custom'" });
    }

    // ── Build and validate records ────────────────────────────────────────────
    const failures = [];
    const valid    = [];
    const seenEmails = new Set();

    for (let i = 0; i < students.length; i++) {
      const s      = students[i];
      const rollNo = String(s.roll_no || "").trim().toUpperCase();
      const name   = String(s.name   || "").trim();

      if (!rollNo) {
        failures.push({ roll_no: "(empty)", reason: `Row ${i + 1}: roll number is required` });
        continue;
      }
      if (!name) {
        failures.push({ roll_no: rollNo, reason: "Student name is required" });
        continue;
      }

      // Sanitise roll number for use as email local-part.
      // JNTUH roll nos are alphanumeric (e.g. 21N81A0501) — safe after lowercase.
      const localPart = rollNo.toLowerCase().replace(/[^a-z0-9._-]/g, "");
      if (!localPart) {
        failures.push({ roll_no: rollNo, reason: "Roll number cannot be converted to a valid email local-part" });
        continue;
      }

      const email    = `${localPart}@${email_domain}`;
      const password = password_mode === "custom" ? default_password : rollNo;

      if (seenEmails.has(email)) {
        failures.push({ roll_no: rollNo, email, reason: "Duplicate roll number in this batch" });
        continue;
      }
      seenEmails.add(email);

      valid.push({
        rollNo,
        name,
        email,
        password,
        section: String(s.section || "").trim() || null,
        branch:  String(s.branch  || "").trim() || null,
      });
    }

    // ── Create Supabase auth users in parallel batches of 10 ─────────────────
    const AUTH_BATCH = 10;
    const authCreated          = [];  // { rollNo, name, email, userId, section, branch }
    const alreadyExistedEmails = new Set();
    let   alreadyExistedCount  = 0;

    for (let i = 0; i < valid.length; i += AUTH_BATCH) {
      const chunk = valid.slice(i, i + AUTH_BATCH);
      const results = await Promise.all(
        chunk.map(async (s) => {
          try {
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
              email:         s.email,
              password:      s.password,
              email_confirm: true,
              user_metadata: {
                name:    s.name,
                role:    "student",
                roll_no: s.rollNo,
                section: s.section,
                branch:  s.branch,
              },
            });

            if (authError) {
              // HTTP 422 / "already registered" → not a real failure, student exists
              if (authError.status === 422 || /already/i.test(authError.message || "")) {
                alreadyExistedEmails.add(s.email);
                alreadyExistedCount++;
                return null;
              }
              failures.push({ roll_no: s.rollNo, email: s.email, reason: authError.message });
              return null;
            }

            return { ...s, userId: authData.user.id };
          } catch (err) {
            failures.push({ roll_no: s.rollNo, email: s.email, reason: err.message });
            return null;
          }
        })
      );
      authCreated.push(...results.filter(Boolean));
    }

    // ── Batch upsert profiles for newly created auth users ────────────────────
    let createdCount      = 0;
    const createdProfileIds = [];

    if (authCreated.length > 0) {
      const profileRows = authCreated.map((s) => ({
        id:             s.userId,
        email:          s.email,
        name:           s.name,
        role:           "student",
        institution_id: req.user.institution_id,
      }));

      const { data: profiles, error: profileErr } = await supabase
        .from("profiles")
        .upsert(profileRows)
        .select("id");

      if (profileErr) {
        for (const s of authCreated) {
          failures.push({ roll_no: s.rollNo, email: s.email, reason: `Profile insert failed: ${profileErr.message}` });
        }
      } else {
        createdCount = (profiles || []).length;
        createdProfileIds.push(...(profiles || []).map((p) => p.id));
      }
    }

    // ── Auto-assign to batch ──────────────────────────────────────────────────
    // Assigns both newly created AND pre-existing students so re-running the import
    // still batch-assigns everyone even if their auth accounts already existed.
    let batchAssigned = 0;
    if (batch_id && (createdProfileIds.length > 0 || alreadyExistedEmails.size > 0)) {
      try {
        let allStudentIds = [...createdProfileIds];

        if (alreadyExistedEmails.size > 0) {
          const { data: existing } = await supabase
            .from("profiles")
            .select("id")
            .in("email", [...alreadyExistedEmails])
            .eq("institution_id", req.user.institution_id);
          if (existing) allStudentIds.push(...existing.map((p) => p.id));
        }

        if (allStudentIds.length > 0) {
          const batchRows = allStudentIds.map((student_id) => ({ batch_id, student_id }));
          const { error: batchErr } = await supabase
            .from("batch_students")
            .upsert(batchRows, { onConflict: "batch_id,student_id" });

          if (!batchErr) {
            batchAssigned = allStudentIds.length;

            // Fire-and-forget: enroll all students in courses already assigned to this batch
            supabase
              .from("batch_courses")
              .select("course_id")
              .eq("batch_id", batch_id)
              .then(({ data: courses }) => {
                if (!courses || courses.length === 0) return;
                const enrollRows = [];
                for (const sid of allStudentIds) {
                  for (const { course_id } of courses) {
                    enrollRows.push({ course_id, student_id: sid });
                  }
                }
                if (enrollRows.length > 0) {
                  supabase
                    .from("enrollments")
                    .upsert(enrollRows, { onConflict: "course_id,student_id" })
                    .catch((err) => console.error("[nominal-roll] enrollment fire-and-forget:", err.message));
                }
              })
              .catch((err) => console.error("[nominal-roll] batch courses fetch:", err.message));
          }
        }
      } catch (batchErr) {
        console.error("[nominal-roll] batch assignment error:", batchErr.message);
      }
    }

    return res.status(201).json({
      data: {
        total:           students.length,
        created:         createdCount,
        already_existed: alreadyExistedCount,
        failed:          failures.length,
        batch_assigned:  batchAssigned,
        failures,
      },
    });
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
