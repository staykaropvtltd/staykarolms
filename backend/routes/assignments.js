const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");
const { logAudit } = require("../lib/audit");

// GET /api/assignments — list by institution/course
router.get("/", authenticate, async (req, res, next) => {
  try {
    let query = supabase.from("assignments").select(`
      *,
      courses:course_id ( title ),
      profiles:created_by ( name ),
      assignment_submissions ( count )
    `);

    if (req.user.role === "student") {
      // Students see assignments for their enrolled courses OR institution-wide (course_id is null)
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("student_id", req.user.id);

      const courseIds = (enrollments || []).map((e) => e.course_id).filter(Boolean);
      
      // Filter: institution-wide (course_id IS NULL) OR enrolled courses
      if (courseIds.length > 0) {
        query = query.or(`course_id.in.(${courseIds.join(",")}),course_id.is.null`);
      } else {
        // No enrollments yet — only show institution-wide assignments
        query = query.is("course_id", null);
      }
    } else if (req.user.role === "faculty") {
      query = query.eq("created_by", req.user.id);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/assignments/:id — get single assignment
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("assignments")
      .select(`
        *,
        courses:course_id ( title ),
        profiles:created_by ( name ),
        assignment_submissions ( count )
      `)
      .eq("id", req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: "Assignment not found" });

    if (req.user.role !== "super-admin" && req.user.role !== "admin" && req.user.role !== "faculty") {
      if (data.course_id) {
        const { data: enrollment } = await supabase
          .from("enrollments")
          .select("id")
          .eq("course_id", data.course_id)
          .eq("student_id", req.user.id)
          .maybeSingle();

        if (!enrollment && data.course_id) {
          return res.status(404).json({ error: "Assignment not found" });
        }
      }
    }

    if (req.user.role === "faculty" && data.created_by !== req.user.id) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/assignments — create assignment
router.post(
  "/",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { title, description, course_id, due_date, max_marks } = req.body;

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    try {
      const { data, error } = await supabase
        .from("assignments")
        .insert({
          title,
          description,
          course_id: course_id || null,
          due_date,
          max_marks: max_marks || 100,
          created_by: req.user.id,
        })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });

      // Auto-create calendar event for assignment deadline if due_date provided
      if (due_date) {
        try {
          await supabase.from("calendar_events").insert({
            title: `Deadline: ${title}`,
            type: "exam",
            course_id: course_id || null,
            institution_id: req.user.institution_id,
            created_by: req.user.id,
            scheduled_at: due_date,
            description: description || "Assignment deadline",
          });
        } catch (calErr) {
          console.error("[assignments] calendar event creation error:", calErr.message);
        }
      }

      // Notify students
      try {
        let studentIds = [];
        let courseTitle = "";
        
        if (course_id) {
          // Get course title
          const { data: course } = await supabase
            .from("courses")
            .select("title")
            .eq("id", course_id)
            .single();
          if (course) courseTitle = course.title;

          // Get enrolled students
          const { data: enrolled } = await supabase
            .from("enrollments")
            .select("student_id")
            .eq("course_id", course_id);
          studentIds = (enrolled || []).map((e) => e.student_id);
        } else {
          // Get all students in the institution
          const { data: students } = await supabase
            .from("profiles")
            .select("id")
            .eq("role", "student")
            .eq("institution_id", req.user.institution_id);
          studentIds = (students || []).map((s) => s.id);
        }

        if (studentIds.length > 0) {
          const notifRows = studentIds.map((id) => ({
            user_id: id,
            title: "📝 New Assignment Posted",
            message: `New assignment "${title}" has been posted${courseTitle ? ` for ${courseTitle}` : ""}.${due_date ? ` Due: ${new Date(due_date).toLocaleDateString()}` : ""}`,
            type: "info",
            category: "assignment",
          }));
          await supabase.from("notifications").insert(notifRows);
        }
      } catch (nErr) {
        console.error("[assignments] notification error:", nErr.message);
      }

      // Audit Log
      try {
  
        await logAudit(req, req.user, "assignment_create", "assignments", data.id, "info", "success", { title });
      } catch (aErr) {
        console.error("[assignments] audit log error:", aErr.message);
      }

      return res.status(201).json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/assignments/:id/submit — student submits file URL
router.post("/:id/submit", authenticate, requireRole("student"), async (req, res, next) => {
  const { file_url } = req.body;

  if (!file_url) return res.status(400).json({ error: "file_url is required" });

  try {
    const { data, error } = await supabase
      .from("assignment_submissions")
      .upsert(
        {
          assignment_id: req.params.id,
          student_id: req.user.id,
          file_url,
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id" }
      )
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Audit Log
    try {

      await logAudit(req, req.user, "assignment_submit", "assignment_submissions", data.id, "info", "success", { assignment_id: req.params.id });
    } catch (aErr) {
      console.error("[assignments] submission audit error:", aErr.message);
    }

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/assignments/submissions/:id/grade — faculty grades a submission
router.put(
  "/submissions/:id/grade",
  authenticate,
  requireRole("faculty", "admin", "super-admin"),
  async (req, res, next) => {
    const { grade, feedback } = req.body;

    if (grade === undefined || grade === null) {
      return res.status(400).json({ error: "grade is required" });
    }

    try {
      // Verify the submission belongs to an assignment the requester owns (faculty)
      // or is in their institution (admin/super-admin)
      const { data: submission, error: fetchErr } = await supabase
        .from("assignment_submissions")
        .select("id, assignment_id, assignments:assignment_id(created_by, max_marks)")
        .eq("id", req.params.id)
        .single();

      if (fetchErr || !submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (req.user.role === "faculty" && submission.assignments?.created_by !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const maxMarks = submission.assignments?.max_marks ?? 100;
      if (grade < 0 || grade > maxMarks) {
        return res.status(400).json({ error: `Grade must be between 0 and ${maxMarks}` });
      }

      const { data, error } = await supabase
        .from("assignment_submissions")
        .update({ grade, feedback, graded_by: req.user.id })
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/assignments/:id — update assignment
router.put(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { due_date, ...updateData } = req.body;
      const { data, error } = await supabase
        .from("assignments")
        .update({ due_date, ...updateData })
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });

      // Update calendar event if due_date changed
      if (due_date) {
        try {
          const calendarTitle = `Deadline: ${data.title}`;
          const { data: calEvent } = await supabase
            .from("calendar_events")
            .select("id")
            .textSearch("title", calendarTitle)
            .eq("created_by", req.user.id)
            .eq("type", "exam")
            .limit(1)
            .maybeSingle();

          if (calEvent) {
            await supabase
              .from("calendar_events")
              .update({ scheduled_at: due_date })
              .eq("id", calEvent.id);
          }
        } catch (calErr) {
          console.error("[assignments] calendar event update error:", calErr.message);
        }
      }

      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/assignments/:id — delete assignment
router.delete(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      // Get assignment details before deletion
      const { data: assignment } = await supabase
        .from("assignments")
        .select("title, created_by")
        .eq("id", req.params.id)
        .single();

      // Faculty can only delete their own assignments
      if (req.user.role === "faculty" && assignment?.created_by !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Delete associated calendar event
      if (assignment) {
        try {
          const calendarTitle = `Deadline: ${assignment.title}`;
          const { data: calEvent } = await supabase
            .from("calendar_events")
            .select("id")
            .textSearch("title", calendarTitle)
            .eq("created_by", assignment.created_by)
            .eq("type", "exam")
            .limit(1)
            .maybeSingle();

          if (calEvent) {
            await supabase
              .from("calendar_events")
              .delete()
              .eq("id", calEvent.id);
          }
        } catch (calErr) {
          console.error("[assignments] calendar event deletion error:", calErr.message);
        }
      }

      // Delete assignment
      const { error } = await supabase
        .from("assignments")
        .delete()
        .eq("id", req.params.id);

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: { message: "Assignment deleted" } });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
