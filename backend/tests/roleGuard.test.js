// backend/tests/roleGuard.test.js

const { requireRole } = require('../middleware/roleGuard');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireRole middleware', () => {
  test('correct role → next() called', () => {
    const guard = requireRole('admin', 'super-admin');
    const req   = { user: { role: 'admin' } };
    const res   = mockRes();
    const next  = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('wrong role → 403', () => {
    const guard = requireRole('admin');
    const req   = { user: { role: 'student' } };
    const res   = mockRes();
    const next  = jest.fn();

    guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('no user on request → 401', () => {
    const guard = requireRole('admin');
    const req   = {};
    const res   = mockRes();
    const next  = jest.fn();

    guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('super-admin accepted when only admin is listed → false (RBAC is strict)', () => {
    const guard = requireRole('admin');
    const req   = { user: { role: 'super-admin' } };
    const res   = mockRes();
    const next  = jest.fn();

    guard(req, res, next);

    // super-admin is NOT automatically included unless listed explicitly
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('student guard allows student', () => {
    const guard = requireRole('student');
    const req   = { user: { role: 'student' } };
    const res   = mockRes();
    const next  = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('error detail lists allowed roles', () => {
    const guard = requireRole('admin', 'faculty');
    const req   = { user: { role: 'student' } };
    const res   = mockRes();
    const next  = jest.fn();

    guard(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.detail).toContain('admin');
    expect(body.detail).toContain('faculty');
    expect(body.detail).toContain('student');
  });
});
