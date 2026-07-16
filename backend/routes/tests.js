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

// GET /api/tests/:id/analytics/summary — aggregate stats + question accuracy (no attempt list)
router.get(
  "/:id/analytics/summary",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const testId = req.params.id;

      let testQuery = supabase
        .from("tests")
        .select(
          "id, title, type, duration_mins, batch_id, institution_id," +
          " batches:batch_id ( name )," +
          " test_questions ( id, question, type, marks, options, correct_answer, order_index )"
        )
        .eq("id", testId);
      if (req.user.role !== "super-admin") {
        testQuery = testQuery.eq("institution_id", req.user.institution_id);
      }
      const { data: test, error: testError } = await testQuery.single();
      if (testError || !test) return res.status(404).json({ error: "Test not found" });

      // Best-effort institution name
      let institutionName = null;
      try {
        const { data: inst } = await supabase
          .from("institutions").select("name").eq("id", test.institution_id).maybeSingle();
        institutionName = inst?.name ?? null;
      } catch (_) {}

      const questions = (test.test_questions || []).sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );
      const totalQuestions = questions.length;
      const maxScore = questions.reduce((s, q) => s + (q.marks || 1), 0);

      // All attempts + profiles (lightweight — no answers)
      const { data: allAttempts } = await supabase
        .from("test_attempts")
        .select(
          "id, status, score, started_at, submitted_at, auto_submitted, last_answered_at," +
          " profiles:student_id ( id, name, email, roll_number )"
        )
        .eq("test_id", testId);

      const attempts = allAttempts || [];
      const submitted = attempts.filter(a => a.status === "submitted");
      const inProgress = attempts.filter(a => a.status === "in_progress");
      const submittedIds = submitted.map(a => a.id);

      // Batch enrollment count
      let totalEnrolled = null;
      if (test.batch_id) {
        const { count } = await supabase
          .from("batch_students")
          .select("*", { count: "exact", head: true })
          .eq("batch_id", test.batch_id);
        totalEnrolled = count ?? null;
      }

      // Question-level answer stats (one query)
      const qStats = {}; // { [question_id]: { total, correct, wrong } }
      if (submittedIds.length > 0) {
        const { data: allAnswers } = await supabase
          .from("test_answers")
          .select("attempt_id, question_id, is_correct, answer")
          .in("attempt_id", submittedIds);

        for (const ans of allAnswers || []) {
          if (!qStats[ans.question_id]) qStats[ans.question_id] = { total: 0, correct: 0, wrong: 0 };
          const has = ans.answer !== null && ans.answer !== undefined && ans.answer !== "";
          if (has) {
            qStats[ans.question_id].total++;
            if (ans.is_correct) qStats[ans.question_id].correct++;
            else qStats[ans.question_id].wrong++;
          }
        }
      }

      // Augmented submitted rows for stats
      const subAug = submitted.map(a => {
        const t = a.submitted_at && a.started_at
          ? Math.max(0, Math.floor((new Date(a.submitted_at) - new Date(a.started_at)) / 1000))
          : null;
        const pct = maxScore > 0 && a.score != null ? Math.round((a.score / maxScore) * 100) : 0;
        return { ...a, time_taken_secs: t, percentage: pct };
      });

      const scores = subAug.map(a => a.score ?? 0);
      const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
      const highScore = scores.length ? Math.max(...scores) : 0;
      const lowScore = scores.length ? Math.min(...scores) : 0;
      const avgPct = subAug.length ? Math.round(subAug.reduce((s, a) => s + a.percentage, 0) / subAug.length) : 0;
      const passCount = subAug.filter(a => a.percentage >= 40).length;
      const failCount = subAug.length - passCount;
      const passRate = subAug.length ? Math.round((passCount / subAug.length) * 100) : 0;
      const autoSubmittedCount = submitted.filter(a => a.auto_submitted).length;

      const withTime = subAug.filter(a => a.time_taken_secs !== null)
        .sort((a, b) => a.time_taken_secs - b.time_taken_secs);
      const avgTimeSecs = withTime.length
        ? Math.round(withTime.reduce((s, a) => s + a.time_taken_secs, 0) / withTime.length)
        : null;

      const mkPerson = a => ({
        id: a.id, name: a.profiles?.name ?? "Unknown",
        time_secs: a.time_taken_secs, pct: a.percentage, score: a.score,
      });
      const fastest = withTime[0] ? mkPerson(withTime[0]) : null;
      const slowest = withTime.length > 1 ? mkPerson(withTime[withTime.length - 1]) : null;

      const durationSecs = (test.duration_mins || 30) * 60;
      const suspicious = subAug.filter(a => {
        if (a.time_taken_secs === null) return false;
        return a.time_taken_secs < durationSecs * 0.2 || (a.percentage === 100 && a.time_taken_secs < 60);
      }).map(a => ({
        id: a.id, name: a.profiles?.name ?? "Unknown",
        reason: (a.percentage === 100 && a.time_taken_secs < 60)
          ? "Perfect score in under 1 minute"
          : `Completed in ${Math.round(a.time_taken_secs / 60)}m (< 20% of allowed time)`,
        time_secs: a.time_taken_secs, pct: a.percentage,
      }));

      const enrichedQuestions = questions.map(q => ({
        id: q.id, question: q.question, type: q.type,
        marks: q.marks, options: normalizeOptions(q.options),
        correct_answer: q.correct_answer, order_index: q.order_index,
        stats: {
          total:      qStats[q.id]?.total ?? 0,
          correct:    qStats[q.id]?.correct ?? 0,
          wrong:      qStats[q.id]?.wrong ?? 0,
          unanswered: submittedIds.length - (qStats[q.id]?.total ?? 0),
        },
      }));

      return res.json({
        data: {
          test: {
            id: test.id, title: test.title, type: test.type,
            duration_mins: test.duration_mins, batch_id: test.batch_id,
            batch: test.batches || null, institution_name: institutionName,
          },
          summary: {
            total_enrolled: totalEnrolled,
            total_attempted: attempts.length,
            submitted: subAug.length,
            in_progress: inProgress.length,
            not_started: totalEnrolled != null ? Math.max(0, totalEnrolled - attempts.length) : null,
            auto_submitted: autoSubmittedCount,
            avg_score: avgScore, avg_pct: avgPct,
            high_score: highScore, low_score: lowScore,
            pass_count: passCount, fail_count: failCount,
            pass_rate: passRate, fail_rate: 100 - passRate,
            avg_time_secs: avgTimeSecs, fastest, slowest, suspicious,
          },
          questions: enrichedQuestions,
          max_score: maxScore, total_questions: totalQuestions,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/tests/:id/analytics/leaderboard — paginated, sorted, filtered attempt list
router.get(
  "/:id/analytics/leaderboard",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const testId = req.params.id;
      const page     = Math.max(1, parseInt(req.query.page)  || 1);
      const limit    = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
      const search   = (req.query.search || "").toLowerCase().trim();
      const sortKey  = req.query.sort || "pct";
      const sortDir  = req.query.dir  === "asc" ? 1 : -1;
      const filter   = req.query.filter || "submitted";
      const dateFrom = req.query.from  || null;
      const dateTo   = req.query.to    || null;

      let testQuery = supabase
        .from("tests").select("id, batch_id, institution_id").eq("id", testId);
      if (req.user.role !== "super-admin") testQuery = testQuery.eq("institution_id", req.user.institution_id);
      const { data: test, error: testErr } = await testQuery.single();
      if (testErr || !test) return res.status(404).json({ error: "Test not found" });

      const { data: qrows } = await supabase
        .from("test_questions").select("marks").eq("test_id", testId);
      const maxScore      = (qrows || []).reduce((s, q) => s + (q.marks || 1), 0);
      const totalQuestions = (qrows || []).length;

      let rows = [];

      if (filter === "not_attempted") {
        if (!test.batch_id) return res.json({ data: { attempts: [], total: 0, page, limit, total_pages: 0 } });

        const [{ data: batchStudents }, { data: existing }] = await Promise.all([
          supabase.from("batch_students")
            .select("student_id, profiles:student_id ( id, name, email, roll_number )")
            .eq("batch_id", test.batch_id),
          supabase.from("test_attempts").select("student_id").eq("test_id", testId),
        ]);
        const attemptedIds = new Set((existing || []).map(a => a.student_id));
        rows = (batchStudents || [])
          .filter(bs => !attemptedIds.has(bs.student_id))
          .map(bs => ({
            id: null, status: "not_attempted", score: null,
            started_at: null, submitted_at: null, last_answered_at: null, auto_submitted: false,
            correct: 0, wrong: 0, answered: 0, unanswered: totalQuestions,
            time_taken_secs: null, percentage: 0, max_score: maxScore,
            profiles: bs.profiles,
          }));
      } else {
        let q = supabase
          .from("test_attempts")
          .select(
            "id, status, score, started_at, submitted_at, auto_submitted, last_answered_at," +
            " correct_count, wrong_count, answered_count," +
            " profiles:student_id ( id, name, email, roll_number )"
          )
          .eq("test_id", testId);

        if (["submitted", "passed", "failed"].includes(filter)) q = q.eq("status", "submitted");
        else if (filter === "in_progress")                       q = q.eq("status", "in_progress");

        if (dateFrom) q = q.gte("submitted_at", dateFrom);
        if (dateTo)   q = q.lte("submitted_at", dateTo + "T23:59:59.999Z");

        const { data: attempts } = await q;
        rows = (attempts || []).map(a => {
          const t = a.submitted_at && a.started_at
            ? Math.max(0, Math.floor((new Date(a.submitted_at) - new Date(a.started_at)) / 1000))
            : null;
          const pct = maxScore > 0 && a.score != null ? Math.round((a.score / maxScore) * 100) : 0;
          return {
            ...a,
            correct: a.correct_count ?? 0, wrong: a.wrong_count ?? 0,
            answered: a.answered_count ?? 0, unanswered: totalQuestions - (a.answered_count ?? 0),
            time_taken_secs: t, percentage: pct, max_score: maxScore,
          };
        });

        if (filter === "passed") rows = rows.filter(r => r.percentage >= 40);
        if (filter === "failed") rows = rows.filter(r => r.percentage <  40);
      }

      // Search filter
      if (search) {
        rows = rows.filter(r => {
          const n = (r.profiles?.name ?? "").toLowerCase();
          const e = (r.profiles?.email ?? "").toLowerCase();
          const rn = (r.profiles?.roll_number ?? "").toLowerCase();
          return n.includes(search) || e.includes(search) || rn.includes(search);
        });
      }

      // Sort
      rows.sort((a, b) => {
        let av, bv;
        switch (sortKey) {
          case "name":       av = (a.profiles?.name ?? "").toLowerCase(); bv = (b.profiles?.name ?? "").toLowerCase(); break;
          case "roll":       av = a.profiles?.roll_number ?? ""; bv = b.profiles?.roll_number ?? ""; break;
          case "score":      av = a.score ?? -1;        bv = b.score ?? -1; break;
          case "pct":        av = a.percentage;          bv = b.percentage;  break;
          case "correct":    av = a.correct;             bv = b.correct;     break;
          case "wrong":      av = a.wrong;               bv = b.wrong;       break;
          case "unanswered": av = a.unanswered;          bv = b.unanswered;  break;
          case "time":       av = a.time_taken_secs ?? Infinity; bv = b.time_taken_secs ?? Infinity; break;
          case "submitted":  av = a.submitted_at ?? ""; bv = b.submitted_at ?? ""; break;
          default:           av = a.percentage; bv = b.percentage;
        }
        if (av < bv) return -sortDir;
        if (av > bv) return  sortDir;
        return 0;
      });

      const total = rows.length;
      const total_pages = Math.ceil(total / limit) || 0;
      const pageRows = rows.slice((page - 1) * limit, page * limit);

      return res.json({ data: { attempts: pageRows, total, page, limit, total_pages } });
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

      const sanitizedQuestions = (data.test_questions || [])
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map(({ correct_answer, ...question }) => ({
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

    const normalizedQuestions = (data.test_questions || [])
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((q) => ({
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
