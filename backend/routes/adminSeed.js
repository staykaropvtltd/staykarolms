const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// POST /api/admin/seed-exam
// Temporary one-shot endpoint — seeds the load-test exam for k6.
// Remove this file and the server.js route once seeding is confirmed.
router.post(
  "/seed-exam",
  authenticate,
  requireRole("admin", "super-admin"),
  async (req, res, next) => {
    try {
      // 1. Find institution via student@college.edu
      const { data: studentProfile } = await supabase
        .from("profiles")
        .select("institution_id")
        .eq("email", "student@college.edu")
        .single();

      if (!studentProfile?.institution_id) {
        return res.status(400).json({ error: "No profile for student@college.edu" });
      }

      const institutionId = studentProfile.institution_id;

      // 2. Find admin/faculty creator in that institution
      let { data: creator } = await supabase
        .from("profiles")
        .select("id")
        .eq("institution_id", institutionId)
        .in("role", ["admin", "faculty"])
        .order("role")
        .limit(1)
        .single();

      if (!creator) {
        const { data: fallback } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", "student@college.edu")
          .single();
        creator = fallback;
      }

      if (!creator) {
        return res.status(400).json({ error: "No creator profile found" });
      }

      // 3. Check if test already exists
      let { data: existing } = await supabase
        .from("tests")
        .select("id, status")
        .eq("title", "Load Test Exam — MCQ Practice")
        .eq("institution_id", institutionId)
        .single();

      let testId;
      let action;

      if (existing) {
        testId = existing.id;
        if (existing.status !== "published") {
          await supabase.from("tests").update({ status: "published" }).eq("id", testId);
          action = "promoted_to_published";
        } else {
          action = "already_published";
        }
      } else {
        const { data: newTest, error: insertErr } = await supabase
          .from("tests")
          .insert({
            title: "Load Test Exam — MCQ Practice",
            type: "aptitude",
            status: "published",
            duration_mins: 30,
            institution_id: institutionId,
            created_by: creator.id,
            batch_id: null,
          })
          .select("id")
          .single();

        if (insertErr || !newTest) {
          return res.status(500).json({ error: insertErr?.message || "Insert returned no ID" });
        }
        testId = newTest.id;
        action = "created";
      }

      // 4. Seed questions if none exist
      const { count: qCount } = await supabase
        .from("test_questions")
        .select("id", { count: "exact", head: true })
        .eq("test_id", testId);

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

      // 5. Verify
      const { count: finalCount } = await supabase
        .from("test_questions")
        .select("id", { count: "exact", head: true })
        .eq("test_id", testId);

      // Diagnostic: run the exact query GET /api/tests uses
      const { data: listResult, error: listErr } = await supabase
        .from("tests")
        .select(`*, profiles:created_by ( name ), batches:batch_id ( name ), test_questions ( count )`)
        .eq("institution_id", institutionId)
        .eq("status", "published")
        .order("created_at", { ascending: false });

      // Simple query (no joins)
      const { data: simpleResult, error: simpleErr } = await supabase
        .from("tests")
        .select("id, title, status, institution_id")
        .eq("institution_id", institutionId)
        .eq("status", "published");

      // Run the tests list using req.user.institution_id (exactly as GET /api/tests does)
      const { data: userScopedResult, error: userScopedErr } = await supabase
        .from("tests")
        .select("id, title, status, institution_id")
        .eq("institution_id", req.user.institution_id)
        .eq("status", "published");

      return res.json({
        success: true,
        test_id: testId,
        institution_id: institutionId,
        test_action: action,
        questions_action: questionsAction,
        question_count: finalCount,
        diag_req_user: req.user,
        diag_list_count: listResult?.length ?? null,
        diag_list_error: listErr?.message ?? null,
        diag_simple_count: simpleResult?.length ?? null,
        diag_user_scoped_count: userScopedResult?.length ?? null,
        diag_user_scoped_error: userScopedErr?.message ?? null,
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
