const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// POST /api/attendance/mark — faculty marks batch attendance
router.post(
  "/mark",
  authenticate,
  requireRole("faculty", "admin"),
  async (req, res, next) => {
    const { records } = req.body;
    // records: [{ student_id, course_id, date, status }]

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "records array is required" });
    }

    try {
      const { data, error } = await supabase
        .from("attendance")
        .upsert(records, { onConflict: "student_id,course_id,date" })
        .select();

      if (error) return res.status(400).json({ error: error.message });

      // Send notification to each student
      try {
        // Fetch course titles to make the message informative
        const courseIds = [...new Set(records.map(r => r.course_id))];
        const { data: courses } = await supabase
          .from("courses")
          .select("id, title")
          .in("id", courseIds);
        
        const courseMap = {};
        if (courses) {
          courses.forEach(c => {
            courseMap[c.id] = c.title;
          });
        }

        const notifRows = records.map((r) => ({
          user_id: r.student_id,
          title: "📋 Attendance Published",
          message: `Your attendance for "${courseMap[r.course_id] || 'Course'}" on ${r.date} has been marked as ${r.status}.`,
          type: r.status === "present" ? "success" : r.status === "late" ? "warning" : "error",
          category: "academic",
        }));
        
        await supabase.from("notifications").insert(notifRows);
      } catch (nErr) {
        console.error("[attendance] notification error:", nErr.message);
      }

      // Audit Log
      try {
        const { logAudit } = require("../lib/audit");
        await logAudit(req, req.user, "attendance_publish", "attendance", null, "info", "success", { count: records.length });
      } catch (aErr) {
        console.error("[attendance] audit log error:", aErr.message);
      }

      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/attendance/student/:id — get student's attendance
router.get("/student/:id", authenticate, async (req, res, next) => {
  // Students can only view their own attendance
  if (req.user.role === "student" && req.params.id !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { data, error } = await supabase
      .from("attendance")
      .select("*, courses:course_id(title)")
      .eq("student_id", req.params.id)
      .order("date", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/attendance/course/:id — get course's attendance
router.get(
  "/course/:id",
  authenticate,
  requireRole("faculty", "admin", "super-admin"),
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from("attendance")
        .select("*, profiles:student_id(name, avatar_url)")
        .eq("course_id", req.params.id)
        .order("date", { ascending: false });

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// ── Live Attendance Sessions ───────────────────────────────────────────────────

// POST /api/attendance/sessions — faculty starts a live session
router.post(
  "/sessions",
  authenticate,
  requireRole("faculty", "admin"),
  async (req, res, next) => {
    const { batch_id, course_id, duration_mins = 10, date } = req.body;
    if (!batch_id || !course_id) {
      return res.status(400).json({ error: "batch_id and course_id are required" });
    }
    const sessionDate = date || new Date().toISOString().split("T")[0];
    const expires_at = new Date(Date.now() + duration_mins * 60 * 1000).toISOString();

    try {
      const { data, error } = await supabase
        .from("live_attendance_sessions")
        .insert({ batch_id, course_id, faculty_id: req.user.id, date: sessionDate, expires_at })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/attendance/sessions — faculty lists their sessions
router.get(
  "/sessions",
  authenticate,
  requireRole("faculty", "admin"),
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from("live_attendance_sessions")
        .select("*, batches:batch_id(name), courses:course_id(title)")
        .eq("faculty_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/attendance/sessions/active — student checks for active sessions in their batch
router.get("/sessions/active", authenticate, async (req, res, next) => {
  try {
    const { data: batchStudents, error: bsError } = await supabase
      .from("batch_students")
      .select("batch_id")
      .eq("student_id", req.user.id);

    if (bsError) return res.status(400).json({ error: bsError.message });
    const batchIds = (batchStudents || []).map((bs) => bs.batch_id);
    if (batchIds.length === 0) return res.json({ data: null });

    const { data, error } = await supabase
      .from("live_attendance_sessions")
      .select("*, batches:batch_id(name), courses:course_id(title)")
      .in("batch_id", batchIds)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });

    if (data) {
      const { data: existing } = await supabase
        .from("live_attendance_responses")
        .select("id")
        .eq("session_id", data.id)
        .eq("student_id", req.user.id)
        .maybeSingle();
      return res.json({ data: { ...data, already_marked: !!existing } });
    }

    return res.json({ data: null });
  } catch (err) {
    return next(err);
  }
});

// GET /api/attendance/sessions/:id/results — faculty sees live results
router.get(
  "/sessions/:id/results",
  authenticate,
  requireRole("faculty", "admin"),
  async (req, res, next) => {
    try {
      const { data: session, error: sError } = await supabase
        .from("live_attendance_sessions")
        .select("*, batches:batch_id(name, batch_students(student_id, profiles:student_id(id, name, email))), courses:course_id(title)")
        .eq("id", req.params.id)
        .single();

      if (sError) return res.status(400).json({ error: sError.message });

      const { data: responses } = await supabase
        .from("live_attendance_responses")
        .select("student_id, marked_at")
        .eq("session_id", req.params.id);

      return res.json({ data: { session, responses: responses || [] } });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/attendance/sessions/:id/mark — student self-marks present
router.post("/sessions/:id/mark", authenticate, requireRole("student"), async (req, res, next) => {
  const { id } = req.params;
  try {
    const { data: session, error: sError } = await supabase
      .from("live_attendance_sessions")
      .select("*")
      .eq("id", id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sError || !session) {
      return res.status(400).json({ error: "Session not found or already expired" });
    }

    const { data, error } = await supabase
      .from("live_attendance_responses")
      .insert({ session_id: id, student_id: req.user.id })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Already marked" });
      return res.status(400).json({ error: error.message });
    }

    // Mirror to the main attendance table
    await supabase
      .from("attendance")
      .upsert(
        { student_id: req.user.id, course_id: session.course_id, date: session.date, status: "present" },
        { onConflict: "student_id,course_id,date" }
      );

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
