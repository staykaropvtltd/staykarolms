// backend/tests/helpers/mockRedis.js
// Redis mock — all operations are no-ops or return null so tests don't
// require a Redis connection. Cache hit scenarios are tested by injecting
// specific return values via cacheHit().

let _store = {};

const mockRedis = {
  getClient: jest.fn().mockReturnValue(null),

  get: jest.fn().mockImplementation(async (key) => _store[key] ?? null),

  set: jest.fn().mockImplementation(async (key, value) => {
    _store[key] = value;
  }),

  del: jest.fn().mockImplementation(async (key) => {
    delete _store[key];
  }),

  ping: jest.fn().mockResolvedValue('PONG'),

  // Test utility: pre-populate cache so get() returns a specific value
  cacheHit(key, value) {
    _store[key] = typeof value === 'string' ? value : JSON.stringify(value);
  },

  // Test utility: clear all in-memory cache
  clearAll() {
    _store = {};
  },
};

module.exports = mockRedis;
