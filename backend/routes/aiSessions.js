const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");

// GET /api/ai-sessions — list AI interview sessions for current user
router.get("/", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("ai_sessions")
      .select("*")
      .eq("student_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (err) {
    return next(err);
  }
});

// POST /api/ai-sessions — save a completed AI interview session
router.post("/", authenticate, async (req, res, next) => {
  const { track, difficulty, duration_mins, score, feedback, questions } = req.body;

  if (!track) return res.status(400).json({ error: "track is required" });

  try {
    const { data, error } = await supabase
      .from("ai_sessions")
      .insert({
        student_id: req.user.id,
        track,
        difficulty: difficulty || "Medium",
        duration_mins: duration_mins || 0,
        score: score || 0,
        feedback: feedback || "",
        questions: questions || [],
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/ai-sessions/:id — get single session detail
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("ai_sessions")
      .select("*")
      .eq("id", req.params.id)
      .eq("student_id", req.user.id)
      .single();

    if (error) return res.status(404).json({ error: "Session not found" });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
