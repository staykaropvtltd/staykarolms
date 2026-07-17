const router = require("express").Router();
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/roleGuard");

// Helper to fetch and merge all events for the calendar
async function fetchMergedEvents(req, from, to) {
  let studentCourseIds = [];
  let studentBatchIds = [];

  if (req.user.role === "student") {
    const [{ data: enrollments }, { data: batchStudents }] = await Promise.all([
      supabase.from("enrollments").select("course_id").eq("student_id", req.user.id),
      supabase.from("batch_students").select("batch_id").eq("student_id", req.user.id),
    ]);
    studentCourseIds = (enrollments || []).map((e) => e.course_id).filter(Boolean);
    studentBatchIds = (batchStudents || []).map((b) => b.batch_id).filter(Boolean);
  } else if (req.user.role === "faculty") {
    const { data: facultyCourses } = await supabase
      .from("courses")
      .select("id")
      .eq("faculty_id", req.user.id);
    studentCourseIds = (facultyCourses || []).map((c) => c.id).filter(Boolean);
  }

  // 1. Fetch Calendar Events
  let eventsQuery = supabase.from("calendar_events").select("*, courses:course_id(title)");
  if (req.user.role !== "super-admin") {
    eventsQuery = eventsQuery.eq("institution_id", req.user.institution_id);
  }
  if (req.user.role === "student") {
    if (studentCourseIds.length > 0) {
      eventsQuery = eventsQuery.or(`course_id.in.(${studentCourseIds.join(",")}),course_id.is.null`);
    } else {
      eventsQuery = eventsQuery.is("course_id", null);
    }
  } else if (req.user.role === "faculty") {
    if (studentCourseIds.length > 0) {
      eventsQuery = eventsQuery.or(`course_id.in.(${studentCourseIds.join(",")}),course_id.is.null,created_by.eq.${req.user.id}`);
    } else {
      eventsQuery = eventsQuery.or(`course_id.is.null,created_by.eq.${req.user.id}`);
    }
  }
  if (from) eventsQuery = eventsQuery.gte("scheduled_at", from);
  if (to) eventsQuery = eventsQuery.lte("scheduled_at", to);

  // 2. Fetch Live Classes
  let classesQuery = supabase.from("live_classes").select("*, courses:course_id(title)");
  if (req.user.role !== "super-admin") {
    classesQuery = classesQuery.eq("institution_id", req.user.institution_id);
  }
  if (req.user.role === "student") {
    const orFilters = ["and(batch_id.is.null,course_id.is.null)"];
    if (studentBatchIds.length > 0) orFilters.push(`batch_id.in.(${studentBatchIds.join(",")})`);
    if (studentCourseIds.length > 0) orFilters.push(`course_id.in.(${studentCourseIds.join(",")})`);
    classesQuery = classesQuery.or(orFilters.join(","));
  } else if (req.user.role === "faculty") {
    if (studentCourseIds.length > 0) {
      classesQuery = classesQuery.or(`course_id.in.(${studentCourseIds.join(",")}),created_by.eq.${req.user.id}`);
    } else {
      classesQuery = classesQuery.eq("created_by", req.user.id);
    }
  }
  if (from) classesQuery = classesQuery.gte("scheduled_at", from);
  if (to) classesQuery = classesQuery.lte("scheduled_at", to);

  // 3. Fetch Tests
  let testsQuery = supabase.from("tests").select("*, batches:batch_id(courses:course_id(title))");
  if (req.user.role !== "super-admin") {
    testsQuery = testsQuery.eq("institution_id", req.user.institution_id);
  }
  if (req.user.role === "student") {
    testsQuery = testsQuery.eq("status", "published");
    if (studentBatchIds.length > 0) {
      testsQuery = testsQuery.or(`batch_id.in.(${studentBatchIds.join(",")}),batch_id.is.null`);
    } else {
      testsQuery = testsQuery.is("batch_id", null);
    }
  } else if (req.user.role === "faculty") {
    if (studentCourseIds.length > 0) {
      testsQuery = testsQuery.or(`batches.course_id.in.(${studentCourseIds.join(",")}),created_by.eq.${req.user.id}`);
    } else {
      testsQuery = testsQuery.eq("created_by", req.user.id);
    }
  }
  if (from) testsQuery = testsQuery.gte("scheduled_at", from);
  if (to) testsQuery = testsQuery.lte("scheduled_at", to);

  // 4. Fetch Assignments
  let assignmentsQuery = supabase.from("assignments").select("*, courses:course_id(title, institution_id)");
  if (req.user.role === "student") {
    if (studentCourseIds.length > 0) {
      assignmentsQuery = assignmentsQuery.or(`course_id.in.(${studentCourseIds.join(",")}),course_id.is.null`);
    } else {
      assignmentsQuery = assignmentsQuery.is("course_id", null);
    }
  } else if (req.user.role === "faculty") {
    if (studentCourseIds.length > 0) {
      assignmentsQuery = assignmentsQuery.or(`course_id.in.(${studentCourseIds.join(",")}),created_by.eq.${req.user.id}`);
    } else {
      assignmentsQuery = assignmentsQuery.eq("created_by", req.user.id);
    }
  } else if (req.user.role !== "super-admin") {
    assignmentsQuery = assignmentsQuery.eq("courses.institution_id", req.user.institution_id);
  }
  if (from) assignmentsQuery = assignmentsQuery.gte("due_date", from);
  if (to) assignmentsQuery = assignmentsQuery.lte("due_date", to);
  // Fire all 4 event queries in parallel — they are fully independent of each other.
  const [
    { data: calendarEvents },
    { data: liveClasses },
    { data: tests },
    { data: assignments },
  ] = await Promise.all([eventsQuery, classesQuery, testsQuery, assignmentsQuery]);

  // Format all events consistently
  const formattedCalendar = (calendarEvents || []).map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type || "live",
    scheduled_at: e.scheduled_at,
    end_at: e.end_at,
    duration_mins: e.duration_mins,
    courses: e.courses,
    description: e.description,
  }));

  const formattedClasses = (liveClasses || []).map((c) => ({
    id: c.id,
    title: c.title,
    type: "live",
    scheduled_at: c.scheduled_at,
    duration_mins: c.duration_mins,
    courses: c.courses,
    description: c.description || `Platform: ${c.platform}`,
  }));

  const formattedTests = (tests || []).map((t) => ({
    id: t.id,
    title: t.title,
    type: "exam",
    scheduled_at: t.scheduled_at,
    duration_mins: t.duration_mins,
    courses: t.batches?.courses ? { title: t.batches.courses.title } : null,
    description: `Test type: ${t.type}`,
  }));

  const formattedAssignments = (assignments || []).map((a) => ({
    id: a.id,
    title: `Deadline: ${a.title}`,
    type: "exam",
    scheduled_at: a.due_date,
    courses: a.courses,
    description: a.description,
  }));

  const allEvents = [
    ...formattedCalendar,
    ...formattedClasses,
    ...formattedTests,
    ...formattedAssignments,
  ];

  // Sort chronologically
  allEvents.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  return allEvents;
}

// GET /api/calendar — events for current user
router.get("/", authenticate, async (req, res, next) => {
  try {
    const events = await fetchMergedEvents(req, req.query.from, req.query.to);
    return res.json({ data: events });
  } catch (err) {
    return next(err);
  }
});

// GET /api/calendar/upcoming — upcoming 5 events for logged-in user
router.get("/upcoming", authenticate, async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    const events = await fetchMergedEvents(req, now, null);
    return res.json({ data: events.slice(0, 5) });
  } catch (err) {
    return next(err);
  }
});

// POST /api/calendar — create event
router.post(
  "/",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    const { title, type, course_id, scheduled_at, end_at, duration_mins, description } = req.body;

    if (!title || !scheduled_at) {
      return res.status(400).json({ error: "title and scheduled_at are required" });
    }

    try {
      const { data, error } = await supabase
        .from("calendar_events")
        .insert({
          title,
          type: type || "live",
          course_id,
          institution_id: req.user.institution_id,
          created_by: req.user.id,
          scheduled_at,
          end_at,
          duration_mins,
          description,
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

// PUT /api/calendar/:id — update event
router.put(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { title, type, course_id, scheduled_at, end_at, duration_mins, description } = req.body;

      const updateFields = {};
      if (title !== undefined) updateFields.title = title;
      if (type !== undefined) updateFields.type = type;
      if (course_id !== undefined) updateFields.course_id = course_id;
      if (scheduled_at !== undefined) updateFields.scheduled_at = scheduled_at;
      if (end_at !== undefined) updateFields.end_at = end_at;
      if (duration_mins !== undefined) updateFields.duration_mins = duration_mins;
      if (description !== undefined) updateFields.description = description;

      let query = supabase
        .from("calendar_events")
        .update(updateFields)
        .eq("id", req.params.id);

      if (req.user.role !== "super-admin") {
        query = query.eq("institution_id", req.user.institution_id);
      }

      const { data, error } = await query.select().single();

      if (error) return res.status(400).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Event not found or access denied" });
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/calendar/:id
router.delete(
  "/:id",
  authenticate,
  requireRole("admin", "faculty", "super-admin"),
  async (req, res, next) => {
    try {
      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", req.params.id);

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data: { message: "Event deleted" } });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
