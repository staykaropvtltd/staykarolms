const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");
const { logAudit } = require("../lib/audit");

// GET /api/courses — list by institution
router.get("/", authenticate, async (req, res, next) => {
  try {
    let query = supabase.from("courses").select(`
      *,
      profiles:faculty_id ( name, email ),
      enrollments ( count )
    `);

    if (req.user.role === "student") {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("student_id", req.user.id);
      const enrolledIds = (enrollments || []).map((e) => e.course_id).filter(Boolean);

      if (req.query.available === "true") {
        // Return institution courses NOT yet enrolled in
        query = query.eq("institution_id", req.user.institution_id);
        if (enrolledIds.length > 0) {
          query = query.not("id", "in", `(${enrolledIds.join(",")})`);
        }
      } else {
        // Default: return only enrolled courses
        if (enrolledIds.length === 0) return res.json({ data: [] });
        query = query.in("id", enrolledIds);
      }
    } else if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/courses — create course
router.post(
  "/",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { title, description, faculty_id, thumbnail_url } = req.body;

    if (!title) return res.status(400).json({ error: "title is required" });

    try {
      const { data, error } = await supabase
        .from("courses")
        .insert({
          title,
          description,
          faculty_id: faculty_id || req.user.id,
          institution_id: req.user.institution_id,
          thumbnail_url,
        })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });

      // Notify students in the institution
      try {
        const { data: students } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "student")
          .eq("institution_id", req.user.institution_id);

        if (students && students.length > 0) {
          const notifRows = students.map((s) => ({
            user_id: s.id,
            title: "📚 New Course Available",
            message: `A new course "${title}" has been created. Check it out and enroll!`,
            type: "info",
            category: "academic",
          }));
          await supabase.from("notifications").insert(notifRows);
        }
      } catch (nErr) {
        console.error("[courses] notification error:", nErr.message);
      }

      // Audit Log
      try {

        await logAudit(req, req.user, "course_create", "courses", data.id, "info", "success", { title });
      } catch (aErr) {
        console.error("[courses] audit log error:", aErr.message);
      }

      return res.status(201).json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/courses/:id — update course
router.put(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { title, description, faculty_id, thumbnail_url, status } = req.body;
      let query = supabase
        .from("courses")
        .update({ title, description, faculty_id, thumbnail_url, status })
        .eq("id", req.params.id);

      if (req.user.role !== "super-admin") {
        query = query.eq("institution_id", req.user.institution_id);
      }

      const { data, error } = await query.select().single();

      if (error) return res.status(400).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Course not found" });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/courses/:id
router.delete(
  "/:id",
  authenticate,
  requireRole("admin", "super-admin"),
  async (req, res, next) => {
    try {
      let query = supabase.from("courses").delete().eq("id", req.params.id);
      if (req.user.role !== "super-admin") {
        query = query.eq("institution_id", req.user.institution_id);
      }
      const { error } = await query;
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: { message: "Course deleted" } });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/courses/:id/enroll — student self-enroll
router.post("/:id/enroll", authenticate, requireRole("student"), async (req, res, next) => {
  try {
    // Verify the course belongs to the student's institution
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, institution_id")
      .eq("id", req.params.id)
      .single();

    if (courseError || !course) {
      return res.status(404).json({ error: "Course not found" });
    }
    if (course.institution_id !== req.user.institution_id) {
      return res.status(403).json({ error: "You cannot enroll in a course from another institution" });
    }

    const { data, error } = await supabase
      .from("enrollments")
      .insert({ course_id: req.params.id, student_id: req.user.id })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/courses/:id/students — list enrolled students
router.get(
  "/:id/students",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*, profiles:student_id(name, email, avatar_url)")
        .eq("course_id", req.params.id);

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/courses/:id — single course with content count
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    let query = supabase
      .from("courses")
      .select(`
        *,
        profiles:faculty_id ( name, email ),
        enrollments ( count ),
        course_content ( id, title, type, order_index )
      `)
      .eq("id", req.params.id);

    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    const { data, error } = await query.single();

    if (error || !data) return res.status(404).json({ error: "Course not found" });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/courses/:id/content — list content items for a course
router.get("/:id/content", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("course_content")
      .select("*")
      .eq("course_id", req.params.id)
      .order("order_index", { ascending: true });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

// GET /api/courses/:id/modules — list modules for a course
router.get("/:id/modules", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("course_modules")
      .select("*")
      .eq("course_id", req.params.id)
      .order("order_index", { ascending: true });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

// POST /api/courses/:id/modules — create a module
router.post(
  "/:id/modules",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { title, order_index } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    try {
      const { data, error } = await supabase
        .from("course_modules")
        .insert({
          course_id: req.params.id,
          title,
          order_index: order_index || 0,
        })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/courses/:courseId/modules/:moduleId — rename a module
router.put(
  "/:courseId/modules/:moduleId",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });
    try {
      const { data, error } = await supabase
        .from("course_modules")
        .update({ title })
        .eq("id", req.params.moduleId)
        .eq("course_id", req.params.courseId)
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/courses/:courseId/modules/:moduleId — delete a module and its content
router.delete(
  "/:courseId/modules/:moduleId",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      await supabase.from("course_content").delete().eq("module_id", req.params.moduleId);
      const { error } = await supabase
        .from("course_modules")
        .delete()
        .eq("id", req.params.moduleId)
        .eq("course_id", req.params.courseId);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: { message: "Module deleted" } });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/courses/:courseId/content/:contentId — remove content item
router.delete(
  "/:courseId/content/:contentId",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { courseId, contentId } = req.params;

      // Fetch the content record to get the stored URL (for storage cleanup)
      const { data: contentItem, error: fetchError } = await supabase
        .from("course_content")
        .select("id, url")
        .eq("id", contentId)
        .eq("course_id", courseId)
        .single();

      if (fetchError || !contentItem) {
        return res.status(404).json({ error: "Content item not found" });
      }

      // Attempt to delete from Supabase Storage if the URL belongs to our bucket
      if (contentItem.url && contentItem.url.includes("/storage/v1/object/")) {
        try {
          // Extract bucket and path from the public URL
          // Format: .../storage/v1/object/public/<bucket>/<path>
          const urlParts = contentItem.url.split("/storage/v1/object/public/");
          if (urlParts.length === 2) {
            const [bucketAndPath] = urlParts.slice(1);
            const slashIdx = bucketAndPath.indexOf("/");
            if (slashIdx !== -1) {
              const bucket = bucketAndPath.slice(0, slashIdx);
              const filePath = bucketAndPath.slice(slashIdx + 1);
              await supabase.storage.from(bucket).remove([filePath]);
            }
          }
        } catch (storageErr) {
          // Non-fatal — log and continue with DB deletion
          console.error("[courses] storage delete error:", storageErr.message);
        }
      }

      // Delete the DB record
      const { error: deleteError } = await supabase
        .from("course_content")
        .delete()
        .eq("id", contentId)
        .eq("course_id", courseId);

      if (deleteError) return res.status(400).json({ error: deleteError.message });

      return res.json({ data: { message: "Content deleted" } });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/courses/:id/content — add content to course (faculty/admin)
router.post(
  "/:id/content",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { title, type, url, description, duration_mins, order_index } = req.body;
    if (!title || !type) return res.status(400).json({ error: "title and type are required" });

    try {
      const { data, error } = await supabase
        .from("course_content")
        .insert({
          course_id: req.params.id,
          module_id: req.body.module_id || null,
          title,
          type,
          url,
          description,
          duration_mins,
          order_index: order_index || 0,
          created_by: req.user.id,
        })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/courses/:courseId/content/:contentId/complete — mark lesson complete and check progress
router.post(
  "/:courseId/content/:contentId/complete",
  authenticate,
  requireRole("student"),
  async (req, res, next) => {
    try {
      const { courseId, contentId } = req.params;
      const studentId = req.user.id;

      // 1. Insert completion record (ignores duplicate key if already completed)
      const { error: completeErr } = await supabase
        .from("lesson_completions")
        .insert({ student_id: studentId, course_id: courseId, content_id: contentId });

      // We ignore duplicate constraints as they just mean it's already completed
      if (completeErr && completeErr.code !== '23505') {
        console.error("[completion] insert error:", completeErr);
        return res.status(400).json({ error: completeErr.message });
      }

      // 2. Evaluate completion percentage
      const { count: totalLessons, error: totalErr } = await supabase
        .from("course_content")
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId);

      const { count: completedLessons, error: compErr } = await supabase
        .from("lesson_completions")
        .select("*", { count: "exact", head: true })
        .eq("student_id", studentId)
        .eq("course_id", courseId);

      if (totalErr || compErr) {
        return res.status(400).json({ error: "Failed to verify course progress" });
      }

      let certificateGenerated = false;
      let newCertificate = null;

      // 3. Generate certificate if 100% complete
      if (totalLessons > 0 && completedLessons >= totalLessons) {
        const { data: existingCert } = await supabase
          .from("certificates")
          .select("id, verification_code")
          .eq("student_id", studentId)
          .eq("course_id", courseId)
          .maybeSingle();

        if (!existingCert) {
          const crypto = require("crypto");
          const code = crypto.randomBytes(8).toString("hex");

          const { data: cert, error: certErr } = await supabase
            .from("certificates")
            .insert({
              student_id: studentId,
              course_id: courseId,
              verification_code: code
            })
            .select()
            .single();

          if (!certErr && cert) {
            certificateGenerated = true;
            newCertificate = cert;
          } else {
            console.error("[completion] cert generation error:", certErr);
          }
        }
      }

      return res.json({ 
        data: { 
          completed: true, 
          progress: Math.round((completedLessons / (totalLessons || 1)) * 100),
          certificateGenerated,
          certificate: newCertificate
        } 
      });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/courses/:id/completions — get completed lessons for current student
router.get("/:id/completions", authenticate, requireRole("student"), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("lesson_completions")
      .select("content_id")
      .eq("student_id", req.user.id)
      .eq("course_id", req.params.id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data.map(d => d.content_id) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
