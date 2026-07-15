// backend/tests/examFlow.test.js
// Integration tests for the complete exam pipeline:
//   POST /api/attempts/start → POST /api/attempts/:id/answer → POST /api/attempts/:id/submit → GET /api/attempts/:id/result
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
const QUESTION = { id: 'q-1', test_id: 'test-1', question: 'What is 2+2?', type: 'mcq', options: ['3','4','5'], correct_answer: '4', marks: 2 };
const ANSWER  = { id: 'ans-1', attempt_id: 'attempt-1', question_id: 'q-1', answer: '4' };

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
      if (table === 'test_attempts') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(ATTEMPT)) };
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
