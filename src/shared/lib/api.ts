
const API_URL = import.meta.env.VITE_API_URL ?? "";

// ── Token cache ────────────────────────────────────────────────────────────────
// We store the token here so apiFetch never needs to call getSession().
// getSession() can hang if it tries to auto-refresh an expired token over the network.
// Instead, AuthContext sets this token synchronously from onAuthStateChange.
let _cachedToken: string | null = null;
export function setCachedToken(token: string | null) {
  _cachedToken = token;
}

// ── Response type ───────────────────────────────────────────────────────────
export interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
  status?: number;
}

// ── Core fetch helper ────────────────────────────────────────────────────────
async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  // Simple retry logic for transient network failures (connection reset, failed to fetch)
  const MAX_RETRIES = 2;
  let attempt = 0;

  const attemptFetch = async (): Promise<ApiResponse<T>> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`[API] ⏰ TIMEOUT — aborting ${path} after 60s`);
      controller.abort();
    }, 60000);

    try {
      // Use cached token — avoids calling getSession() which can hang on token refresh
      const token = _cachedToken;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const url = path.startsWith("http") ? path : `${API_URL}${path}`;
      if (!API_URL && !path.startsWith("http")) {
        console.warn("[API] No VITE_API_URL set. Using relative API URL:", path);
      }
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let json: any = {};
      try {
        json = await res.json();
      } catch (parseErr) {
        console.warn(`[API] ▶ Step 4 — JSON parse failed, reading as text`, parseErr);
        const text = await res.text().catch(() => "");
        json = { error: text || `HTTP ${res.status}` };
      }

      if (!res.ok) {
        // On 401 (expired token), wait up to 1.5 s for AuthContext to refresh
        // the token via onAuthStateChange, then retry the request once.
        if (res.status === 401 && attempt === 0 && _cachedToken) {
          const tokenAtSend = token;
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (_cachedToken && _cachedToken !== tokenAtSend) {
              attempt++;
              return attemptFetch();
            }
          }
        }
        console.warn(`[API] Error calling ${path}:`, json.error || `HTTP ${res.status}`);
        return { data: null, error: json.error || `HTTP ${res.status}`, status: res.status };
      }

      return { data: json.data as T, error: null, status: res.status };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        console.warn(`[API] Request timeout calling ${path} after 60s`);
        return { data: null, error: "Request timeout" };
      }
      // For network failures (e.g. Failed to fetch / connection reset), retry a couple times
      const isNetworkErr = err instanceof TypeError || (err && (err as any).code === 'ECONNRESET');
      if (isNetworkErr && attempt < MAX_RETRIES) {
        attempt++;
        const backoff = 200 * attempt;
        console.warn(`[API] Network error calling ${path}, retrying attempt ${attempt} after ${backoff}ms`, err);
        await new Promise((r) => setTimeout(r, backoff));
        return attemptFetch();
      }

      console.error(`[API] Unexpected error calling ${path}:`, err);
      return { data: null, error: err instanceof Error ? err.message : "Network error" };
    }
  };

  // start attempts
  return attemptFetch();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const login = (email: string, password: string) =>
  apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getMe = () => apiFetch("/api/auth/me");

export const logout = () =>
  apiFetch("/api/auth/logout", { method: "POST" });

// ── Users ────────────────────────────────────────────────────────────────────

export const getUsers = (role?: string) =>
  apiFetch(`/api/users${role ? `?role=${role}` : ""}`);

export const getUser = (id: string) => apiFetch(`/api/users/${id}`);

export const createUser = (payload: {
  email: string;
  password: string;
  name: string;
  role: string;
  institution_id?: string;
}) => apiFetch("/api/users", { method: "POST", body: JSON.stringify(payload) });

export const bulkCreateStudents = (
  students: { name: string; email: string }[],
  default_password?: string
) =>
  apiFetch("/api/users/bulk", {
    method: "POST",
    body: JSON.stringify({ students, default_password }),
  });

export const importNominalRoll = (payload: {
  students: { roll_no: string; name: string; section?: string; branch?: string }[];
  email_domain: string;
  password_mode: "roll_no" | "custom";
  default_password?: string;
  batch_id?: string;
}) =>
  apiFetch<{
    total: number;
    created: number;
    already_existed: number;
    failed: number;
    batch_assigned: number;
    failures: { roll_no: string; email?: string; reason: string }[];
  }>("/api/users/nominal-roll", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateUser = (id: string, payload: Record<string, unknown>) =>
  apiFetch(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteUser = (id: string) =>
  apiFetch(`/api/users/${id}`, { method: "DELETE" });

// ── Courses ──────────────────────────────────────────────────────────────────

export const getCourses = () => apiFetch("/api/courses");

export const getAvailableCourses = () => apiFetch("/api/courses?available=true");

export const createCourse = (payload: {
  title: string;
  description?: string;
  faculty_id?: string;
  thumbnail_url?: string;
}) => apiFetch("/api/courses", { method: "POST", body: JSON.stringify(payload) });

export const updateCourse = (id: string, payload: Record<string, unknown>) =>
  apiFetch(`/api/courses/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteCourse = (id: string) =>
  apiFetch(`/api/courses/${id}`, { method: "DELETE" });

export const enrollCourse = (courseId: string) =>
  apiFetch(`/api/courses/${courseId}/enroll`, { method: "POST" });

export const getCourseStudents = (courseId: string) =>
  apiFetch(`/api/courses/${courseId}/students`);

export const getCourse = (id: string) => apiFetch(`/api/courses/${id}`);

export const getCourseContent = (courseId: string) =>
  apiFetch(`/api/courses/${courseId}/content`);

export const getLessonCompletions = (courseId: string) =>
  apiFetch<string[]>(`/api/courses/${courseId}/completions`);

export const markLessonComplete = (courseId: string, contentId: string) =>
  apiFetch<{ completed: boolean; progress: number; certificateGenerated: boolean; certificate: any }>(
    `/api/courses/${courseId}/content/${contentId}/complete`,
    { method: "POST" }
  );

export const getCourseModules = (courseId: string) =>
  apiFetch(`/api/courses/${courseId}/modules`);

export const createCourseModule = (courseId: string, payload: { title: string; order_index?: number }) =>
  apiFetch(`/api/courses/${courseId}/modules`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateCourseModule = (courseId: string, moduleId: string, title: string) =>
  apiFetch(`/api/courses/${courseId}/modules/${moduleId}`, {
    method: "PUT",
    body: JSON.stringify({ title }),
  });

export const deleteCourseModule = (courseId: string, moduleId: string) =>
  apiFetch(`/api/courses/${courseId}/modules/${moduleId}`, { method: "DELETE" });

export const addCourseContent = (courseId: string, payload: {
  title: string;
  type: string;
  url?: string;
  description?: string;
  duration_mins?: number;
  order_index?: number;
  module_id?: string | null;
}) => apiFetch(`/api/courses/${courseId}/content`, { method: "POST", body: JSON.stringify(payload) });

export const deleteCourseContent = (courseId: string, contentId: string) =>
  apiFetch(`/api/courses/${courseId}/content/${contentId}`, { method: "DELETE" });

/**
 * Uploads a File object to Supabase Storage via the backend upload endpoint.
 * Returns { data: { url, path, filename } } on success.
 */
export const uploadCourseFile = async (file: File, folder = "course-content"): Promise<ApiResponse<{ url: string; path: string; filename: string }>> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const result = await apiFetch<{ url: string; path: string; filename: string }>("/api/upload", {
        method: "POST",
        body: JSON.stringify({ file: base64, filename: file.name, folder, bucket: "uploads" }),
      });
      resolve(result);
    };
    reader.onerror = () => resolve({ data: null, error: "Failed to read file" });
    reader.readAsDataURL(file);
  });
};

// ── Assignments & Submissions ────────────────────────────────────────────────

// ── Attendance ───────────────────────────────────────────────────────────────

// ── Tests ────────────────────────────────────────────────────────────────────

export const getTests = (params?: { batch_id?: string; type?: string; status?: string; archived?: string }) => {
  const qs = params
    ? "?" + new URLSearchParams(params as Record<string, string>).toString()
    : "";
  return apiFetch(`/api/tests${qs}`);
};

export const getTest = (id: string) => apiFetch(`/api/tests/${id}`);

export const createTest = (payload: {
  title: string;
  type: "coding" | "aptitude" | "mock";
  batch_id?: string;
  duration_mins: number;
  scheduled_at?: string;
}) => apiFetch("/api/tests", { method: "POST", body: JSON.stringify(payload) });

export const addTestQuestion = (
  testId: string,
  payload: {
    question: string;
    type: "mcq" | "coding" | "short";
    options?: string[];
    correct_answer?: string;
    marks?: number;
    order_index?: number;
  }
) =>
  apiFetch(`/api/tests/${testId}/questions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const publishTest = (testId: string) =>
  apiFetch(`/api/tests/${testId}/publish`, { method: "PUT" });

export const updateTest = (
  testId: string,
  payload: {
    title?: string;
    type?: "coding" | "aptitude" | "mock";
    duration_mins?: number;
    scheduled_at?: string;
    batch_id?: string;
    status?: string;
  }
) => apiFetch(`/api/tests/${testId}`, { method: "PUT", body: JSON.stringify(payload) });

export const archiveTest = (testId: string) =>
  apiFetch(`/api/tests/${testId}`, { method: "DELETE" });

export const restoreTest = (testId: string) =>
  apiFetch(`/api/tests/${testId}/restore`, { method: "PUT" });

export const forceDeleteTest = (testId: string) =>
  apiFetch(`/api/tests/${testId}/force`, {
    method: "DELETE",
    body: JSON.stringify({ confirm: "FORCE_DELETE" }),
  });

export const getTestAttempts = (testId: string) =>
  apiFetch(`/api/tests/${testId}/attempts`);

export const getTestAnalyticsSummary = (testId: string) =>
  apiFetch(`/api/tests/${testId}/analytics/summary`);

export const getTestLeaderboard = (
  testId: string,
  params: {
    page?: number; limit?: number; search?: string;
    sort?: string; dir?: string; filter?: string;
    from?: string; to?: string;
  } = {}
) => {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return apiFetch(`/api/tests/${testId}/analytics/leaderboard${qs ? `?${qs}` : ""}`);
};

export const updateTestQuestion = (
  testId: string,
  qId: string,
  payload: {
    question?: string;
    type?: "mcq" | "coding" | "short";
    options?: string[] | null;
    correct_answer?: string | null;
    marks?: number;
    order_index?: number;
  }
) =>
  apiFetch(`/api/tests/${testId}/questions/${qId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteTestQuestion = (testId: string, qId: string) =>
  apiFetch(`/api/tests/${testId}/questions/${qId}`, { method: "DELETE" });

export const bulkImportQuestions = (
  testId: string,
  questions: Array<{
    question: string;
    type: string;
    options?: string[];
    correct_answer?: string;
    marks?: number;
    topic?: string;
    explanation?: string;
    difficulty?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }>
) =>
  apiFetch(`/api/tests/${testId}/questions/bulk`, {
    method: "POST",
    body: JSON.stringify({ questions }),
  });

// ── Universal Import ──────────────────────────────────────────────────────────

/** Upload any supported file to the backend for server-side parsing. */
export const parseImportFile = async (file: File): Promise<ApiResponse<any>> => {
  const token = _cachedToken;
  const formData = new FormData();
  formData.append("file", file);
  try {
    const url = `${API_URL}/api/imports/parse`;
    const res = await fetch(url, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: json.error || `HTTP ${res.status}`, status: res.status };
    return { data: json.data, error: null, status: res.status };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Network error" };
  }
};

/** Re-parse an Excel file with a different sheet (sends buffered base64). */
export const reParseExcelSheet = (buffer: string, filename: string, sheet: string) =>
  apiFetch("/api/imports/parse/sheet", {
    method: "POST",
    body: JSON.stringify({ buffer, filename, sheet }),
  });

/** Record a completed import in the history log. */
export const createImportJob = (payload: {
  test_id?: string;
  file_name: string;
  file_type: string;
  file_size: number;
  total_questions: number;
  inserted: number;
  skipped: number;
  failed_count: number;
  error_log: unknown[];
}) =>
  apiFetch("/api/imports/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/** Get import history for the institution. */
export const getImportJobs = (limit = 50) =>
  apiFetch(`/api/imports/jobs?limit=${limit}`);

// ── Attempts ─────────────────────────────────────────────────────────────────

export const startAttempt = (testId: string) =>
  apiFetch("/api/attempts/start", {
    method: "POST",
    body: JSON.stringify({ test_id: testId }),
  });

export const saveAnswer = (
  attemptId: string,
  questionId: string,
  answer: string
) =>
  apiFetch(`/api/attempts/${attemptId}/answer`, {
    method: "POST",
    body: JSON.stringify({ question_id: questionId, answer }),
  });

export const submitAttempt = (attemptId: string, autoSubmitted = false, flaggedReason?: string) =>
  apiFetch(`/api/attempts/${attemptId}/submit`, {
    method: "POST",
    body: JSON.stringify({ auto_submitted: autoSubmitted, flagged_reason: flaggedReason ?? null }),
  });

export const grantRetake = (attemptId: string) =>
  apiFetch(`/api/attempts/${attemptId}/grant-retake`, { method: "POST" });

export const getAttemptResult = (attemptId: string) =>
  apiFetch(`/api/attempts/${attemptId}/result`);



// ── Attendance ────────────────────────────────────────────────────────────────

export const markAttendance = (
  records: { student_id: string; course_id: string; date: string; status: string }[]
) =>
  apiFetch("/api/attendance/mark", {
    method: "POST",
    body: JSON.stringify({ records }),
  });

export const getStudentAttendance = (studentId: string) =>
  apiFetch(`/api/attendance/student/${studentId}`);

export const getCourseAttendance = (courseId: string) =>
  apiFetch(`/api/attendance/course/${courseId}`);

// ── Notifications ─────────────────────────────────────────────────────────────

export const getNotifications = () => apiFetch("/api/notifications");

export const markNotificationRead = (id: string) =>
  apiFetch(`/api/notifications/${id}/read`, { method: "PUT" });

export const markAllNotificationsRead = () =>
  apiFetch("/api/notifications/read-all", { method: "PUT" });

export const getUnreadNotificationCount = () =>
  apiFetch<{ count: number }>("/api/notifications/unread/count");

export const sendNotification = (payload: {
  user_id?: string;
  user_ids?: string[];
  title: string;
  message: string;
  type?: "success" | "info" | "warning" | "error";
  category?: "system" | "academic" | "assignment" | "certificate";
}) =>
  apiFetch("/api/notifications", { method: "POST", body: JSON.stringify(payload) });

// ── Analytics ─────────────────────────────────────────────────────────────────

export const getStudentAnalytics = () => apiFetch("/api/analytics/student");

export const getFacultyAnalytics = () => apiFetch("/api/analytics/faculty");

export const getAdminAnalytics = () => apiFetch("/api/analytics/admin");



// ── AI Sessions ───────────────────────────────────────────────────────────────

export const saveAiSession = (sessionData: {
  track: string;
  difficulty: string;
  duration_mins?: number;
  score?: number;
  feedback?: string;
  questions?: unknown[];
}) =>
  apiFetch("/api/ai-sessions", {
    method: "POST",
    body: JSON.stringify(sessionData),
  });

export const getAiSessions = () => apiFetch("/api/ai-sessions");

// ── AI Interview Questions ─────────────────────────────────────────────────────

export const getInterviewQuestions = (params?: { track?: string; difficulty?: string }) => {
  const qs = params
    ? "?" + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString()
    : "";
  return apiFetch(`/api/ai-questions${qs}`);
};

export const createInterviewQuestion = (data: {
  question: string;
  category?: string;
  difficulty?: string;
  track?: string;
  answer_guide?: string;
}) => apiFetch("/api/ai-questions", { method: "POST", body: JSON.stringify(data) });

export const deleteInterviewQuestion = (id: string) =>
  apiFetch(`/api/ai-questions/${id}`, { method: "DELETE" });

// ── Certificates ──────────────────────────────────────────────────────────────

export const getCertificates = () => apiFetch("/api/certificates");

export const generateCertificate = (studentId: string, courseId: string, fileUrl?: string) =>
  apiFetch("/api/certificates/generate", {
    method: "POST",
    body: JSON.stringify({ student_id: studentId, course_id: courseId, file_url: fileUrl }),
  });

export const bulkGenerateCertificates = (courseId: string, batchId?: string) =>
  apiFetch("/api/certificates/bulk-generate", {
    method: "POST",
    body: JSON.stringify({ course_id: courseId, batch_id: batchId }),
  });

export const verifyCertificate = (code: string) =>
  apiFetch(`/api/certificates/verify/${code}`);

// ── Billing ───────────────────────────────────────────────────────────────────

export const getBilling = () => apiFetch("/api/billing");

export const createInvoice = (payload: {
  institution_id: string;
  plan: string;
  amount: number;
  invoice_url?: string;
}) => apiFetch("/api/billing", { method: "POST", body: JSON.stringify(payload) });

// ── Batches ───────────────────────────────────────────────────────────────────

export const getBatches = () => apiFetch("/api/batches");

export const getBatch = (id: string) => apiFetch(`/api/batches/${id}`);

export const getStudentPermissions = () =>
  apiFetch<{ allowed_paths: string[] | null }>("/api/batches/student-permissions");

export const createBatch = (payload: {
  name: string;
  description?: string;
  mentor_id?: string;
  start_date?: string;
  end_date?: string;
}) => apiFetch("/api/batches", { method: "POST", body: JSON.stringify(payload) });

export const updateBatch = (id: string, payload: Record<string, unknown>) =>
  apiFetch(`/api/batches/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteBatch = (id: string) =>
  apiFetch(`/api/batches/${id}`, { method: "DELETE" });

export const addStudentToBatch = (batchId: string, studentId: string) =>
  apiFetch(`/api/batches/${batchId}/students`, {
    method: "POST",
    body: JSON.stringify({ student_id: studentId }),
  });

export const removeStudentFromBatch = (batchId: string, studentId: string) =>
  apiFetch(`/api/batches/${batchId}/students/${studentId}`, { method: "DELETE" });

export const removeAllStudentsFromBatch = (batchId: string) =>
  apiFetch(`/api/batches/${batchId}/students`, { method: "DELETE" });

export const bulkAddStudentsToBatch = (batchId: string, emails: string[]) =>
  apiFetch(`/api/batches/${batchId}/students/bulk`, {
    method: "POST",
    body: JSON.stringify({ emails }),
  });

export const getBatchCourses = (batchId: string) =>
  apiFetch(`/api/batches/${batchId}/courses`);

export const assignCourseToBatch = (batchId: string, courseId: string) =>
  apiFetch(`/api/batches/${batchId}/courses`, {
    method: "POST",
    body: JSON.stringify({ course_id: courseId }),
  });

export const removeCourseFromBatch = (batchId: string, courseId: string) =>
  apiFetch(`/api/batches/${batchId}/courses/${courseId}`, { method: "DELETE" });

// ── Live Classes ──────────────────────────────────────────────────────────────

export const getLiveClasses = (status?: string) =>
  apiFetch(`/api/live-classes${status ? `?status=${status}` : ""}`);

export const createLiveClass = (payload: {
  title: string;
  course_id?: string;
  scheduled_at: string;
  duration_mins?: number;
  platform?: string;
  meeting_link?: string;
  description?: string;
}) => apiFetch("/api/live-classes", { method: "POST", body: JSON.stringify(payload) });

export const updateLiveClass = (id: string, payload: Record<string, unknown>) =>
  apiFetch(`/api/live-classes/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteLiveClass = (id: string) =>
  apiFetch(`/api/live-classes/${id}`, { method: "DELETE" });

export const startAttendance = (liveClassId: string) =>
  apiFetch(`/api/live-classes/${liveClassId}/start-attendance`, { method: "PUT" });

export const endLiveClass = (liveClassId: string) =>
  apiFetch(`/api/live-classes/${liveClassId}/end`, { method: "PUT" });


export const updateLiveClassAttendance = (liveClassId: string, studentId: string, status: string) =>
  apiFetch(`/api/live-classes/${liveClassId}/attendance/${studentId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });

export const markLiveAttendance = (liveClassId: string, status: string) =>
  apiFetch(`/api/live-classes/${liveClassId}/attendance`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });

export const getLiveClassAttendance = (liveClassId: string) =>
  apiFetch(`/api/live-classes/${liveClassId}/attendance`);

export const getActiveLiveClasses = () =>
  apiFetch("/api/live-classes/active");

// ── Messages ──────────────────────────────────────────────────────────────────

export const getMessageThreads = () => apiFetch("/api/messages");

export const getThreadMessages = (userId: string) => apiFetch(`/api/messages/${userId}`);

export const sendMessage = (receiverId: string, content: string) =>
  apiFetch("/api/messages", {
    method: "POST",
    body: JSON.stringify({ receiver_id: receiverId, content }),
  });

export const markMessageRead = (id: string) =>
  apiFetch(`/api/messages/${id}/read`, { method: "PUT" });

export const getUnreadMessageCount = () =>
  apiFetch("/api/messages/unread/count");

// ── Calendar ──────────────────────────────────────────────────────────────────

export const getCalendarEvents = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return apiFetch(`/api/calendar${qs ? `?${qs}` : ""}`);
};

export const createCalendarEvent = (payload: {
  title: string;
  type?: string;
  course_id?: string;
  scheduled_at: string;
  end_at?: string;
  duration_mins?: number;
  description?: string;
}) => apiFetch("/api/calendar", { method: "POST", body: JSON.stringify(payload) });

export const updateCalendarEvent = (id: string, payload: Record<string, unknown>) =>
  apiFetch(`/api/calendar/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteCalendarEvent = (id: string) =>
  apiFetch(`/api/calendar/${id}`, { method: "DELETE" });

// ── File Upload ───────────────────────────────────────────────────────────────

export const uploadFile = (
  file: string, // base64
  filename: string,
  folder?: string,
  bucket?: string
) =>
  apiFetch("/api/upload", {
    method: "POST",
    body: JSON.stringify({ file, filename, folder, bucket }),
  });

// ── Assignments ───────────────────────────────────────────────────────────────

export const getAssignments = () => apiFetch("/api/assignments");

export const getAssignment = (id: string) => apiFetch(`/api/assignments/${id}`);

export const createAssignment = (payload: {
  title: string;
  description?: string;
  course_id?: string;
  due_date?: string;
  max_marks?: number;
}) => apiFetch("/api/assignments", { method: "POST", body: JSON.stringify(payload) });

export const submitAssignment = (id: string, file_url: string) =>
  apiFetch(`/api/assignments/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ file_url }),
  });

export const gradeSubmission = (submissionId: string, grade: number, feedback?: string) =>
  apiFetch(`/api/assignments/submissions/${submissionId}/grade`, {
    method: "PUT",
    body: JSON.stringify({ grade, feedback }),
  });

// ── Submissions ───────────────────────────────────────────────────────────────

export const getSubmissions = (status?: string) =>
  apiFetch(`/api/submissions${status ? `?status=${status}` : ""}`);

export const getStudentSubmissions = () =>
  apiFetch("/api/submissions/student");

// ── Audit Logs ────────────────────────────────────────────────────────────────

export const getAuditLogs = (params?: { page?: number; limit?: number; severity?: string; action?: string }) => {
  const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
  return apiFetch(`/api/audit-logs${qs}`);
};

export const createAuditLog = (payload: {
  action: string;
  resource?: string;
  resource_id?: string;
  severity?: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
}) => apiFetch("/api/audit-logs", { method: "POST", body: JSON.stringify(payload) });

// ── Support Tickets ───────────────────────────────────────────────────────────

export const getSupportTickets = (params?: { status?: string; priority?: string }) => {
  const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
  return apiFetch(`/api/support-tickets${qs}`);
};

export const createSupportTicket = (payload: {
  subject: string;
  priority?: string;
  category?: string;
}) => apiFetch("/api/support-tickets", { method: "POST", body: JSON.stringify(payload) });

export const getTicketMessages = (ticketId: string) =>
  apiFetch(`/api/support-tickets/${ticketId}/messages`);

export const replyToTicket = (ticketId: string, content: string, is_staff?: boolean) =>
  apiFetch(`/api/support-tickets/${ticketId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, is_staff }),
  });

export const updateTicketStatus = (ticketId: string, status: string) =>
  apiFetch(`/api/support-tickets/${ticketId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });

// ── Institutions ──────────────────────────────────────────────────────────────

export const getInstitutions = () => apiFetch("/api/institutions");

export const createInstitution = (payload: {
  name: string;
  logo_url?: string;
  plan?: string;
}) => apiFetch("/api/institutions", { method: "POST", body: JSON.stringify(payload) });

export const updateInstitution = (id: string, payload: Record<string, unknown>) =>
  apiFetch(`/api/institutions/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteInstitution = (id: string) =>
  apiFetch(`/api/institutions/${id}`, { method: "DELETE" });

// ── Server Health ─────────────────────────────────────────────────────────────

export interface ServiceHealthData {
  id: string;
  name: string;
  status: "Healthy" | "Degraded" | "Down";
  detail: string;
  region: string;
  latency: string;
  uptime: string;
  cpu: number;
  memory: number;
}

export const getServerHealth = () =>
  apiFetch<{ status: string; timestamp: string; services: ServiceHealthData[] }>("/api/health");

