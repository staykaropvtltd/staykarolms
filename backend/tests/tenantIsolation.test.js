// backend/tests/tenantIsolation.test.js
// Tests that verify tenant (institution) isolation — users from institution A
// cannot read, write, or start exams that belong to institution B.

const request = require('supertest');
const jwt     = require('jsonwebtoken');

jest.mock('../lib/redis', () => require('./helpers/mockRedis'));
jest.mock('../lib/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/env',   () => ({
  validateEnv: jest.fn(),
  startupGuard: (_req, _res, next) => next(),
}));

const mockRedis = require('./helpers/mockRedis');
const { ok } = require('./helpers/mockSupabase');

const JWT_SECRET = 'test-secret';

// Institution A users
const STUDENT_A = { id: 'sa', name: 'Student A', email: 'sa@a.com', role: 'student',  institution_id: 'inst-A' };
const ADMIN_A   = { id: 'aa', name: 'Admin A',   email: 'aa@a.com', role: 'admin',    institution_id: 'inst-A' };

// Institution B resources
const TEST_B    = { id: 'tb', title: 'B Exam', type: 'aptitude', status: 'published', institution_id: 'inst-B', duration_mins: 30 };
const ATTEMPT_B = { id: 'atb', test_id: 'tb', student_id: 'sb', status: 'submitted', score: 5 };

function authFor(user) {
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '1h' });
  return `Bearer ${token}`;
}

function buildApp(supabaseMock) {
  jest.resetModules();
  jest.doMock('../lib/supabase', () => supabaseMock);
  jest.doMock('../lib/redis', () => require('./helpers/mockRedis'));
  jest.doMock('../lib/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
  jest.doMock('../lib/env',   () => ({
    validateEnv: jest.fn(),
    startupGuard: (_req, _res, next) => next(),
  }));
  // eslint-disable-next-line global-require
  return require('../server');
}

describe('Tenant isolation — tests route', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: JWT_SECRET };
    mockRedis.clearAll();
  });

  afterAll(() => { process.env = OLD_ENV; });

  test('student from inst-A cannot start exam from inst-B', async () => {
    const supa = { from: jest.fn() };
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT_A)) };
      if (table === 'tests') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(TEST_B)) };
      if (table === 'test_attempts') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) };
      return {};
    });

    const app = buildApp(supa);
    mockRedis.cacheHit(`profile:${STUDENT_A.id}`, STUDENT_A);

    const res = await request(app)
      .post('/api/attempts/start')
      .set('Authorization', authFor(STUDENT_A))
      .send({ test_id: 'tb' });

    // The route checks institution_id match and returns 404 for cross-tenant access
    expect(res.status).toBe(404);
  });

  test('student from inst-A cannot view result belonging to inst-B student', async () => {
    const supa = { from: jest.fn() };
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT_A)) };
      if (table === 'test_attempts') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(ATTEMPT_B)) };
      return {};
    });

    const app = buildApp(supa);
    mockRedis.cacheHit(`profile:${STUDENT_A.id}`, STUDENT_A);

    const res = await request(app)
      .get('/api/attempts/atb/result')
      .set('Authorization', authFor(STUDENT_A));

    expect(res.status).toBe(403);
  });

  test('student cannot see draft test even within own institution', async () => {
    const draftTestA = { ...TEST_B, institution_id: 'inst-A', status: 'draft' };
    const supa = { from: jest.fn() };
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT_A)) };
      if (table === 'tests') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(draftTestA)) };
      if (table === 'test_attempts') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) };
      return {};
    });

    const app = buildApp(supa);
    mockRedis.cacheHit(`profile:${STUDENT_A.id}`, STUDENT_A);

    const res = await request(app)
      .post('/api/attempts/start')
      .set('Authorization', authFor(STUDENT_A))
      .send({ test_id: draftTestA.id });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not available/i);
  });

  test('unauthenticated request → 401 on every protected route', async () => {
    const supa = { from: jest.fn().mockReturnValue({}) };
    const app  = buildApp(supa);

    const [r1, r2, r3] = await Promise.all([
      request(app).post('/api/attempts/start').send({ test_id: 'x' }),
      request(app).get('/api/tests'),
      request(app).get('/api/attempts/x/result'),
    ]);

    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r3.status).toBe(401);
  });
});

describe('RBAC — role enforcement on admin routes', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: JWT_SECRET };
    mockRedis.clearAll();
    mockRedis.cacheHit(`profile:${STUDENT_A.id}`, STUDENT_A);
  });

  afterAll(() => { process.env = OLD_ENV; });

  test('student cannot create a test', async () => {
    const supa = { from: jest.fn() };
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT_A)) };
      return {};
    });
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests')
      .set('Authorization', authFor(STUDENT_A))
      .send({ title: 'Hack Exam', type: 'aptitude', duration_mins: 30 });

    expect(res.status).toBe(403);
  });

  test('student cannot publish a test', async () => {
    const supa = { from: jest.fn() };
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(STUDENT_A)) };
      return {};
    });
    const app = buildApp(supa);

    const res = await request(app)
      .put('/api/tests/some-test/publish')
      .set('Authorization', authFor(STUDENT_A));

    expect(res.status).toBe(403);
  });

  test('admin can create a test within own institution', async () => {
    const createdTest = { id: 'new-t', title: 'Admin Exam', type: 'aptitude', status: 'draft', institution_id: 'inst-A', duration_mins: 30, created_by: ADMIN_A.id };
    const supa = { from: jest.fn() };
    supa.from.mockImplementation((table) => {
      if (table === 'profiles') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(ADMIN_A)) };
      if (table === 'tests') return {
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue(ok(createdTest)) }),
        }),
      };
      if (table === 'notifications') return { insert: jest.fn().mockReturnValue({ then: (r) => r({ error: null }) }) };
      if (table === 'calendar_events') return { insert: jest.fn().mockReturnValue({ then: (r) => r({ error: null }) }) };
      return {};
    });
    mockRedis.cacheHit(`profile:${ADMIN_A.id}`, ADMIN_A);
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests')
      .set('Authorization', authFor(ADMIN_A))
      .send({ title: 'Admin Exam', type: 'aptitude', duration_mins: 30 });

    expect(res.status).toBe(201);
    expect(res.body.data.institution_id).toBe('inst-A');
  });
});
