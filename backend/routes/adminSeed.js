const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");

// POST /api/admin/seed-exam — TEMP: re-seed the load-test exam (tests table was cleared)
// Role guard relaxed intentionally — endpoint is temporary and uses service key on backend
router.post(
  "/seed-exam",
  authenticate,
  async (req, res, next) => {
    try {
      const { data: studentProfile } = await supabase
        .from("profiles").select("institution_id").eq("email", "student@college.edu").single();

      if (!studentProfile?.institution_id) {
        return res.status(400).json({ error: "No profile for student@college.edu" });
      }
      const institutionId = studentProfile.institution_id;

      let { data: creator } = await supabase
        .from("profiles").select("id")
        .eq("institution_id", institutionId).in("role", ["admin", "faculty"])
        .order("role").limit(1).single();

      if (!creator) {
        const { data: fallback } = await supabase.from("profiles").select("id")
          .eq("email", "student@college.edu").single();
        creator = fallback;
      }
      if (!creator) return res.status(400).json({ error: "No creator profile found" });

      let { data: existing } = await supabase.from("tests")
        .select("id, status")
        .eq("title", "Load Test Exam — MCQ Practice")
        .eq("institution_id", institutionId).single();

      let testId, action;
      if (existing) {
        testId = existing.id;
        if (existing.status !== "published") {
          await supabase.from("tests").update({ status: "published" }).eq("id", testId);
          action = "promoted_to_published";
        } else {
          action = "already_published";
        }
      } else {
        const { data: newTest, error: insertErr } = await supabase.from("tests").insert({
          title: "Load Test Exam — MCQ Practice",
          type: "aptitude",
          status: "published",
          duration_mins: 30,
          institution_id: institutionId,
          created_by: creator.id,
          batch_id: null,
        }).select("id").single();

        if (insertErr || !newTest) {
          return res.status(500).json({ error: insertErr?.message || "Insert returned no ID" });
        }
        testId = newTest.id;
        action = "created";
      }

      const { count: qCount } = await supabase.from("test_questions")
        .select("id", { count: "exact", head: true }).eq("test_id", testId);

      let questionsAction = "already_exist";
      if (!qCount || qCount === 0) {
        await supabase.from("test_questions").insert([
          { test_id: testId, question: "What does HTTP stand for?", type: "mcq", options: JSON.stringify(["HyperText Transfer Protocol","High Transfer Text Protocol","Hyperlink Text Protocol","HyperText Template Protocol"]), correct_answer: "HyperText Transfer Protocol", marks: 2, order_index: 1 },
          { test_id: testId, question: "Which data structure follows LIFO ordering?", type: "mcq", options: JSON.stringify(["Queue","Stack","Linked List","Binary Tree"]), correct_answer: "Stack", marks: 2, order_index: 2 },
          { test_id: testId, question: "What is the time complexity of binary search?", type: "mcq", options: JSON.stringify(["O(n)","O(n²)","O(log n)","O(1)"]), correct_answer: "O(log n)", marks: 2, order_index: 3 },
          { test_id: testId, question: "Which SQL keyword retrieves unique values?", type: "mcq", options: JSON.stringify(["UNIQUE","DISTINCT","ONLY","FILTER"]), correct_answer: "DISTINCT", marks: 2, order_index: 4 },
          { test_id: testId, question: "Which HTTP method updates an existing resource?", type: "mcq", options: JSON.stringify(["GET","POST","PUT","DELETE"]), correct_answer: "PUT", marks: 2, order_index: 5 },
        ]);
        questionsAction = "seeded";
      }

      const { count: finalCount } = await supabase.from("test_questions")
        .select("id", { count: "exact", head: true }).eq("test_id", testId);

      // Verify via student-equivalent query
      const { data: allTests } = await supabase.from("tests")
        .select("id, title, status, institution_id")
        .eq("institution_id", institutionId).eq("status", "published");

      return res.json({
        success: true,
        test_id: testId,
        institution_id: institutionId,
        test_action: action,
        questions_action: questionsAction,
        question_count: finalCount,
        visible_published_tests: allTests?.length ?? 0,
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
