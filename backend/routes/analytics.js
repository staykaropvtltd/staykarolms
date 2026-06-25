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

      // 2. Compute attendance percentage
      const { data: studentProfiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("institution_id", institution_id);
      const studentIds = (studentProfiles || []).map((profile) => profile.id);

      let attendancePercent = 0;
      if (studentIds.length > 0) {
        const { data: att } = await supabase
          .from("attendance")
          .select("status")
          .in("student_id", studentIds);

        const totalDays = att?.length || 0;
        const presentDays = att?.filter((a) => a.status === "present").length || 0;
        attendancePercent = totalDays ? Math.round((presentDays / totalDays) * 100) : 0;
      }

      // 3. Compute test statistics
      const { data: testsInInstitution } = await supabase
        .from("tests")
        .select("id")
        .eq("institution_id", institution_id);
      const testIds = (testsInInstitution || []).map((test) => test.id);

      let totalAttempts = 0;
      let submittedAttempts = [];
      let avgTestScore = 0;
      if (testIds.length > 0) {
        const { data: attempts } = await supabase
          .from("test_attempts")
          .select("score, status")
          .in("test_id", testIds);

        totalAttempts = attempts?.length || 0;
        submittedAttempts = attempts?.filter((a) => a.status === "submitted") || [];
        avgTestScore = submittedAttempts.length
          ? Math.round(submittedAttempts.reduce((acc, curr) => acc + (curr.score || 0), 0) / submittedAttempts.length)
          : 0;
      }

      // 4. Compute assignment statistics
      const { data: instCourses } = await supabase
        .from("courses")
        .select("id")
        .eq("institution_id", institution_id);
      const instCourseIds = (instCourses || []).map((c) => c.id);

      let totalAssignments = 0;
      let avgAssignmentGrade = 0;
      let totalSubmissions = 0;
      let pendingSubmissions = 0;

      if (instCourseIds.length > 0) {
        const { data: institutionAssignments } = await supabase
          .from("assignments")
          .select("id")
          .in("course_id", instCourseIds);

        const assignmentIds = (institutionAssignments || []).map((a) => a.id);
        totalAssignments = assignmentIds.length;

        if (assignmentIds.length > 0) {
          const { data: subs } = await supabase
            .from("assignment_submissions")
            .select("grade")
            .in("assignment_id", assignmentIds);

          totalSubmissions = subs?.length || 0;
          const gradedSubs = subs?.filter((s) => s.grade !== null) || [];
          avgAssignmentGrade = gradedSubs.length
            ? Math.round(gradedSubs.reduce((acc, curr) => acc + curr.grade, 0) / gradedSubs.length)
            : 0;

          const { count } = await supabase
            .from("assignment_submissions")
            .select("*", { count: "exact", head: true })
            .in("assignment_id", assignmentIds)
            .is("grade", null);
          pendingSubmissions = count || 0;
        }
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
