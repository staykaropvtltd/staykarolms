const router = require("express").Router();
const supabase = require("../lib/supabase");
const redis    = require("../lib/redis");
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

/**
 * Normalize a correct_answer value to a zero-based numeric index string.
 * Accepts: "A"/"B"/"C"/"D" (case-insensitive), 0-based numbers 0-9, or already-correct strings.
 * Examples: "A" → "0", "b" → "1", "C" → "2", "D" → "3", 2 → "2", "2" → "2".
 * For non-MCQ types the value is returned as-is (trimmed string).
 */
function normalizeCorrectAnswer(val, type) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s) return null;
  // Only convert letter→index for MCQ-family types
  const isChoiceBased = !type || type === "mcq" || type === "mcq-multi" || type === "true-false";
  if (isChoiceBased) {
    const lower = s.toLowerCase().replace(/[.)]/g, "");
    const letterIdx = ["a", "b", "c", "d"].indexOf(lower);
    if (letterIdx >= 0) return String(letterIdx);
    // If it's already a digit string, keep it
    const n = parseInt(s, 10);
    if (!isNaN(n) && n >= 0 && n <= 9) return String(n);
  }
  return s;
}

// GET /api/tests — list by institution + optional filters.
// ?archived=true  → return only archived tests (admin/faculty/super-admin only).
// Default         → return only active (non-archived) tests.
// Optional query params: ?limit=N&page=N&batch_id=&type=&status=
router.get("/", authenticate, async (req, res, next) => {
  try {
    const limit  = req.query.limit ? Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500)) : 500;
    const page   = req.query.page  ? Math.max(1, parseInt(req.query.page,  10) || 1) : 1;
    const offset = (page - 1) * limit;
    const showArchived = req.query.archived === "true" && req.user.role !== "student";

    let query = supabase.from("tests").select(`
      *,
      profiles:created_by ( name ),
      batches:batch_id ( name ),
      test_questions ( count )
    `);

    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    // Always scope by archive state so neither half leaks into the other view
    query = query.eq("is_archived", showArchived);

    if (req.query.batch_id) query = query.eq("batch_id", req.query.batch_id);
    if (req.query.type)     query = query.eq("type", req.query.type);
    if (req.query.status)   query = query.eq("status", req.query.status);

    // Students only see published (active) tests
    if (req.user.role === "student") {
      query = query.eq("status", "published");
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
          auto_submitted,
          flagged_reason,
          retake_granted,
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

      // Cache check — after ownership verified. Saves 3-4 DB round-trips on every admin refresh.
      const cacheKey = `analytics:test:summary:${testId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        try { return res.json({ data: JSON.parse(cached) }); }
        catch { /* corrupt — recompute */ }
      }

      const questions = (test.test_questions || []).sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );
      const totalQuestions = questions.length;
      const maxScore = questions.reduce((s, q) => s + (q.marks || 1), 0);

      // Institution name, all attempts, and batch enrollment count are independent — fetch in parallel.
      const [
        { data: instRow },
        { data: allAttempts },
        { count: totalEnrolled },
      ] = await Promise.all([
        supabase.from("institutions").select("name").eq("id", test.institution_id).maybeSingle().catch(() => ({ data: null })),
        supabase
          .from("test_attempts")
          .select(
            "id, status, score, started_at, submitted_at, auto_submitted, last_answered_at," +
            " profiles:student_id ( id, name, email, roll_number )"
          )
          .eq("test_id", testId)
          .limit(10000),
        test.batch_id
          ? supabase.from("batch_students").select("*", { count: "exact", head: true }).eq("batch_id", test.batch_id)
          : Promise.resolve({ count: null }),
      ]);

      const institutionName = instRow?.name ?? null;
      const attempts = allAttempts || [];
      const submitted = attempts.filter(a => a.status === "submitted");
      const inProgress = attempts.filter(a => a.status === "in_progress");
      const submittedIds = submitted.map(a => a.id);

      // Question-level answer stats — chunk .in() to stay under PostgREST URL limits
      const qStats = {}; // { [question_id]: { total, correct, wrong } }
      if (submittedIds.length > 0) {
        const CHUNK = 100;
        const chunks = [];
        for (let i = 0; i < submittedIds.length; i += CHUNK) chunks.push(submittedIds.slice(i, i + CHUNK));
        const chunkResults = await Promise.all(chunks.map(ids =>
          supabase.from("test_answers")
            .select("attempt_id, question_id, is_correct, answer")
            .in("attempt_id", ids)
        ));
        for (const { data: chunkAnswers } of chunkResults) {
          for (const ans of chunkAnswers || []) {
            if (!qStats[ans.question_id]) qStats[ans.question_id] = { total: 0, correct: 0, wrong: 0 };
            const has = ans.answer !== null && ans.answer !== undefined && ans.answer !== "";
            if (has) {
              qStats[ans.question_id].total++;
              if (ans.is_correct) qStats[ans.question_id].correct++;
              else qStats[ans.question_id].wrong++;
            }
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

      const withTime = subAug
        .filter(a => a.time_taken_secs !== null && Number.isFinite(a.time_taken_secs))
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

      const responseData = {
        test: {
          id: test.id, title: test.title, type: test.type,
          duration_mins: test.duration_mins, batch_id: test.batch_id,
          batch: test.batches || null, institution_name: institutionName,
        },
        summary: {
          total_enrolled: totalEnrolled ?? null,
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
      };
      try { await redis.set(cacheKey, JSON.stringify(responseData), 30); } catch (_) {}
      return res.json({ data: responseData });
    } catch (err) {
      console.error("[tests/analytics/summary] error:", err.message, err.stack);
      return res.status(500).json({ error: err.message || "Internal server error" });
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
    // Hot path during exam window: all students load the same question paper.
    // Serve from cache to avoid hammering the DB with 1500 identical reads.
    if (req.user.role === "student") {
      const hit = await redis.get(`test:paper:${req.params.id}`);
      if (hit) {
        try { return res.json({ data: JSON.parse(hit) }); }
        catch { /* corrupt entry — fall through to DB */ }
      }
    }

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
      // Students cannot see archived or unpublished tests
      if (data.is_archived || data.status !== "published") {
        return res.status(404).json({ error: "Test not found" });
      }

      const sanitizedQuestions = (data.test_questions || [])
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map(({ correct_answer, ...question }) => ({
          ...question,
          options: normalizeOptions(question.options),
        }));
      const sanitizedData = { ...data, test_questions: sanitizedQuestions };
      // Cache published papers for 2 min — questions are effectively locked during active exams.
      await redis.set(`test:paper:${req.params.id}`, JSON.stringify(sanitizedData), 120);
      return res.json({ data: sanitizedData });
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
    const { question, type, options, marks, order_index } = req.body;
    const correct_answer = normalizeCorrectAnswer(req.body.correct_answer, type);

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

// POST /api/tests/:id/questions/bulk — batch import (admin/faculty/super-admin)
// Supports all 14 question types. Validates rows, deduplicates, batch-inserts in
// chunks of 500, and rolls back by deleting already-inserted rows on partial failure.
const BULK_VALID_TYPES = new Set([
  "mcq","mcq-multi","true-false","fill-blank","short","long","descriptive",
  "coding","sql","case-study","matching","ordering","numerical","paragraph",
]);
const MCQ_TYPES = new Set(["mcq","mcq-multi","true-false"]);

router.post(
  "/:id/questions/bulk",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { questions } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "questions array is required and must not be empty" });
    }
    if (questions.length > 10000) {
      return res.status(400).json({ error: "Maximum 10,000 questions per import" });
    }

    try {
      // Verify test ownership + tenant isolation
      let testQuery = supabase.from("tests").select("id, institution_id").eq("id", req.params.id);
      if (req.user.role !== "super-admin") {
        testQuery = testQuery.eq("institution_id", req.user.institution_id);
      }
      const { data: test, error: testError } = await testQuery.single();
      if (testError || !test) return res.status(404).json({ error: "Test not found" });

      // Fetch existing question texts for duplicate detection
      const { data: existing } = await supabase
        .from("test_questions").select("question").eq("test_id", req.params.id);
      const existingTexts = new Set(
        (existing || []).map(q => (q.question || "").toLowerCase().trim())
      );

      // Highest current order_index
      const { data: maxRow } = await supabase
        .from("test_questions").select("order_index").eq("test_id", req.params.id)
        .order("order_index", { ascending: false }).limit(1).maybeSingle();
      let nextOrder = (maxRow?.order_index ?? -1) + 1;

      // Server-side validation
      const validRows = [];
      const errors = [];

      questions.forEach((q, i) => {
        const rowNum = i + 1;
        const rowErrors = [];
        const text = (q.question || "").trim();

        if (!text) rowErrors.push("Question text is required");
        else if (text.length < 3) rowErrors.push("Question is too short");
        else if (text.length > 5000) rowErrors.push("Question exceeds 5000 characters");

        const rawType = String(q.type || "mcq").toLowerCase().trim();
        const type = BULK_VALID_TYPES.has(rawType) ? rawType : null;
        if (!type) rowErrors.push(`Unknown question type "${q.type}"`);

        const marksRaw = Number(q.marks);
        const marks = (Number.isInteger(marksRaw) && marksRaw >= 1 && marksRaw <= 100) ? marksRaw : null;
        if (marks === null) rowErrors.push("Marks must be an integer 1–100");

        if (type && MCQ_TYPES.has(type)) {
          const opts = Array.isArray(q.options) ? q.options : [];
          const minOpts = type === "true-false" ? 2 : 4;
          const filled = opts.filter(o => String(o || "").trim()).length;
          if (filled < minOpts) rowErrors.push(`${type} requires ${minOpts} non-empty options (got ${filled})`);
          if (type !== "mcq-multi") {
            const ca = parseInt(String(q.correct_answer ?? "0"), 10);
            if (isNaN(ca) || ca < 0 || ca >= opts.length) rowErrors.push("correct_answer index out of range");
            else if (!String(opts[ca] || "").trim()) rowErrors.push("correct_answer points to empty option");
          }
        }

        const textLower = text.toLowerCase();
        if (text && existingTexts.has(textLower)) rowErrors.push("Duplicate of an existing question");

        if (rowErrors.length > 0) {
          errors.push({ row: rowNum, question: text.substring(0, 80), errors: rowErrors });
        } else {
          existingTexts.add(textLower);

          const row = {
            test_id: req.params.id,
            institution_id: test.institution_id,
            question: text,
            type,
            marks,
            order_index: nextOrder++,
          };

          // Options: store for all types that have them
          if (Array.isArray(q.options) && q.options.length) {
            row.options = q.options.map(o => String(o || "").trim());
          } else {
            row.options = null;
          }

          // Correct answer — always normalize to numeric index before storing
          if (q.correct_answer !== undefined && q.correct_answer !== null) {
            row.correct_answer = normalizeCorrectAnswer(q.correct_answer, type);
          } else {
            row.correct_answer = null;
          }

          // Optional enrichment fields (graceful — DB may not have these columns yet)
          if (q.topic) row.topic = String(q.topic).trim().substring(0, 200);
          if (q.explanation) row.explanation = String(q.explanation).substring(0, 2000);
          if (q.difficulty && ["easy","medium","hard"].includes(q.difficulty)) row.difficulty = q.difficulty;
          if (Array.isArray(q.tags) && q.tags.length) row.tags = q.tags.slice(0, 10).map(t => String(t).trim());
          if (q.metadata && typeof q.metadata === "object") row.metadata = q.metadata;

          validRows.push(row);
        }
      });

      if (validRows.length === 0) {
        return res.status(422).json({
          error: "No valid questions to import",
          data: { inserted: 0, skipped: errors.length, errors },
        });
      }

      // Batch insert in chunks of 500 — rollback by deleting on partial failure
      const CHUNK = 500;
      const insertedIds = [];
      let insertError = null;

      for (let i = 0; i < validRows.length; i += CHUNK) {
        const chunk = validRows.slice(i, i + CHUNK);
        const { data: inserted, error: chunkErr } = await supabase
          .from("test_questions").insert(chunk).select("id");

        if (chunkErr) { insertError = chunkErr; break; }
        if (inserted) insertedIds.push(...inserted.map(r => r.id));
      }

      if (insertError) {
        if (insertedIds.length > 0) {
          await supabase.from("test_questions").delete().in("id", insertedIds);
        }
        return res.status(400).json({
          error: "Import failed: " + insertError.message,
          data: { inserted: 0, skipped: errors.length, errors },
        });
      }

      // Audit log (non-blocking)
      try {
        const { logAudit } = require("../lib/audit");
        await logAudit(req, req.user, "questions_bulk_import", "test_questions", req.params.id, "info", "success", {
          inserted: insertedIds.length, skipped: errors.length,
        });
      } catch (_) {}

      // Invalidate cached student paper — questions just changed
      redis.del(`test:paper:${req.params.id}`).catch(() => {});

      return res.status(201).json({
        data: { inserted: insertedIds.length, skipped: errors.length, errors },
      });
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

      // Invalidate cached student paper — test metadata or status changed
      redis.del(`test:paper:${req.params.id}`).catch(() => {});
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

      // Invalidate cached paper — test is now published (or status toggled)
      redis.del(`test:paper:${req.params.id}`).catch(() => {});
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/tests/:id — soft delete (archive).
// Sets is_archived=true. Preserves all attempts, scores, and analytics.
// Students immediately lose access; admin/faculty can restore or view analytics.
router.delete(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      let query = supabase
        .from("tests")
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: req.user.id,
        })
        .eq("id", req.params.id)
        .eq("is_archived", false); // idempotency guard

      if (req.user.role !== "super-admin") {
        query = query.eq("institution_id", req.user.institution_id);
      }

      const { data, error } = await query.select("id, title").single();
      if (error || !data) return res.status(404).json({ error: "Test not found or already archived" });

      // Invalidate cached student paper so they can no longer load it
      redis.del(`test:paper:${req.params.id}`).catch(() => {});

      // Audit log
      try {
        const { logAudit } = require("../lib/audit");
        await logAudit(req, req.user, "test_archive", "tests", data.id, "warn", "success", { title: data.title });
      } catch (_) {}

      return res.json({ data: { message: "Test archived", id: data.id } });
    } catch (err) {
      return next(err);
    }
  }
);

// PUT /api/tests/:id/restore — restore a previously archived test.
// Returns the test to its pre-archive status (draft/published/completed unchanged).
router.put(
  "/:id/restore",
  authenticate,
  requireRole("admin", "super-admin"),
  async (req, res, next) => {
    try {
      let query = supabase
        .from("tests")
        .update({ is_archived: false, archived_at: null, archived_by: null })
        .eq("id", req.params.id)
        .eq("is_archived", true); // only operate on archived tests

      if (req.user.role !== "super-admin") {
        query = query.eq("institution_id", req.user.institution_id);
      }

      const { data, error } = await query.select("id, title, status").single();
      if (error || !data) return res.status(404).json({ error: "Archived test not found" });

      // Re-cache if it was published (students should be able to load it again)
      redis.del(`test:paper:${req.params.id}`).catch(() => {});

      try {
        const { logAudit } = require("../lib/audit");
        await logAudit(req, req.user, "test_restore", "tests", data.id, "info", "success", { title: data.title });
      } catch (_) {}

      return res.json({ data: { message: "Test restored", id: data.id, status: data.status } });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/tests/:id/force — permanent deletion.
// Removes all dependent records in FK-safe order:
//   test_answers → test_attempts → test_questions → tests + calendar_event
// Requires admin/super-admin. Requires confirmation token in body: { confirm: "FORCE_DELETE" }.
router.delete(
  "/:id/force",
  authenticate,
  requireRole("admin", "super-admin"),
  async (req, res, next) => {
    if (req.body?.confirm !== "FORCE_DELETE") {
      return res.status(400).json({
        error: 'Pass { "confirm": "FORCE_DELETE" } in the request body to confirm permanent deletion.',
      });
    }

    try {
      // Verify ownership before touching anything
      let testQuery = supabase
        .from("tests")
        .select("id, title, created_by")
        .eq("id", req.params.id);
      if (req.user.role !== "super-admin") {
        testQuery = testQuery.eq("institution_id", req.user.institution_id);
      }
      const { data: test, error: testErr } = await testQuery.single();
      if (testErr || !test) return res.status(404).json({ error: "Test not found" });

      // 1. Collect all attempt IDs for this test
      const { data: attempts } = await supabase
        .from("test_attempts")
        .select("id")
        .eq("test_id", req.params.id);

      const attemptIds = (attempts || []).map((a) => a.id);

      // 2. Delete test_answers (child of test_attempts)
      if (attemptIds.length > 0) {
        const { error: ansErr } = await supabase
          .from("test_answers")
          .delete()
          .in("attempt_id", attemptIds);
        if (ansErr) return res.status(500).json({ error: "Failed to delete answers: " + ansErr.message });
      }

      // 3. Delete test_attempts
      const { error: attErr } = await supabase
        .from("test_attempts")
        .delete()
        .eq("test_id", req.params.id);
      if (attErr) return res.status(500).json({ error: "Failed to delete attempts: " + attErr.message });

      // 4. Delete test_questions
      const { error: qErr } = await supabase
        .from("test_questions")
        .delete()
        .eq("test_id", req.params.id);
      if (qErr) return res.status(500).json({ error: "Failed to delete questions: " + qErr.message });

      // 5. Delete associated calendar event (best-effort)
      try {
        const { data: calEvent } = await supabase
          .from("calendar_events")
          .select("id")
          .eq("created_by", test.created_by)
          .eq("type", "exam")
          .textSearch("title", test.title)
          .limit(1)
          .maybeSingle();
        if (calEvent) {
          await supabase.from("calendar_events").delete().eq("id", calEvent.id);
        }
      } catch (calErr) {
        console.error("[tests] force-delete calendar event error:", calErr.message);
      }

      // 6. Delete the test itself
      let delQuery = supabase.from("tests").delete().eq("id", req.params.id);
      if (req.user.role !== "super-admin") {
        delQuery = delQuery.eq("institution_id", req.user.institution_id);
      }
      const { error: delErr } = await delQuery;
      if (delErr) return res.status(500).json({ error: "Failed to delete test: " + delErr.message });

      // Evict any cached paper
      redis.del(`test:paper:${req.params.id}`).catch(() => {});

      try {
        const { logAudit } = require("../lib/audit");
        await logAudit(req, req.user, "test_force_delete", "tests", req.params.id, "warn", "success", {
          title: test.title,
          attempts_deleted: attemptIds.length,
        });
      } catch (_) {}

      return res.json({
        data: {
          message: "Test permanently deleted",
          attempts_deleted: attemptIds.length,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
