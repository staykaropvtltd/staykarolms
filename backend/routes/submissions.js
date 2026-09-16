const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/submissions — list submissions for faculty/admin (for AssignmentReviewPage)
router.get(
  "/",
  authenticate,
  requireRole("faculty", "admin", "super-admin"),
  async (req, res, next) => {
    try {
      let query = supabase
        .from("assignment_submissions")
        .select(`
          *,
          profiles:student_id ( name, email, avatar_url ),
          assignments:assignment_id (
            title,
            max_marks,
            course_id,
            courses:course_id ( title )
          )
        `)
        .order("submitted_at", { ascending: false });

      // Faculty sees only their own assignment submissions
      if (req.user.role === "faculty") {
        const { data: myAssignments } = await supabase
          .from("assignments")
          .select("id")
          .eq("created_by", req.user.id);

        const assignmentIds = (myAssignments || []).map((a) => a.id);
        if (assignmentIds.length === 0) return res.json({ data: [] });
        query = query.in("assignment_id", assignmentIds);
      } else if (req.user.role === "admin") {
        // assignments have no institution_id — scope via creator membership
        const { data: members } = await supabase
          .from("profiles")
          .select("id")
          .eq("institution_id", req.user.institution_id);
        const memberIds = (members || []).map((m) => m.id);
        if (memberIds.length === 0) return res.json({ data: [] });
        const { data: instAssignments } = await supabase
          .from("assignments")
          .select("id")
          .in("created_by", memberIds);
        const assignmentIds = (instAssignments || []).map((a) => a.id);
        if (assignmentIds.length === 0) return res.json({ data: [] });
        query = query.in("assignment_id", assignmentIds);
      }
      // super-admin: no filter

      // Optional filter by status
      if (req.query.status === "pending") {
        query = query.is("grade", null);
      } else if (req.query.status === "graded") {
        query = query.not("grade", "is", null);
      }

      const { data, error } = await query.limit(100);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: data || [] });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/submissions/student — student's own submissions
router.get("/student", authenticate, requireRole("student"), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("assignment_submissions")
      .select(`
        *,
        assignments:assignment_id ( title, max_marks, due_date, courses:course_id(title) )
      `)
      .eq("student_id", req.user.id)
      .order("submitted_at", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
