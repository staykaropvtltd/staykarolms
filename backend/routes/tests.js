const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// options stored as a JSON-encoded string inside jsonb must be parsed back to an array
function normalizeOptions(options) {
  if (Array.isArray(options)) return options;
  if (typeof options === "string") {
    try {
      const parsed = JSON.parse(options);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      console.warn("[tests] malformed options value:", options);
      return [];
    }
  }
  return options == null ? null : [];
}

// GET /api/tests — list by institution + optional batch filter
router.get("/", authenticate, async (req, res, next) => {
  try {
    let query = supabase.from("tests").select(`
      *,
      profiles:created_by ( name ),
      batches:batch_id ( name ),
      test_questions ( count )
    `);

    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    if (req.query.batch_id) query = query.eq("batch_id", req.query.batch_id);
    if (req.query.type)     query = query.eq("type", req.query.type);
    if (req.query.status)   query = query.eq("status", req.query.status);

    // Students only see published tests
    if (req.user.role === "student") {
      query = query.eq("status", "published");
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/tests — create test
router.post(
  "/",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { title, type, batch_id, duration_mins, scheduled_at } = req.body;

    if (!title || !type || !duration_mins) {
      return res.status(400).json({ error: "title, type, duration_mins are required" });
    }

    try {
      const { data, error } = await supabase
        .from("tests")
        .insert({
          title,
          type,
          batch_id,
          duration_mins,
          scheduled_at,
          institution_id: req.user.institution_id,
          created_by: req.user.id,
        })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });

      // Auto-create calendar event if scheduled_at is provided
      if (scheduled_at) {
        try {
          await supabase.from("calendar_events").insert({
            title,
            type: "exam",
            institution_id: req.user.institution_id,
            created_by: req.user.id,
            scheduled_at,
            duration_mins: duration_mins || 60,
            description: `${type.charAt(0).toUpperCase() + type.slice(1)} Test`,
          });
        } catch (calErr) {
          console.error("[tests] calendar event creation error:", calErr.message);
        }
      }

      // Notify creator
      try {
        await supabase.from("notifications").insert({
          user_id: req.user.id,
          title: "📝 Test Draft Created",
          message: `The test draft "${title}" was created successfully.`,
          type: "success",
          category: "academic",
        });
      } catch (nErr) {
        console.error("[tests] draft notification error:", nErr.message);
      }

      // Audit Log
      try {
        const { logAudit } = require("../lib/audit");
        await logAudit(req, req.user, "test_create", "tests", data.id, "info", "success", { title, type });
      } catch (aErr) {
        console.error("[tests] audit log error:", aErr.message);
      }

      return res.status(201).json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/tests/:id/attempts — all student attempts for a test (admin/faculty only)
router.get(
  "/:id/attempts",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      let query = supabase
        .from("test_attempts")
        .select(`
          id,
          status,
          score,
          started_at,
          submitted_at,
          profiles:student_id ( id, name, email )
        `)
        .eq("test_id", req.params.id)
        .order("submitted_at", { ascending: false });

      const { data, error } = await query;
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: data || [] });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/tests/:id — test with questions
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    let query = supabase
      .from("tests")
      .select("*, test_questions(*)")
      .eq("id", req.params.id);

    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    const { data, error } = await query.single();

    if (error || !data) return res.status(404).json({ error: "Test not found" });

    if (req.user.role === "student") {
      if (data.status !== "published") {
        return res.status(404).json({ error: "Test not found" });
      }

      const sanitizedQuestions = (data.test_questions || []).map(({ correct_answer, ...question }) => ({
        ...question,
        options: normalizeOptions(question.options),
      }));
      return res.json({
        data: {
          ...data,
          test_questions: sanitizedQuestions,
        },
      });
    }

    const normalizedQuestions = (data.test_questions || []).map((q) => ({
      ...q,
      options: normalizeOptions(q.options),
    }));
    return res.json({ data: { ...data, test_questions: normalizedQuestions } });
  } catch (err) {
    return next(err);
  }
});

// POST /api/tests/:id/questions — add a question
router.post(
  "/:id/questions",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { question, type, options, correct_answer, marks, order_index } = req.body;

    if (!question || !type) {
      return res.status(400).json({ error: "question and type are required" });
    }

    try {
      const { data, error } = await supabase
        .from("test_questions")
        .insert({
          test_id: req.params.id,
          question,
          type,
          options,
          correct_answer,
          marks: marks || 1,
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

// PUT /api/tests/:id/questions/:qid — update an existing question
router.put(
  "/:id/questions/:qid",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      let testQuery = supabase.from("tests").select("id").eq("id", req.params.id);
      if (req.user.role !== "super-admin") {
        testQuery = testQuery.eq("institution_id", req.user.institution_id);
      }
      const { data: test, error: testError } = await testQuery.single();
      if (testError || !test) return res.status(404).json({ error: "Test not found" });

      const allowed = ["question", "type", "options", "correct_answer", "marks", "order_index"];
      const updateFields = allowed.reduce((acc, key) => {
        if (req.body[key] !== undefined) acc[key] = req.body[key];
        return acc;
      }, {});

      const { data, error } = await supabase
        .from("test_questions")
        .update(updateFields)
        .eq("id", req.params.qid)
        .eq("test_id", req.params.id)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Question not found" });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/tests/:id/questions/:qid — delete a question
router.delete(
  "/:id/questions/:qid",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      let testQuery = supabase.from("tests").select("id").eq("id", req.params.id);
      if (req.user.role !== "super-admin") {
        testQuery = testQuery.eq("institution_id", req.user.institution_id);
      }
      const { data: test, error: testError } = await testQuery.single();
      if (testError || !test) return res.status(404).json({ error: "Test not found" });

      const { error } = await supabase
        .from("test_questions")
        .delete()
        .eq("id", req.params.qid)
        .eq("test_id", req.params.id);

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: { message: "Question deleted" } });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/tests/:id — update test (for scheduling changes)
router.put(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { scheduled_at, duration_mins, title, type, batch_id, status } = req.body;
      let query = supabase
        .from("tests")
        .update({ scheduled_at, duration_mins, title, type, batch_id, status })
        .eq("id", req.params.id);

      if (req.user.role !== "super-admin") {
        query = query.eq("institution_id", req.user.institution_id);
      }

      const { data, error } = await query.select().single();

      if (error) return res.status(400).json({ error: error.message });

      // Update calendar event if scheduled_at changed
      if (scheduled_at) {
        try {
          const { data: calEvent } = await supabase
            .from("calendar_events")
            .select("id")
            .eq("created_by", req.user.id)
            .textSearch("title", data.title)
            .eq("type", "exam")
            .limit(1)
            .maybeSingle();

          if (calEvent) {
            await supabase
              .from("calendar_events")
              .update({ scheduled_at, duration_mins: duration_mins || data.duration_mins })
              .eq("id", calEvent.id);
          }
        } catch (calErr) {
          console.error("[tests] calendar event update error:", calErr.message);
        }
      }

      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/tests/:id/publish — publish test + notify students
router.put(
  "/:id/publish",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      let query = supabase
        .from("tests")
        .update({ status: "published" })
        .eq("id", req.params.id);

      if (req.user.role !== "super-admin") {
        query = query.eq("institution_id", req.user.institution_id);
      }

      const { data, error } = await query.select().single();

      if (error) return res.status(400).json({ error: error.message });

      // Notify students
      try {
        let studentIds = [];
        if (data.batch_id) {
          const { data: batchStudents } = await supabase
            .from("batch_students")
            .select("student_id")
            .eq("batch_id", data.batch_id);
          studentIds = (batchStudents || []).map((s) => s.student_id);
        } else {
          const { data: students } = await supabase
            .from("profiles")
            .select("id")
            .eq("role", "student")
            .eq("institution_id", data.institution_id || req.user.institution_id);
          studentIds = (students || []).map((s) => s.id);
        }

        if (studentIds.length > 0) {
          const typeLabel = data.type === "aptitude" ? "Aptitude" : data.type === "coding" ? "Coding" : "Mock";
          const notifRows = studentIds.map((id) => ({
            user_id: id,
            title: `📋 New ${typeLabel} Test Available`,
            message: `"${data.title}" is now available${data.scheduled_at ? ` — Scheduled: ${new Date(data.scheduled_at).toLocaleString()}` : ""}. Duration: ${data.duration_mins} mins.`,
            type: "info",
            category: "academic",
          }));
          await supabase.from("notifications").insert(notifRows);
        }
      } catch (notifErr) {
        console.error("[tests] notification error:", notifErr.message);
      }

      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/tests/:id — delete test
router.delete(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      // Get test details before deletion — scoped to institution
      let fetchQuery = supabase
        .from("tests")
        .select("title, created_by")
        .eq("id", req.params.id);
      if (req.user.role !== "super-admin") {
        fetchQuery = fetchQuery.eq("institution_id", req.user.institution_id);
      }
      const { data: test } = await fetchQuery.single();

      // Delete associated calendar event
      if (test) {
        try {
          const { data: calEvent } = await supabase
            .from("calendar_events")
            .select("id")
            .textSearch("title", test.title)
            .eq("type", "exam")
            .eq("created_by", test.created_by)
            .limit(1)
            .maybeSingle();

          if (calEvent) {
            await supabase
              .from("calendar_events")
              .delete()
              .eq("id", calEvent.id);
          }
        } catch (calErr) {
          console.error("[tests] calendar event deletion error:", calErr.message);
        }
      }

      // Delete test — scoped to institution
      let deleteQuery = supabase.from("tests").delete().eq("id", req.params.id);
      if (req.user.role !== "super-admin") {
        deleteQuery = deleteQuery.eq("institution_id", req.user.institution_id);
      }
      const { error } = await deleteQuery;

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: { message: "Test deleted" } });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
