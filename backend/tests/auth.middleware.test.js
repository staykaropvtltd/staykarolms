// backend/tests/auth.middleware.test.js
// Unit tests for backend/middleware/auth.js
// No real Supabase or Redis connections — all external calls are mocked.

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

// ── Mocks ─────────────────────────────────────────────────────
const mockRedis = require('./helpers/mockRedis');
jest.mock('../lib/redis', () => mockRedis);

// Mirrors tokenCacheKey() in middleware/auth.js — the middleware caches by
// SHA-256(token), not by user id, so a Redis hit can skip JWT verification too.
function tokenCacheKey(token) {
  return 'auth:' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 40);
}

const { createMockSupabase, ok, err } = require('./helpers/mockSupabase');

const STUDENT_PROFILE = { id: 'u-student', name: 'Student', email: 'student@test.com', role: 'student', institution_id: 'inst-1' };
const ADMIN_PROFILE   = { id: 'u-admin',   name: 'Admin',   email: 'admin@test.com',   role: 'admin',   institution_id: 'inst-1' };
const JWT_SECRET = 'test-jwt-secret-for-tests-only';

function makeToken(sub, secret = JWT_SECRET) {
  return jwt.sign({ sub, role: 'authenticated' }, secret, { expiresIn: '1h' });
}

function mockReq(token) {
  return { headers: { authorization: token ? `Bearer ${token}` : undefined } };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── Test factory: fresh authenticate fn with controlled supabase mock ─
function buildAuthMiddleware(supabaseMock) {
  jest.resetModules();
  jest.doMock('../lib/supabase', () => supabaseMock);
  jest.doMock('../lib/redis', () => mockRedis);
  // eslint-disable-next-line global-require
  return require('../middleware/auth');
}

// ── Tests ─────────────────────────────────────────────────────

describe('auth middleware', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: JWT_SECRET };
    mockRedis.clearAll();
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('missing Authorization header → 401', async () => {
    const authenticate = buildAuthMiddleware(createMockSupabase());
    const req  = mockReq(null);
    const res  = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('invalid JWT → 401', async () => {
    const authenticate = buildAuthMiddleware(createMockSupabase());
    const req  = mockReq('not-a-valid-jwt');
    const res  = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('JWT signed with wrong secret → 401', async () => {
    const authenticate = buildAuthMiddleware(createMockSupabase());
    const token = makeToken('u-student', 'wrong-secret');
    const req   = mockReq(token);
    const res   = mockRes();
    const next  = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('valid JWT + DB profile found → req.user populated, next() called', async () => {
    const mockSupa = createMockSupabase({ profiles: ok(STUDENT_PROFILE) });
    const authenticate = buildAuthMiddleware(mockSupa);

    const token = makeToken('u-student');
    const req   = mockReq(token);
    const res   = mockRes();
    const next  = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 'u-student', role: 'student' });
  });

  test('valid JWT but profile not found → 401', async () => {
    const mockSupa = createMockSupabase({ profiles: err('Row not found') });
    const authenticate = buildAuthMiddleware(mockSupa);

    const token = makeToken('u-ghost');
    const req   = mockReq(token);
    const res   = mockRes();
    const next  = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('Redis cache hit → next() without DB call', async () => {
    const mockSupa = createMockSupabase(); // no profiles entry — DB would return null
    const authenticate = buildAuthMiddleware(mockSupa);

    const token = makeToken('u-student');

    // Pre-populate Redis cache under the key the middleware will look up
    mockRedis.cacheHit(tokenCacheKey(token), STUDENT_PROFILE);

    const req   = mockReq(token);
    const res   = mockRes();
    const next  = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ role: 'student' });
    // DB should NOT have been called since Redis had the profile
    expect(mockSupa.from).not.toHaveBeenCalled();
  });

  test('in-process cache hit (second request) → next() without Redis or DB', async () => {
    const mockSupa = createMockSupabase({ profiles: ok(ADMIN_PROFILE) });
    const authenticate = buildAuthMiddleware(mockSupa);

    const token = makeToken('u-admin');
    const req1  = mockReq(token);
    const req2  = mockReq(token);
    const res   = mockRes();
    const next  = jest.fn();

    // First request — hits DB, populates both caches
    await authenticate(req1, res, next);
    expect(mockSupa.from).toHaveBeenCalledTimes(1);

    // Second request — should hit in-process cache, zero external calls
    jest.clearAllMocks();
    await authenticate(req2, res, next);
    expect(mockSupa.from).not.toHaveBeenCalled();
    expect(mockRedis.get).not.toHaveBeenCalled();
  });
});
