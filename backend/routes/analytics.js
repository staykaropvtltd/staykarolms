const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/analytics/student — student's own progress
router.get("/student", authenticate, requireRole("student"), async (req, res, next) => {
  try {
    const studentId = req.user.id;

    const [
      { data: enrollments },
      { data: submissions },
      { data: attempts },
      { data: attendance },
      { data: aiSessions },
    ] = await Promise.all([
      supabase.from("enrollments").select("*, courses:course_id(title)").eq("student_id", studentId),
      supabase.from("assignment_submissions").select("grade, assignment_id").eq("student_id", studentId),
      supabase.from("test_attempts").select("score, status, test_id, tests:test_id(title,type)").eq("student_id", studentId),
      supabase.from("attendance").select("status").eq("student_id", studentId),
      supabase.from("ai_sessions").select("score, created_at").eq("student_id", studentId),
    ]);

    const presentDays = (attendance || []).filter((a) => a.status === "present").length;
    const totalDays   = (attendance || []).length;
    const avgGrade    = submissions?.length
      ? Math.round(submissions.reduce((s, r) => s + (r.grade || 0), 0) / submissions.length)
      : 0;
    const completedTests = (attempts || []).filter((a) => a.status === "submitted").length;

    return res.json({
      data: {
        enrolledCourses: enrollments?.length || 0,
        attendancePercent: totalDays ? Math.round((presentDays / totalDays) * 100) : 0,
        avgAssignmentGrade: avgGrade,
        completedTests,
        aiSessionCount: aiSessions?.length || 0,
        recentAttempts: attempts?.slice(0, 5) || [],
        enrollments: enrollments || [],
      },
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/analytics/faculty — faculty course analytics
router.get("/faculty", authenticate, requireRole("faculty"), async (req, res, next) => {
  try {
    const { data: courses } = await supabase
      .from("courses")
      .select("id, title, enrollments(count)")
      .eq("faculty_id", req.user.id);

    const facultyCourseIds = (courses || []).map((c) => c.id);

    const [{ data: submissions }, { data: attendance }] = await Promise.all([
      facultyCourseIds.length > 0
        ? supabase
            .from("assignment_submissions")
            .select("grade, assignment_id, assignments:assignment_id(course_id)")
            .not("grade", "is", null)
            .in("assignments.course_id", facultyCourseIds)
        : Promise.resolve({ data: [] }),
      facultyCourseIds.length > 0
        ? supabase.from("attendance").select("status, course_id").in("course_id", facultyCourseIds)
        : Promise.resolve({ data: [] }),
    ]);

    return res.json({
      data: {
        totalCourses: courses?.length || 0,
        totalStudents: courses?.reduce((s, c) => s + (c.enrollments?.[0]?.count || 0), 0) || 0,
        avgSubmissionGrade: submissions?.length
          ? Math.round(submissions.reduce((s, r) => s + (r.grade || 0), 0) / submissions.length)
          : 0,
        courses: courses || [],
      },
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/analytics/admin — institution overview
router.get(
  "/admin",
  authenticate,
  requireRole("admin", "super-admin"),
  async (req, res, next) => {
    try {
      const institution_id = req.user.institution_id;

      // 1. Fetch counts
      const [
        { count: totalStudents },
        { count: totalFaculty },
        { count: totalCourses },
        { count: totalTests },
        { count: totalClasses },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "student").eq("institution_id", institution_id),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "faculty").eq("institution_id", institution_id),
        supabase.from("courses").select("*", { count: "exact", head: true }).eq("institution_id", institution_id),
        supabase.from("tests").select("*", { count: "exact", head: true }).eq("institution_id", institution_id),
        supabase.from("live_classes").select("*", { count: "exact", head: true }).eq("institution_id", institution_id),
      ]);

      // 2–4. Parallel batch: attendance %, test stats, assignment stats
      // All three are independent — run concurrently instead of sequentially.
      const [
        { data: attRows },
        { data: testsInInstitution },
        { data: instCourses },
      ] = await Promise.all([
        // Attendance: use a scalar aggregate via RPC where possible; fall back to
        // fetching status column only with a hard cap to avoid full-table scans.
        supabase
          .from("attendance")
          .select("status, profiles!inner(institution_id)")
          .eq("profiles.institution_id", institution_id)
          .limit(10000),
        supabase
          .from("tests")
          .select("id")
          .eq("institution_id", institution_id),
        supabase
          .from("courses")
          .select("id")
          .eq("institution_id", institution_id),
      ]);

      // Attendance %
      const totalDaysAtt  = attRows?.length || 0;
      const presentDays   = attRows?.filter((a) => a.status === "present").length || 0;
      const attendancePercent = totalDaysAtt
        ? Math.round((presentDays / totalDaysAtt) * 100) : 0;

      // Test stats — fetch attempts for discovered test IDs
      const testIds = (testsInInstitution || []).map((t) => t.id);
      const instCourseIds = (instCourses || []).map((c) => c.id);

      const [
        { data: attempts },
        { data: institutionAssignments },
      ] = await Promise.all([
        testIds.length > 0
          ? supabase.from("test_attempts").select("score, status").in("test_id", testIds).limit(5000)
          : Promise.resolve({ data: [] }),
        instCourseIds.length > 0
          ? supabase.from("assignments").select("id").in("course_id", instCourseIds)
          : Promise.resolve({ data: [] }),
      ]);

      const totalAttempts    = attempts?.length || 0;
      const submittedAttempts = attempts?.filter((a) => a.status === "submitted") || [];
      const avgTestScore = submittedAttempts.length
        ? Math.round(submittedAttempts.reduce((acc, curr) => acc + (curr.score || 0), 0) / submittedAttempts.length)
        : 0;

      // Assignment stats — fetch submissions for discovered assignment IDs
      const assignmentIds = (institutionAssignments || []).map((a) => a.id);
      const totalAssignments = assignmentIds.length;

      let avgAssignmentGrade = 0;
      let totalSubmissions   = 0;
      let pendingSubmissions = 0;

      if (assignmentIds.length > 0) {
        const [
          { data: subs },
          { count: pendingCount },
        ] = await Promise.all([
          supabase.from("assignment_submissions").select("grade").in("assignment_id", assignmentIds).limit(5000),
          supabase
            .from("assignment_submissions")
            .select("*", { count: "exact", head: true })
            .in("assignment_id", assignmentIds)
            .is("grade", null),
        ]);

        totalSubmissions = subs?.length || 0;
        pendingSubmissions = pendingCount || 0;
        const gradedSubs = subs?.filter((s) => s.grade !== null) || [];
        avgAssignmentGrade = gradedSubs.length
          ? Math.round(gradedSubs.reduce((acc, curr) => acc + curr.grade, 0) / gradedSubs.length)
          : 0;
      }

      return res.json({
        data: {
          totalStudents: totalStudents || 0,
          totalFaculty: totalFaculty || 0,
          totalCourses: totalCourses || 0,
          totalTests: totalTests || 0,
          totalClasses: totalClasses || 0,
          pendingGrading: pendingSubmissions || 0,
          attendancePercent,
          testStatistics: {
            totalAttempts,
            completedAttempts: submittedAttempts.length,
            averageScore: avgTestScore,
          },
          assignmentStatistics: {
            totalAssignments,
            totalSubmissions,
            averageGrade: avgAssignmentGrade,
          }
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
