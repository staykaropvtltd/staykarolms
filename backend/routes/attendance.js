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

module.exports = router;
