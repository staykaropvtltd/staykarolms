const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/batches — list batches for current institution
router.get("/", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("batches")
      .select("*, profiles:mentor_id(name, email)")
      .eq("institution_id", req.user.institution_id)
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

// GET /api/batches/:id — single batch with students
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    let query = supabase
      .from("batches")
      .select("*, batch_students(profiles:student_id(id, name, email, avatar_url))")
      .eq("id", req.params.id);

    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    const { data, error } = await query.single();

    if (error || !data) return res.status(404).json({ error: "Batch not found" });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/batches — create batch (admin only)
router.post("/", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  const { name, description, mentor_id, start_date, end_date } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  try {
    const { data, error } = await supabase
      .from("batches")
      .insert({
        name,
        description,
        mentor_id,
        start_date,
        end_date,
        institution_id: req.user.institution_id,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/batches/:id — update batch
router.put("/:id", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("batches")
      .update(req.body)
      .eq("id", req.params.id)
      .eq("institution_id", req.user.institution_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/batches/:id
router.delete("/:id", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from("batches")
      .delete()
      .eq("id", req.params.id)
      .eq("institution_id", req.user.institution_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: { message: "Batch deleted" } });
  } catch (err) {
    return next(err);
  }
});

// GET /api/batches/:id/courses — list courses allocated to a batch
router.get("/:id/courses", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("batch_courses")
      .select("*, courses:course_id(id, title, description, thumbnail_url, faculty_id, profiles:faculty_id(name))")
      .eq("batch_id", req.params.id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

// POST /api/batches/:id/courses — allocate a course to a batch and enroll all current batch students
router.post("/:id/courses", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  const { course_id } = req.body;
  if (!course_id) return res.status(400).json({ error: "course_id is required" });

  try {
    // 1. Create batch_courses link (upsert so duplicate is safe)
    const { data: bc, error: bcErr } = await supabase
      .from("batch_courses")
      .upsert({ batch_id: req.params.id, course_id }, { onConflict: "batch_id,course_id", ignoreDuplicates: true })
      .select()
      .single();

    if (bcErr) return res.status(400).json({ error: bcErr.message });

    // 2. Fetch all students currently in this batch
    const { data: batchStudents, error: bsErr } = await supabase
      .from("batch_students")
      .select("student_id")
      .eq("batch_id", req.params.id);

    if (bsErr) return res.status(400).json({ error: bsErr.message });

    // 3. Bulk-enroll all batch students into the course (ignore duplicates)
    if (batchStudents && batchStudents.length > 0) {
      const enrollments = batchStudents.map(bs => ({ course_id, student_id: bs.student_id }));
      const { error: enrErr } = await supabase
        .from("enrollments")
        .upsert(enrollments, { onConflict: "course_id,student_id", ignoreDuplicates: true });
      if (enrErr) return res.status(400).json({ error: enrErr.message });
    }

    return res.status(201).json({ data: { ...bc, enrolled: batchStudents?.length || 0 } });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/batches/:id/courses/:courseId — remove course allocation from batch
router.delete("/:id/courses/:courseId", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from("batch_courses")
      .delete()
      .eq("batch_id", req.params.id)
      .eq("course_id", req.params.courseId);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: { message: "Course removed from batch" } });
  } catch (err) {
    return next(err);
  }
});

// POST /api/batches/:id/students — add student to batch and enroll them in all batch courses
router.post("/:id/students", authenticate, requireRole("admin", "faculty", "super-admin"), async (req, res, next) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: "student_id is required" });

  try {
    const { data, error } = await supabase
      .from("batch_students")
      .insert({ batch_id: req.params.id, student_id })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Auto-enroll in all courses already allocated to this batch
    const { data: batchCourses } = await supabase
      .from("batch_courses")
      .select("course_id")
      .eq("batch_id", req.params.id);

    if (batchCourses && batchCourses.length > 0) {
      const enrollments = batchCourses.map(bc => ({ course_id: bc.course_id, student_id }));
      await supabase
        .from("enrollments")
        .upsert(enrollments, { onConflict: "course_id,student_id", ignoreDuplicates: true });
    }

    return res.status(201).json({ data, auto_enrolled: batchCourses?.length || 0 });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/batches/:id/students/:studentId — remove student from batch
router.delete("/:id/students/:studentId", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from("batch_students")
      .delete()
      .eq("batch_id", req.params.id)
      .eq("student_id", req.params.studentId);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: { message: "Student removed from batch" } });
  } catch (err) {
    return next(err);
  }
});

// POST /api/batches/:id/students/bulk — add multiple students by email (CSV import)
router.post("/:id/students/bulk", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  const { emails } = req.body;
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: "emails array is required" });
  }

  const cleaned = [...new Set(emails.map(e => String(e).toLowerCase().trim()))].filter(e => e.includes("@"));
  if (cleaned.length === 0) {
    return res.status(400).json({ error: "No valid email addresses provided" });
  }

  try {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("institution_id", req.user.institution_id)
      .eq("role", "student")
      .in("email", cleaned);

    if (profileError) return res.status(400).json({ error: profileError.message });

    const foundEmails = new Set((profiles || []).map(p => p.email.toLowerCase()));
    const notFound = cleaned.filter(e => !foundEmails.has(e));

    if (!profiles || profiles.length === 0) {
      return res.status(404).json({ error: "No matching students found in your institution", not_found: notFound });
    }

    const inserts = profiles.map(p => ({ batch_id: req.params.id, student_id: p.id }));

    const { error: insertError } = await supabase
      .from("batch_students")
      .upsert(inserts, { onConflict: "batch_id,student_id", ignoreDuplicates: true });

    if (insertError) return res.status(400).json({ error: insertError.message });

    // Auto-enroll all added students in batch's allocated courses
    const { data: batchCourses } = await supabase
      .from("batch_courses")
      .select("course_id")
      .eq("batch_id", req.params.id);

    if (batchCourses && batchCourses.length > 0) {
      const enrollments = profiles.flatMap(p =>
        batchCourses.map(bc => ({ course_id: bc.course_id, student_id: p.id }))
      );
      await supabase
        .from("enrollments")
        .upsert(enrollments, { onConflict: "course_id,student_id", ignoreDuplicates: true });
    }

    return res.status(201).json({
      data: { added: profiles.length, not_found: notFound },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
