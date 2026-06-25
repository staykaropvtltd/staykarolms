const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");
const crypto = require("crypto");

// GET /api/live-classes — list by institution
router.get("/", authenticate, async (req, res, next) => {
  try {
    let query = supabase
      .from("live_classes")
      .select(`
        *,
        profiles:created_by ( name, email ),
        courses:course_id ( title )
      `);

    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    if (req.query.status) {
      query = query.eq("status", req.query.status);
    }

    const { data, error } = await query.order("scheduled_at", { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

// POST /api/live-classes — schedule a live class
router.post(
  "/",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { title, course_id, batch_id, scheduled_at, duration_mins, platform, description } = req.body;

    if (!title || !scheduled_at) {
      return res.status(400).json({ error: "title and scheduled_at are required" });
    }

    try {
      // Generate a unique internal meeting ID for reference
      const meeting_id = `SK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

      const meeting_link = req.body.meeting_link || null;
      
      const { data, error } = await supabase
        .from("live_classes")
        .insert({
          title,
          course_id: course_id || null,
          batch_id: batch_id || null,
          institution_id: req.user.institution_id,
          created_by: req.user.id,
          scheduled_at,
          duration_mins: duration_mins || 60,
          platform: platform || "platform",
          meeting_link: meeting_link || null,
          meeting_id,
          description,
        })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });

      // Auto-create calendar event
      await supabase.from("calendar_events").insert({
        title,
        type: "live",
        course_id,
        institution_id: req.user.institution_id,
        created_by: req.user.id,
        scheduled_at,
        duration_mins: duration_mins || 60,
        description,
      });

      // Send notification to all students in the batch (if batch_id provided) or course
      if (batch_id) {
        const { data: enrollments } = await supabase
          .from("batch_students")
          .select("student_id")
          .eq("batch_id", batch_id);

        if (enrollments && enrollments.length > 0) {
          const notifRows = enrollments.map((e) => ({
            user_id: e.student_id,
            title: "📹 Live Class Scheduled",
            message: `"${title}" is scheduled for ${new Date(scheduled_at).toLocaleString()}. Meeting Link: ${meeting_link}`,
            type: "info",
            category: "academic",
          }));
          await supabase.from("notifications").insert(notifRows);
        }
      } else if (course_id) {
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("student_id")
          .eq("course_id", course_id);

        if (enrollments && enrollments.length > 0) {
          const notifRows = enrollments.map((e) => ({
            user_id: e.student_id,
            title: "📹 Live Class Scheduled",
            message: `"${title}" is scheduled for ${new Date(scheduled_at).toLocaleString()}. Meeting Link: ${meeting_link}`,
            type: "info",
            category: "academic",
          }));
          await supabase.from("notifications").insert(notifRows);
        }
      }

      return res.status(201).json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/live-classes/:id — update live class
router.put(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { scheduled_at, duration_mins, ...updateData } = req.body;
      const { data, error } = await supabase
        .from("live_classes")
        .update({ scheduled_at, duration_mins, ...updateData })
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });

      // Update calendar event if scheduled_at or duration_mins changed
      if (scheduled_at || duration_mins) {
        try {
          const { data: calEvent } = await supabase
            .from("calendar_events")
            .select("id")
            .textSearch("title", data.title)
            .eq("type", "live")
            .eq("created_by", req.user.id)
            .limit(1)
            .maybeSingle();

          if (calEvent) {
            const updatePayload = {};
            if (scheduled_at) updatePayload.scheduled_at = scheduled_at;
            if (duration_mins) updatePayload.duration_mins = duration_mins;
            await supabase
              .from("calendar_events")
              .update(updatePayload)
              .eq("id", calEvent.id);
          }
        } catch (calErr) {
          console.error("[live-classes] calendar event update error:", calErr.message);
        }
      }

      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/live-classes/:id/start-attendance — faculty starts attendance popup
router.put(
  "/:id/start-attendance",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      // Update class status to "live" which triggers attendance on frontend
      const { data, error } = await supabase
        .from("live_classes")
        .update({ status: "live" })
        .eq("id", req.params.id)
        .select(`*, courses:course_id(title)`)
        .single();

      if (error) return res.status(400).json({ error: error.message });

      // Send attendance notification
      if (data.batch_id) {
        const { data: enrollments } = await supabase
          .from("batch_students")
          .select("student_id")
          .eq("batch_id", data.batch_id);

        if (enrollments && enrollments.length > 0) {
          const notifRows = enrollments.map((e) => ({
            user_id: e.student_id,
            title: "📋 Mark Your Attendance!",
            message: `Attendance is now open for "${data.title}". Please mark your attendance within 10 minutes.`,
            type: "warning",
            category: "academic",
          }));
          await supabase.from("notifications").insert(notifRows);
        }
      } else if (data.course_id) {
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("student_id")
          .eq("course_id", data.course_id);

        if (enrollments && enrollments.length > 0) {
          const notifRows = enrollments.map((e) => ({
            user_id: e.student_id,
            title: "📋 Mark Your Attendance!",
            message: `Attendance is now open for "${data.title}". Please mark your attendance within 10 minutes.`,
            type: "warning",
            category: "academic",
          }));
          await supabase.from("notifications").insert(notifRows);
        }
      }

      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/live-classes/:id/end — ends the class and marks missing students as absent
router.put(
  "/:id/end",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      // 1. Update class status to completed
      const { data: cls, error: clsErr } = await supabase
        .from("live_classes")
        .update({ status: "completed" })
        .eq("id", req.params.id)
        .select()
        .single();

      if (clsErr) throw new Error(clsErr.message);

      // 2. Fetch expected students
      let expectedStudentIds = [];
      if (cls.batch_id) {
        const { data } = await supabase.from("batch_students").select("student_id").eq("batch_id", cls.batch_id);
        if (data) expectedStudentIds = data.map((r) => r.student_id);
      } else if (cls.course_id) {
        const { data } = await supabase.from("enrollments").select("student_id").eq("course_id", cls.course_id);
        if (data) expectedStudentIds = data.map((r) => r.student_id);
      } else {
        // General class -> all students in institution
        const { data } = await supabase.from("profiles").select("id").eq("role", "student").eq("institution_id", req.user.institution_id);
        if (data) expectedStudentIds = data.map((r) => r.id);
      }

      // 3. Fetch actual attendances
      const { data: attendances } = await supabase
        .from("live_class_attendance")
        .select("student_id")
        .eq("live_class_id", req.params.id);
      
      const presentStudentIds = new Set(attendances ? attendances.map((a) => a.student_id) : []);

      // 4. Mark absent
      const absentRows = expectedStudentIds
        .filter((id) => !presentStudentIds.has(id))
        .map((id) => ({
          live_class_id: req.params.id,
          student_id: id,
          status: "absent"
        }));

      if (absentRows.length > 0) {
        await supabase.from("live_class_attendance").insert(absentRows);
      }

      return res.json({ data: cls });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/live-classes/:id/attendance/:studentId — faculty overrides attendance
router.put(
  "/:id/attendance/:studentId",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { status } = req.body;
      const { data, error } = await supabase
        .from("live_class_attendance")
        .upsert(
          {
            live_class_id: req.params.id,
            student_id: req.params.studentId,
            status: status || "present",
          },
          { onConflict: "live_class_id,student_id" }
        )
        .select()
        .single();

      if (error) throw new Error(error.message);
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/live-classes/:id/attendance — student marks attendance
router.post(
  "/:id/attendance",
  authenticate,
  requireRole("student"),
  async (req, res, next) => {
    const { status } = req.body; // 'present' or 'absent'

    try {
      const { data, error } = await supabase
        .from("live_class_attendance")
        .upsert(
          {
            live_class_id: req.params.id,
            student_id: req.user.id,
            status: status || "present",
          },
          { onConflict: "live_class_id,student_id" }
        )
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/live-classes/:id/attendance — get attendance for a class
router.get(
  "/:id/attendance",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from("live_class_attendance")
        .select("*, profiles:student_id(name, email, avatar_url)")
        .eq("live_class_id", req.params.id);

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: data || [] });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/live-classes/:id
router.delete(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      // Get live class details before deletion
      const { data: liveClass } = await supabase
        .from("live_classes")
        .select("title, created_by")
        .eq("id", req.params.id)
        .single();

      // Delete associated calendar event
      if (liveClass) {
        try {
          const { data: calEvent } = await supabase
            .from("calendar_events")
            .select("id")
            .textSearch("title", liveClass.title)
            .eq("type", "live")
            .eq("created_by", liveClass.created_by)
            .limit(1)
            .maybeSingle();

          if (calEvent) {
            await supabase
              .from("calendar_events")
              .delete()
              .eq("id", calEvent.id);
          }
        } catch (calErr) {
          console.error("[live-classes] calendar event deletion error:", calErr.message);
        }
      }

      // Delete live class
      const { error } = await supabase
        .from("live_classes")
        .delete()
        .eq("id", req.params.id);

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: { message: "Live class deleted" } });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/live-classes/active — get currently live classes (for student dashboard popup)
router.get("/active", authenticate, async (req, res, next) => {
  try {
    let query = supabase
      .from("live_classes")
      .select("*, courses:course_id(title)")
      .eq("status", "live")
      .eq("institution_id", req.user.institution_id);

    // If student, filter by their enrolled batches/courses
    if (req.user.role === "student") {
      // Get student's batches
      const { data: batchData } = await supabase
        .from("batch_students")
        .select("batch_id")
        .eq("student_id", req.user.id);
      const batchIds = batchData ? batchData.map(b => b.batch_id) : [];

      // Get student's courses
      const { data: courseData } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("student_id", req.user.id);
      const courseIds = courseData ? courseData.map(c => c.course_id) : [];

      // Create an OR filter for batch_id OR course_id OR general classes
      const orFilters = ["and(batch_id.is.null,course_id.is.null)"];
      if (batchIds.length > 0) orFilters.push(`batch_id.in.(${batchIds.join(",")})`);
      if (courseIds.length > 0) orFilters.push(`course_id.in.(${courseIds.join(",")})`);
      
      query = query.or(orFilters.join(","));
    }

    const { data, error } = await query;

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
