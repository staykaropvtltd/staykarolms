// backend/tests/examFlow.test.js
// Integration tests for the complete exam pipeline:
//   POST /api/attempts/start → POST /api/attempts/:id/answer → POST /api/attempts/:id/submit → GET /api/attempts/:id/result
//
// MCQ accuracy: verifies that the answer stored, retrieved, and scored is
// exactly the index selected by the student — no letter/text drift.
//
// All Supabase calls are mocked — no real DB connection required.

const request = require('supertest');

// ── Module mocks (must be before any require of the app) ──────
jest.mock('../lib/redis', () => require('./helpers/mockRedis'));
jest.mock('../lib/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/env', () => ({
  validateEnv: jest.fn(),
  startupGuard: (_req, _res, next) => next(),
}));

const { createMockSupabase, ok, err } = require('./helpers/mockSupabase');

// ── Fixtures ──────────────────────────────────────────────────
const STUDENT = { id: 'student-1', name: 'Alice', email: 'alice@test.com', role: 'student', institution_id: 'inst-1' };
const TEST    = { id: 'test-1', title: 'MCQ Test', type: 'aptitude', status: 'published', institution_id: 'inst-1', duration_mins: 30 };
const ATTEMPT = { id: 'attempt-1', test_id: 'test-1', student_id: 'student-1', status: 'in_progress', started_at: new Date().toISOString() };
// 4-option question where correct_answer is stored as a 0-based index string ("2" = option C)
const QUESTION_4OPT = {
  id: 'q-1', test_id: 'test-1', question: 'Which planet is largest?', type: 'mcq',
  options: ['Earth', 'Mars', 'Jupiter', 'Venus'],
  correct_answer: '2', // Jupiter (index 2, option C)
  marks: 2, order_index: 0,
};
const QUESTION = QUESTION_4OPT; // alias used by existing tests
const ANSWER  = { id: 'ans-1', attempt_id: 'attempt-1', question_id: 'q-1', answer: '2' };

function buildApp(supabaseMock) {
  jest.resetModules();
  jest.doMock('../lib/supabase', () => supabaseMock);
  jest.doMock('../lib/redis', () => require('./helpers/mockRedis'));
  jest.doMock('../lib/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
  jest.doMock('../lib/env', () => ({
    validateEnv: jest.fn(),
    startupGuard: (_req, _res, next) => next(),
  }));
  // eslint-disable-next-line global-require
  return require('../server');
}

// Helper: create a mock student JWT (the auth middleware reads SUPABASE_JWT_SECRET)
function studentAuthHeader() {
  const jwt = require('jsonwebtoken');
  const secret = process.env.SUPABASE_JWT_SECRET || 'test-secret';
  const token = jwt.sign({ sub: STUDENT.id }, secret, { expiresIn: '1h' });
  return `Bearer ${token}`;
}

// ── Tests ─────────────────────────────────────────────────────

describe('POST /api/attempts/start', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: 'test-secret' };
    require('./helpers/mockRedis').clearAll();
  });

  afterAll(() => { process.env = OLD_ENV; });

  test('201 — starts a new attempt for a published test', async () => {
    let testAttemptsCallCount = 0;
    const supa = { from: jest.fn() };
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'tests')    return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(TEST)) };
      if (table === 'test_attempts') {
        testAttemptsCallCount++;
        if (testAttemptsCallCount === 1) {
          // First call: check for existing in-progress attempt → none
          return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) };
        }
        // Second call: insert new attempt
        return { insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue(ok(ATTEMPT)) }) }) };
      }
      if (table === 'notifications') return { insert: jest.fn().mockReturnValue({ then: (r) => r({ error: null }) }) };
      return {};
    });

    const app = buildApp(supa);
    require('./helpers/mockRedis').cacheHit(`profile:${STUDENT.id}`, STUDENT);

    const res = await request(app)
      .post('/api/attempts/start')
      .set('Authorization', studentAuthHeader())
      .send({ test_id: TEST.id });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('attempt-1');
  });

  test('400 — missing test_id', async () => {
    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    const app  = buildApp(supa);
    require('./helpers/mockRedis').cacheHit(`profile:${STUDENT.id}`, STUDENT);

    const res = await request(app)
      .post('/api/attempts/start')
      .set('Authorization', studentAuthHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/test_id/i);
  });

  test('404 — test not found', async () => {
    const supa = createMockSupabase({ profiles: ok(STUDENT), tests: err('Not found') });
    const app  = buildApp(supa);
    require('./helpers/mockRedis').cacheHit(`profile:${STUDENT.id}`, STUDENT);

    const res = await request(app)
      .post('/api/attempts/start')
      .set('Authorization', studentAuthHeader())
      .send({ test_id: 'nonexistent' });

    expect(res.status).toBe(404);
  });

  test('403 — test is draft, not published', async () => {
    const draftTest = { ...TEST, status: 'draft' };
    const supa = createMockSupabase({ profiles: ok(STUDENT), tests: ok(draftTest) });
    // Need to suppress existing attempt check
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'tests')    return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(draftTest)) };
      if (table === 'test_attempts') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) };
      return {};
    });
    const app = buildApp(supa);
    require('./helpers/mockRedis').cacheHit(`profile:${STUDENT.id}`, STUDENT);

    const res = await request(app)
      .post('/api/attempts/start')
      .set('Authorization', studentAuthHeader())
      .send({ test_id: TEST.id });

    expect(res.status).toBe(403);
  });

  test('200 — returns existing in-progress attempt instead of creating new one', async () => {
    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'tests')    return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(TEST)) };
      if (table === 'test_attempts') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue(ok(ATTEMPT)),
      };
      return {};
    });
    const app = buildApp(supa);
    require('./helpers/mockRedis').cacheHit(`profile:${STUDENT.id}`, STUDENT);

    const res = await request(app)
      .post('/api/attempts/start')
      .set('Authorization', studentAuthHeader())
      .send({ test_id: TEST.id });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('attempt-1');
  });
});

describe('POST /api/attempts/:id/answer', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: 'test-secret' };
    require('./helpers/mockRedis').clearAll();
    require('./helpers/mockRedis').cacheHit(`profile:${STUDENT.id}`, STUDENT);
  });

  afterAll(() => { process.env = OLD_ENV; });

  test('200 — saves answer via upsert', async () => {
    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'test_attempts') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(ok(ATTEMPT)),
        // fire-and-forget last_answered_at update
        update: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ then: (r) => r({ error: null }) }) }),
      };
      if (table === 'test_answers') return {
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue(ok(ANSWER)),
          }),
        }),
      };
      return {};
    });
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/attempts/attempt-1/answer')
      .set('Authorization', studentAuthHeader())
      .send({ question_id: 'q-1', answer: '4' });

    expect(res.status).toBe(200);
  });

  test('400 — missing question_id', async () => {
    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    const app  = buildApp(supa);

    const res = await request(app)
      .post('/api/attempts/attempt-1/answer')
      .set('Authorization', studentAuthHeader())
      .send({ answer: '4' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/question_id/i);
  });

  test('400 — attempt already submitted', async () => {
    const submittedAttempt = { ...ATTEMPT, status: 'submitted' };
    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'test_attempts') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(submittedAttempt)) };
      return {};
    });
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/attempts/attempt-1/answer')
      .set('Authorization', studentAuthHeader())
      .send({ question_id: 'q-1', answer: '4' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not in progress/i);
  });
});

describe('POST /api/attempts/:id/submit', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: 'test-secret' };
    require('./helpers/mockRedis').clearAll();
    require('./helpers/mockRedis').cacheHit(`profile:${STUDENT.id}`, STUDENT);
  });

  afterAll(() => { process.env = OLD_ENV; });

  test('200 — submits and returns score', async () => {
    const gradedAnswer = { ...ANSWER, test_questions: { ...QUESTION, correct_answer: '4' } };
    const submittedAttempt = { ...ATTEMPT, status: 'submitted', score: 2, submitted_at: new Date().toISOString() };

    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'test_attempts') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn()
          .mockResolvedValueOnce(ok(ATTEMPT))          // fetch attempt
          .mockResolvedValueOnce(ok(submittedAttempt)), // after update
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue(ok(submittedAttempt)) }),
        }),
      };
      if (table === 'tests') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(TEST)) };
      if (table === 'test_answers') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve) => resolve(ok([gradedAnswer])),
        upsert: jest.fn().mockReturnValue({ then: (resolve) => resolve({ error: null }) }),
      };
      return {};
    });
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/attempts/attempt-1/submit')
      .set('Authorization', studentAuthHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(typeof res.body.data.score).toBe('number');
  });

  test('400 — attempt already submitted', async () => {
    const submittedAttempt = { ...ATTEMPT, status: 'submitted' };
    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'test_attempts') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(submittedAttempt)) };
      return {};
    });
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/attempts/attempt-1/submit')
      .set('Authorization', studentAuthHeader())
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/attempts/:id/result', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: 'test-secret' };
    require('./helpers/mockRedis').clearAll();
    require('./helpers/mockRedis').cacheHit(`profile:${STUDENT.id}`, STUDENT);
  });

  afterAll(() => { process.env = OLD_ENV; });

  test('200 — student can view own result', async () => {
    const result = { ...ATTEMPT, status: 'submitted', score: 4, tests: TEST, test_answers: [] };
    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'test_attempts') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(result)) };
      return {};
    });
    const app = buildApp(supa);

    const res = await request(app)
      .get('/api/attempts/attempt-1/result')
      .set('Authorization', studentAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(4);
  });

  test('403 — student cannot view another student\'s result', async () => {
    const otherStudentAttempt = { ...ATTEMPT, student_id: 'other-student-99' };
    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'test_attempts') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(otherStudentAttempt)) };
      return {};
    });
    const app = buildApp(supa);

    const res = await request(app)
      .get('/api/attempts/attempt-X/result')
      .set('Authorization', studentAuthHeader());

    expect(res.status).toBe(403);
  });
});

// ── MCQ Answer Accuracy ───────────────────────────────────────────────────────
//
// For each option index A(0) B(1) C(2) D(3):
//   1. POST /answer — verifies the request body carries the index string unchanged
//   2. POST /submit — verifies grading uses strict index string comparison
//   3. Correct-answer match → is_correct = true, marks awarded = q.marks
//   4. Wrong-answer → is_correct = false, marks awarded = 0
//   5. Returned score equals the expected total
//
// This catches any bug where the stored value, retrieved value, or graded value
// drifts from the index selected by the student (e.g. letter "b" vs "1", or
// the array being re-ordered between click and storage).

describe('MCQ answer accuracy — option A/B/C/D selection flow', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: 'test-secret' };
    require('./helpers/mockRedis').clearAll();
    require('./helpers/mockRedis').cacheHit(`profile:${STUDENT.id}`, STUDENT);
  });

  afterAll(() => { process.env = OLD_ENV; });

  // ── Helper: build a mock supabase that captures what the route tries to upsert ─
  function buildAnswerCaptureMock(capturedUpserts) {
    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'test_attempts') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(ok(ATTEMPT)),
        update: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ then: (r) => r({ error: null }) }) }),
      };
      if (table === 'test_answers') {
        return {
          upsert: jest.fn().mockImplementation((row) => {
            capturedUpserts.push(row);
            return { select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue(ok({ id: 'ans-1', ...row })) }) };
          }),
        };
      }
      return {};
    });
    return supa;
  }

  // ── Helper: build a mock for submit that returns graded results ─
  function buildSubmitMock(studentAnswerIdx, correctAnswerIdx, questionMarks) {
    const studentAnswer  = String(studentAnswerIdx);
    const isCorrect      = studentAnswer === String(correctAnswerIdx);
    const marksAwarded   = isCorrect ? questionMarks : 0;
    const gradedAnswer   = {
      id: 'ans-1', attempt_id: 'attempt-1', question_id: 'q-1',
      answer: studentAnswer,
      test_questions: { ...QUESTION_4OPT, correct_answer: String(correctAnswerIdx) },
    };
    const submittedAttempt = {
      ...ATTEMPT, status: 'submitted', score: marksAwarded,
      correct_count: isCorrect ? 1 : 0,
      wrong_count:   (!isCorrect && studentAnswer !== '') ? 1 : 0,
      answered_count: 1,
      submitted_at: new Date().toISOString(),
    };

    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'test_attempts') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn()
          .mockResolvedValueOnce(ok(ATTEMPT))
          .mockResolvedValueOnce(ok(submittedAttempt)),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue(ok(submittedAttempt)) }),
        }),
      };
      if (table === 'tests') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(TEST)) };
      if (table === 'test_answers') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve) => resolve(ok([gradedAnswer])),
        upsert: jest.fn().mockImplementation((rows) => {
          // Verify the grading logic matched what we expect
          const row = Array.isArray(rows) ? rows[0] : rows;
          expect(row.is_correct).toBe(isCorrect);
          expect(row.marks_awarded).toBe(marksAwarded);
          return { then: (r) => r({ error: null }) };
        }),
      };
      return {};
    });
    return { supa, submittedAttempt, isCorrect, marksAwarded };
  }

  // ── 1. Answer storage: each index is stored verbatim ─────────────────────────

  test.each([
    ['A', 0],
    ['B', 1],
    ['C', 2],
    ['D', 3],
  ])('POST /answer — option %s (index %i) is stored as the exact index string', async (letter, idx) => {
    const captured = [];
    const supa = buildAnswerCaptureMock(captured);
    const app  = buildApp(supa);

    const res = await request(app)
      .post('/api/attempts/attempt-1/answer')
      .set('Authorization', studentAuthHeader())
      .send({ question_id: 'q-1', answer: String(idx) });

    expect(res.status).toBe(200);
    // The body sent to the DB must be the same index string the student selected
    expect(captured.length).toBe(1);
    expect(captured[0].answer).toBe(String(idx));
    expect(captured[0].question_id).toBe('q-1');
  });

  // ── 2. Grading: correct option scores full marks, all others score 0 ──────────

  test.each([
    ['A', 0, false],  // correct is index 2; selecting 0 → wrong
    ['B', 1, false],
    ['C', 2, true],   // correct option → correct
    ['D', 3, false],
  ])('POST /submit — option %s (index %i) grades as correct=%s', async (letter, idx, expectCorrect) => {
    const correctIdx  = 2; // Jupiter, as per QUESTION_4OPT
    const { supa, submittedAttempt, isCorrect, marksAwarded } = buildSubmitMock(idx, correctIdx, QUESTION_4OPT.marks);
    expect(isCorrect).toBe(expectCorrect);

    const app = buildApp(supa);
    const res = await request(app)
      .post('/api/attempts/attempt-1/submit')
      .set('Authorization', studentAuthHeader())
      .send({});

    expect(res.status).toBe(200);
    const returnedScore = res.body.data?.score ?? res.body.data?.score;
    expect(typeof returnedScore).toBe('number');
    // Score must equal marksAwarded (full marks if correct, 0 otherwise)
    expect(returnedScore).toBe(marksAwarded);
  });

  // ── 3. Score integrity: total score matches sum of awarded marks ───────────────

  test('POST /submit — returned score equals sum of marks for all correct answers', async () => {
    // Two questions: student answers both correctly
    const q2 = { ...QUESTION_4OPT, id: 'q-2', correct_answer: '1', marks: 3, order_index: 1 };
    const ans1 = { id: 'ans-1', attempt_id: 'attempt-1', question_id: 'q-1', answer: '2', test_questions: QUESTION_4OPT };
    const ans2 = { id: 'ans-2', attempt_id: 'attempt-1', question_id: 'q-2', answer: '1', test_questions: q2 };
    const expectedScore = QUESTION_4OPT.marks + q2.marks; // 2 + 3 = 5

    const submittedAttempt = {
      ...ATTEMPT, status: 'submitted', score: expectedScore,
      correct_count: 2, wrong_count: 0, answered_count: 2,
      submitted_at: new Date().toISOString(),
    };

    const supa = createMockSupabase({ profiles: ok(STUDENT) });
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT)) };
      if (table === 'test_attempts') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn()
          .mockResolvedValueOnce(ok(ATTEMPT))
          .mockResolvedValueOnce(ok(submittedAttempt)),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue(ok(submittedAttempt)) }),
        }),
      };
      if (table === 'tests') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(TEST)) };
      if (table === 'test_answers') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve) => resolve(ok([ans1, ans2])),
        upsert: jest.fn().mockImplementation((rows) => {
          const total = rows.reduce((s, r) => s + (r.marks_awarded || 0), 0);
          expect(total).toBe(expectedScore);
          return { then: (r) => r({ error: null }) };
        }),
      };
      return {};
    });

    const app = buildApp(supa);
    const res = await request(app)
      .post('/api/attempts/attempt-1/submit')
      .set('Authorization', studentAuthHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(expectedScore);
  });
});
