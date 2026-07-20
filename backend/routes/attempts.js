const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

function normalizeOptions(options) {
  if (Array.isArray(options)) return options;
  if (typeof options === "string") {
    try {
      const parsed = JSON.parse(options);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      console.warn("[attempts] malformed options value:", options);
      return [];
    }
  }
  return options == null ? null : [];
}

/**
 * Normalize a correct_answer value to a numeric index string so grading always
 * compares apples-to-apples ("0"==="0" rather than "0"==="A").
 * Handles: "A"/"B"/"C"/"D" (case-insensitive), "a"/"b"/"c"/"d", digit strings, integers.
 */
function normalizeCorrectAnswer(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s) return null;
  const lower = s.toLowerCase().replace(/[.)\s]/g, "");
  const letterIdx = ["a", "b", "c", "d"].indexOf(lower);
  if (letterIdx >= 0) return String(letterIdx);
  const n = parseInt(s, 10);
  if (!isNaN(n) && n >= 0 && n <= 9) return String(n);
  return s;
}

// POST /api/attempts/start — student starts a test
router.post("/start", authenticate, requireRole("student"), async (req, res, next) => {
  const { test_id } = req.body;

  if (!test_id) return res.status(400).json({ error: "test_id is required" });

  try {
    // Fetch test, any in-progress attempt, and any unresolved flagged attempt in parallel
    const [
      { data: test, error: testError },
      { data: existing },
      { data: flagged },
    ] = await Promise.all([
      supabase.from("tests").select("id, institution_id, status").eq("id", test_id).single(),
      supabase.from("test_attempts")
        .select("id, status")
        .eq("test_id", test_id)
        .eq("student_id", req.user.id)
        .eq("status", "in_progress")
        .maybeSingle(),
      supabase.from("test_attempts")
        .select("id, flagged_reason")
        .eq("test_id", test_id)
        .eq("student_id", req.user.id)
        .eq("status", "submitted")
        .eq("retake_granted", false)
        .not("flagged_reason", "is", null)
        .maybeSingle(),
    ]);

    if (testError || !test) return res.status(404).json({ error: "Test not found" });

    if (req.user.role !== "super-admin" && test.institution_id !== req.user.institution_id) {
      return res.status(404).json({ error: "Test not found" });
    }

    if (test.status !== "published") {
      return res.status(403).json({ error: "Test is not available for attempts" });
    }

    // Block students whose previous attempt was terminated for suspicious activity
    // until an admin explicitly grants a retake.
    if (flagged) {
      return res.status(403).json({
        error: "test_flagged",
        message: "Your previous attempt was terminated due to suspicious activity. Contact your instructor to get permission to retake this test.",
      });
    }

    if (existing) {
      return res.json({ data: existing });
    }

    const { data, error } = await supabase
      .from("test_attempts")
      .insert({ test_id, student_id: req.user.id })
      .select()
      .single();

    if (error) {
      // Race condition: two concurrent /start calls both passed the "existing" check.
      // Unique constraint fires on the second insert — fetch and return the winner's attempt.
      if (error.code === "23505") {
        const { data: race } = await supabase
          .from("test_attempts")
          .select("id, status")
          .eq("test_id", test_id)
          .eq("student_id", req.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (race) return res.json({ data: race });
      }
      return res.status(400).json({ error: error.message });
    }
    return res.status(201).json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/attempts/:id/answers — batch-save all answers (idempotent, preferred)
// Accepts { answers: [{ question_id, answer }, ...] } and upserts them all in one
// DB round-trip. Reduces answer-phase DB operations from N×2 to 1×2.
router.post("/:id/answers", authenticate, requireRole("student"), async (req, res, next) => {
  const { answers } = req.body;

  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: "answers array is required and must not be empty" });
  }
  if (answers.some(a => !a.question_id)) {
    return res.status(400).json({ error: "Each answer must include question_id" });
  }

  try {
    const { data: attempt, error: attemptError } = await supabase
      .from("test_attempts")
      .select("id, student_id, status")
      .eq("id", req.params.id)
      .eq("student_id", req.user.id)
      .single();

    if (attemptError || !attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }
    if (attempt.status !== "in_progress") {
      return res.status(400).json({ error: "Attempt is not in progress" });
    }

    const rows = answers.map(({ question_id, answer }) => ({
      attempt_id: req.params.id,
      question_id,
      answer: answer ?? null,
    }));

    const { data, error } = await supabase
      .from("test_answers")
      .upsert(rows, { onConflict: "attempt_id,question_id" })
      .select();

    if (error) return res.status(400).json({ error: error.message });

    // Update last_answered_at timestamp (non-blocking)
    supabase.from("test_attempts")
      .update({ last_answered_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .then(({ error: e }) => { if (e) console.error("[attempts] last_answered_at update:", e.message); });

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/attempts/:id/answer — save one answer (kept for API compatibility)
router.post("/:id/answer", authenticate, requireRole("student"), async (req, res, next) => {
  const { question_id, answer } = req.body;

  if (!question_id) return res.status(400).json({ error: "question_id is required" });

  try {
    const { data: attempt, error: attemptError } = await supabase
      .from("test_attempts")
      .select("id, student_id, status, test_id")
      .eq("id", req.params.id)
      .eq("student_id", req.user.id)
      .single();

    if (attemptError || !attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    if (attempt.status !== "in_progress") {
      return res.status(400).json({ error: "Attempt is not in progress" });
    }

    const { data, error } = await supabase
      .from("test_answers")
      .upsert(
        { attempt_id: req.params.id, question_id, answer },
        { onConflict: "attempt_id,question_id" }
      )
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Update last_answered_at (non-blocking)
    supabase.from("test_attempts")
      .update({ last_answered_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .then(({ error: e }) => { if (e) console.error("[attempts] last_answered_at update:", e.message); });

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// POST /api/attempts/:id/submit — finalize attempt, auto-grade MCQ
router.post("/:id/submit", authenticate, requireRole("student"), async (req, res, next) => {
  const attemptId    = req.params.id;
  const autoSubmitted = !!(req.body && req.body.auto_submitted);
  const flaggedReason = (req.body && req.body.flagged_reason) ? String(req.body.flagged_reason) : null;

  try {
    // Fetch attempt — we need test_id before we can fetch the test,
    // so this is necessarily a sequential step.
    const { data: attempt, error: attemptError } = await supabase
      .from("test_attempts")
      .select("id, student_id, status, started_at, test_id")
      .eq("id", attemptId)
      .eq("student_id", req.user.id)
      .single();

    if (attemptError || !attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    if (attempt.status !== "in_progress") {
      return res.status(400).json({ error: "Attempt is not in progress" });
    }

    // Fetch test metadata and answers in parallel — both are independent once we have test_id.
    // Server-side time enforcement: 2-minute grace period absorbs clock skew.
    const [{ data: test }, { data: answers, error: answersError }] = await Promise.all([
      supabase.from("tests").select("duration_mins").eq("id", attempt.test_id).single(),
      supabase.from("test_answers").select("*, test_questions(*)").eq("attempt_id", attemptId),
    ]);

    // Skip time check when flagged — cheating detection always wins over the grace period
    if (test?.duration_mins && !flaggedReason) {
      const elapsedMins = (Date.now() - new Date(attempt.started_at).getTime()) / 60000;
      if (elapsedMins > test.duration_mins + 2) {
        return res.status(403).json({ error: "Test time has expired" });
      }
    }

    if (answersError) return res.status(400).json({ error: answersError.message });

    let totalScore = 0;

    // Grade all answers in-memory, then bulk-upsert in a single HTTP call to Supabase.
    // Replaces N individual UPDATE calls (one per answer) with a single request.
    const gradedRows = answers.map((ans) => {
      const question = ans.test_questions;
      let isCorrect = false;
      let marksAwarded = 0;
      const mcqTypes = ["mcq", "mcq-multi", "true-false"];
      if (mcqTypes.includes(question?.type) && question?.correct_answer != null) {
        // Normalize both sides so "A"==="0" and "0"==="0" both work
        const studentAnswer = normalizeCorrectAnswer(ans.answer);
        const correctAnswer = normalizeCorrectAnswer(question.correct_answer);
        isCorrect = studentAnswer !== null &&
                    studentAnswer !== "" &&
                    studentAnswer === correctAnswer;
        marksAwarded = isCorrect ? (question.marks || 1) : 0;
      }
      totalScore += marksAwarded;
      return {
        id: ans.id,
        attempt_id: attemptId,
        question_id: ans.question_id,
        answer: ans.answer,
        is_correct: isCorrect,
        marks_awarded: marksAwarded,
      };
    });

    if (gradedRows.length > 0) {
      const { error: gradeErr } = await supabase
        .from("test_answers")
        .upsert(gradedRows, { onConflict: "id" });
      if (gradeErr) console.error("[attempts/submit] bulk grade error:", gradeErr.message);
    }

    // Finalize attempt — store denormalised counts for fast leaderboard queries
    const correctCount  = gradedRows.filter(r => r.is_correct).length;
    const answeredCount = gradedRows.filter(r => r.answer !== null && r.answer !== undefined && r.answer !== "").length;
    const wrongCount    = answeredCount - correctCount;

    // CAS update: only succeeds when status is still "in_progress".
    // If two submit requests race, exactly one will match this WHERE clause.
    const { data, error } = await supabase
      .from("test_attempts")
      .update({
        status:         "submitted",
        submitted_at:   new Date().toISOString(),
        score:          totalScore,
        auto_submitted: autoSubmitted,
        flagged_reason: flaggedReason,
        correct_count:  correctCount,
        wrong_count:    wrongCount,
        answered_count: answeredCount,
      })
      .eq("id", attemptId)
      .eq("status", "in_progress")
      .select()
      .single();

    if (error) {
      // PGRST116 = 0 rows — attempt was already submitted by a concurrent request
      if (error.code === "PGRST116" || !data) {
        return res.status(400).json({ error: "Attempt already submitted" });
      }
      return res.status(400).json({ error: error.message });
    }
    if (!data) return res.status(400).json({ error: "Attempt already submitted" });
    return res.json({ data: { ...data, score: totalScore } });
  } catch (err) {
    return next(err);
  }
});

// GET /api/attempts/:id/result — full result breakdown
router.get("/:id/result", authenticate, async (req, res, next) => {
  try {
    const { data: attempt, error: attemptError } = await supabase
      .from("test_attempts")
      .select(`
        *,
        tests:test_id ( title, type, duration_mins, institution_id ),
        test_answers (
          *,
          test_questions ( question, type, correct_answer, marks, options, order_index )
        )
      `)
      .eq("id", req.params.id)
      .single();

    if (attemptError) return res.status(404).json({ error: "Attempt not found" });

    // Students can only see their own result
    if (req.user.role === "student" && attempt.student_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Admin/faculty are scoped to their institution
    if (req.user.role !== "student" && req.user.role !== "super-admin") {
      if (attempt.tests?.institution_id !== req.user.institution_id) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    // Audit: log every admin/faculty review of a student attempt
    if (req.user.role !== "student") {
      try {
        const { logAudit } = require("../lib/audit");
        await logAudit(req, req.user, "attempt_review", "test_attempts", req.params.id, "info", "success", {
          student_id: attempt.student_id,
          test_id: attempt.test_id,
        });
      } catch (_) {}
    }

    // Normalize options and sort answers by question order_index
    const normalizedAttempt = {
      ...attempt,
      test_answers: (attempt.test_answers || [])
        .sort((a, b) => (a.test_questions?.order_index ?? 0) - (b.test_questions?.order_index ?? 0))
        .map((ans) => ({
          ...ans,
          test_questions: ans.test_questions
            ? { ...ans.test_questions, options: normalizeOptions(ans.test_questions.options) }
            : ans.test_questions,
        })),
    };

    return res.json({ data: normalizedAttempt });
  } catch (err) {
    return next(err);
  }
});

// POST /api/attempts/:id/grant-retake — admin/faculty grants retake after flagged termination
router.post("/:id/grant-retake", authenticate, requireRole("admin", "faculty", "super-admin"), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("test_attempts")
      .update({
        retake_granted:    true,
        retake_granted_by: req.user.id,
        retake_granted_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .not("flagged_reason", "is", null)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: "Flagged attempt not found" });

    const { logAudit } = require("../lib/audit");
    logAudit(req, req.user, "grant_retake", "test_attempts", req.params.id, "info", "success", {
      student_id: data.student_id,
      test_id:    data.test_id,
    }).catch(() => {});

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
