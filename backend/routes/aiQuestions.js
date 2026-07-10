const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/ai-questions — list questions for current institution (all authenticated)
router.get("/", authenticate, async (req, res, next) => {
  try {
    let query = supabase
      .from("ai_interview_questions")
      .select("id, question, category, difficulty, track, answer_guide, created_at")
      .order("created_at", { ascending: false });

    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }

    if (req.query.track) query = query.eq("track", req.query.track);
    if (req.query.difficulty) query = query.eq("difficulty", req.query.difficulty);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

// POST /api/ai-questions — create question (admin / super-admin only)
router.post("/", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  try {
    const { question, category, difficulty, track, answer_guide } = req.body;
    if (!question) return res.status(400).json({ error: "question is required" });

    const { data, error } = await supabase
      .from("ai_interview_questions")
      .insert({
        institution_id: req.user.role === "super-admin" ? null : req.user.institution_id,
        created_by: req.user.id,
        question,
        category: category || "General",
        difficulty: difficulty || "Medium",
        track: track || "general",
        answer_guide: answer_guide || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/ai-questions/:id — delete question (admin / super-admin only)
router.delete("/:id", authenticate, requireRole("admin", "super-admin"), async (req, res, next) => {
  try {
    let query = supabase.from("ai_interview_questions").delete().eq("id", req.params.id);
    if (req.user.role !== "super-admin") {
      query = query.eq("institution_id", req.user.institution_id);
    }
    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: { deleted: true } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
