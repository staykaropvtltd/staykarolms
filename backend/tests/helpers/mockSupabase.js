// backend/tests/helpers/mockSupabase.js
// Chainable Supabase mock for unit tests.
//
// Usage in a test file:
//   const { createMockSupabase, ok, err } = require('./helpers/mockSupabase');
//   jest.mock('../../lib/supabase', () => createMockSupabase({
//     profiles: ok({ id: 'u1', role: 'student', institution_id: 'i1' }),
//     tests:    ok({ id: 't1', status: 'published', institution_id: 'i1' }),
//   }));

/**
 * Shorthand for a successful Supabase response.
 */
function ok(data) {
  return { data, error: null };
}

/**
 * Shorthand for a Supabase error response.
 */
function err(message, code = 'PGRST200') {
  return { data: null, error: { message, code } };
}

/**
 * Creates a chainable Supabase mock client.
 * tableResponses maps table name → default { data, error } for all operations.
 * Individual operations can be overridden by mutating the returned client.
 */
function createMockSupabase(tableResponses = {}) {
  const defaultResponse = { data: null, error: null };

  function makeChain(tableName) {
    let _response = tableResponses[tableName] ?? defaultResponse;
    let _insertResponse = tableResponses[`${tableName}:insert`] ?? _response;
    let _updateResponse = tableResponses[`${tableName}:update`] ?? _response;
    let _upsertResponse = tableResponses[`${tableName}:upsert`] ?? _response;
    let _deleteResponse = tableResponses[`${tableName}:delete`] ?? { data: null, error: null };

    // Most terminal methods resolve to the table's default response
    const chain = {
      select:      jest.fn().mockReturnThis(),
      eq:          jest.fn().mockReturnThis(),
      neq:         jest.fn().mockReturnThis(),
      in:          jest.fn().mockReturnThis(),
      not:         jest.fn().mockReturnThis(),
      is:          jest.fn().mockReturnThis(),
      limit:       jest.fn().mockReturnThis(),
      order:       jest.fn().mockReturnThis(),
      filter:      jest.fn().mockReturnThis(),
      textSearch:  jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue(_response),
      single:      jest.fn().mockResolvedValue(_response),
      // Array-returning terminal (no .single())
      then:        (resolve) => Promise.resolve(_response).then(resolve),
    };

    // insert/update/upsert/delete start a sub-chain that resolves differently
    chain.insert = jest.fn().mockReturnValue({
      ...chain,
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue(_insertResponse),
      }),
      single: jest.fn().mockResolvedValue(_insertResponse),
      then: (resolve) => Promise.resolve(_insertResponse).then(resolve),
    });

    chain.update = jest.fn().mockReturnValue({
      ...chain,
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue(_updateResponse),
      }),
      single: jest.fn().mockResolvedValue(_updateResponse),
      then: (resolve) => Promise.resolve(_updateResponse).then(resolve),
    });

    chain.upsert = jest.fn().mockReturnValue({
      ...chain,
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue(_upsertResponse),
      }),
      single: jest.fn().mockResolvedValue(_upsertResponse),
      then: (resolve) => Promise.resolve(_upsertResponse).then(resolve),
    });

    chain.delete = jest.fn().mockReturnValue({
      ...chain,
      eq: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(_deleteResponse).then(resolve),
    });

    return chain;
  }

  const fromMock = jest.fn((tableName) => makeChain(tableName));

  return {
    from: fromMock,
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue(
        tableResponses['auth:login'] ?? {
          data: {
            session: { access_token: 'mock-token-xxx' },
            user: { id: 'u1', email: 'test@test.com' },
          },
          error: null,
        }
      ),
      getUser: jest.fn().mockResolvedValue(
        tableResponses['auth:getUser'] ?? { data: { user: { id: 'u1' } }, error: null }
      ),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    storage: {
      listBuckets: jest.fn().mockResolvedValue({ data: [], error: null }),
    },
  };
}

module.exports = { createMockSupabase, ok, err };
