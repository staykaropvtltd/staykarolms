const router = require("express").Router();
const supabase = require("../lib/supabase");
const redis = require("../lib/redis");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// GET /api/analytics/student — student's own progress
// Cached per-student in Redis for 30 s — eliminates 5 parallel DB queries on every dashboard load.
router.get("/student", authenticate, requireRole("student"), async (req, res, next) => {
  try {
    const studentId  = req.user.id;
    const cacheKey   = `analytics:student:${studentId}`;
    const cached     = await redis.get(cacheKey);
    if (cached) {
      try { return res.json({ data: JSON.parse(cached) }); }
      catch { /* corrupt — fall through */ }
    }

    const [
      { data: enrollments },
      { data: submissions },
      { data: attempts },
      { data: attendance },
      { data: aiSessions },
    ] = await Promise.all([
      supabase.from("enrollments").select("*, courses:course_id(title)").eq("student_id", studentId),
      supabase.from("assignment_submissions").select("grade, assignment_id").eq("student_id", studentId),
      supabase.from("test_attempts").select("score, status, test_id, created_at, tests:test_id(title,type)").eq("student_id", studentId),
      supabase.from("attendance").select("status").eq("student_id", studentId),
      supabase.from("ai_sessions").select("score, created_at").eq("student_id", studentId),
    ]);

    const presentDays = (attendance || []).filter((a) => a.status === "present").length;
    const totalDays   = (attendance || []).length;
    const avgGrade    = submissions?.length
      ? Math.round(submissions.reduce((s, r) => s + (r.grade || 0), 0) / submissions.length)
      : 0;
    const completedTests = (attempts || []).filter((a) => a.status === "submitted").length;

    // Calculate login streak from activity dates (ai_sessions + test_attempts)
    const activityDates = new Set();
    (aiSessions || []).forEach((s) => {
      if (s.created_at) activityDates.add(new Date(s.created_at).toISOString().split("T")[0]);
    });
    (attempts || []).forEach((a) => {
      if (a.created_at) activityDates.add(new Date(a.created_at).toISOString().split("T")[0]);
    });

    let streak = 0;
    const checkDate = new Date();
    checkDate.setUTCHours(0, 0, 0, 0);
    // If no activity today, start counting from yesterday
    if (!activityDates.has(checkDate.toISOString().split("T")[0])) {
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    }
    while (activityDates.has(checkDate.toISOString().split("T")[0])) {
      streak++;
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    }

    const data = {
      enrolledCourses: enrollments?.length || 0,
      attendancePercent: totalDays ? Math.round((presentDays / totalDays) * 100) : 0,
      avgAssignmentGrade: avgGrade,
      completedTests,
      aiSessionCount: aiSessions?.length || 0,
      streak,
      recentAttempts: attempts?.slice(0, 5) || [],
      enrollments: enrollments || [],
    };

    await redis.set(cacheKey, JSON.stringify(data), 30);
    return res.json({ data });
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

// GET /api/analytics/faculty/students — per-student performance for faculty's courses
router.get("/faculty/students", authenticate, requireRole("faculty", "admin"), async (req, res, next) => {
  try {
    // Get courses this faculty member owns (admin sees all institution courses)
    let courseQuery = supabase.from("courses").select("id, title");
    if (req.user.role === "faculty") {
      courseQuery = courseQuery.eq("faculty_id", req.user.id);
    } else {
      courseQuery = courseQuery.eq("institution_id", req.user.institution_id);
    }
    const { data: courses } = await courseQuery;
    const courseIds = (courses || []).map((c) => c.id);
    const courseMap = Object.fromEntries((courses || []).map((c) => [c.id, c.title]));

    if (courseIds.length === 0) return res.json({ data: [] });

    // Get all enrollments for these courses
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("student_id, course_id, profiles:student_id(id, name, email, last_seen_at)")
      .in("course_id", courseIds);

    if (!enrollments || enrollments.length === 0) return res.json({ data: [] });

    // Collect unique student IDs
    const studentIds = [...new Set(enrollments.map((e) => e.student_id))];

    // Get submissions for these students on these courses' assignments
    const [{ data: submissions }, { data: attendance }] = await Promise.all([
      supabase
        .from("assignment_submissions")
        .select("student_id, grade, submitted_at, assignments:assignment_id(course_id)")
        .in("student_id", studentIds),
      supabase
        .from("attendance")
        .select("student_id, status, course_id")
        .in("student_id", studentIds)
        .in("course_id", courseIds),
    ]);

    // Build per-student aggregates
    const studentMap = {};
    for (const e of enrollments) {
      const sid = e.student_id;
      if (!studentMap[sid]) {
        studentMap[sid] = {
          id: sid,
          name: e.profiles?.name || "Unknown",
          email: e.profiles?.email || "",
          lastSeenAt: e.profiles?.last_seen_at || null,
          courses: [],
          grades: [],
          presentDays: 0,
          totalDays: 0,
        };
      }
      if (!studentMap[sid].courses.includes(courseMap[e.course_id])) {
        studentMap[sid].courses.push(courseMap[e.course_id]);
      }
    }

    // Aggregate grades (only for courses owned by this faculty/admin)
    for (const sub of submissions || []) {
      const courseId = sub.assignments?.course_id;
      if (!courseId || !courseIds.includes(courseId)) continue;
      if (studentMap[sub.student_id] && sub.grade != null) {
        studentMap[sub.student_id].grades.push(sub.grade);
      }
    }

    // Aggregate attendance
    for (const att of attendance || []) {
      if (!studentMap[att.student_id]) continue;
      studentMap[att.student_id].totalDays++;
      if (att.status === "present") studentMap[att.student_id].presentDays++;
    }

    const result = Object.values(studentMap).map((s) => {
      const avgScore = s.grades.length
        ? Math.round(s.grades.reduce((a, b) => a + b, 0) / s.grades.length)
        : null;
      const attendancePct = s.totalDays
        ? Math.round((s.presentDays / s.totalDays) * 100)
        : null;
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        course: s.courses[0] || "—",
        assignments: s.grades.length,
        avgScore,
        attendance: attendancePct,
        lastSeenAt: s.lastSeenAt,
        scores: s.grades.slice(-8),
      };
    });

    return res.json({ data: result });
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

      const cacheKey = `analytics:admin:${institution_id || "sa"}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        try { return res.json({ data: JSON.parse(cached) }); }
        catch { /* corrupt — recompute */ }
      }

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
          ? supabase.from("test_attempts").select("score, status").in("test_id", testIds).limit(50000)
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
          supabase.from("assignment_submissions").select("grade").in("assignment_id", assignmentIds).limit(50000),
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

      const adminData = {
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
      };
      await redis.set(cacheKey, JSON.stringify(adminData), 60);
      return res.json({ data: adminData });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
