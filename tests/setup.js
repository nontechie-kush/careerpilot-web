/**
 * Global test setup — mocks for Supabase, Next.js, and common utilities.
 *
 * Tests use a mock Supabase client that tracks all queries in-memory.
 * No real DB calls are made — we test logic, not Supabase SDK behavior.
 */

import { vi } from 'vitest';

// ── Mock Supabase query builder ──────────────────────────────────────────────

/**
 * Creates a chainable mock that records all method calls.
 * Call mockSupabase.reset() between tests to clear state.
 * Call mockSupabase.setResponse(table, data, error) to control what queries return.
 */

const mockResponses = {};
const mockInserts = [];
const mockUpdates = [];

function createChain(tableName, operation) {
  const chain = {
    _table: tableName,
    _operation: operation,
    _filters: {},
    _selectFields: '*',

    select(fields, opts) {
      chain._selectFields = fields;
      if (opts?.count) chain._countMode = true;
      if (opts?.head) chain._headMode = true;
      return chain;
    },
    insert(data) {
      const rows = Array.isArray(data) ? data : [data];
      mockInserts.push(...rows.map(r => ({ _table: tableName, ...r })));
      return chain;
    },
    update(data) {
      chain._updateData = data;
      return chain;
    },
    upsert(data) {
      chain._upsertData = data;
      return chain;
    },
    delete() {
      chain._operation = 'delete';
      return chain;
    },
    eq(col, val) { chain._filters[`eq_${col}`] = val; return chain; },
    neq(col, val) { chain._filters[`neq_${col}`] = val; return chain; },
    in(col, vals) { chain._filters[`in_${col}`] = vals; return chain; },
    gt(col, val) { chain._filters[`gt_${col}`] = val; return chain; },
    gte(col, val) { chain._filters[`gte_${col}`] = val; return chain; },
    lt(col, val) { chain._filters[`lt_${col}`] = val; return chain; },
    lte(col, val) { chain._filters[`lte_${col}`] = val; return chain; },
    like(col, val) { chain._filters[`like_${col}`] = val; return chain; },
    ilike(col, val) { chain._filters[`ilike_${col}`] = val; return chain; },
    order(col, opts) { chain._orderBy = { col, ...opts }; return chain; },
    limit(n) { chain._limit = n; return chain; },
    single() { chain._single = true; return chain.then(r => r); },
    maybeSingle() { chain._maybeSingle = true; return chain.then(r => r); },

    then(resolve, reject) {
      const key = tableName;
      const response = mockResponses[key] || { data: [], error: null };

      // Track updates for assertions
      if (chain._updateData) {
        mockUpdates.push({
          _table: tableName,
          _data: chain._updateData,
          _filters: { ...chain._filters },
        });
      }

      let result = { ...response };

      if (chain._single || chain._maybeSingle) {
        result.data = Array.isArray(result.data) ? result.data[0] || null : result.data;
      }
      if (chain._countMode) {
        result.count = Array.isArray(response.data) ? response.data.length : 0;
      }
      if (chain._headMode) {
        result.data = null;
      }

      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return chain;
}

export const mockSupabase = {
  from(table) {
    return createChain(table, 'query');
  },
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id', email: 'test@example.com' } } }),
    getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
  },

  // Test helpers
  setResponse(table, data, error = null) {
    mockResponses[table] = { data, error };
  },
  getInserts(table) {
    return table ? mockInserts.filter(r => r._table === table) : mockInserts;
  },
  getUpdates(table) {
    return table ? mockUpdates.filter(r => r._table === table) : mockUpdates;
  },
  reset() {
    Object.keys(mockResponses).forEach(k => delete mockResponses[k]);
    mockInserts.length = 0;
    mockUpdates.length = 0;
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    });
  },
};

// ── Mock @/lib/supabase/server ───────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
  createClientFromRequest: vi.fn().mockResolvedValue(mockSupabase),
  createServiceClient: vi.fn(() => mockSupabase),
}));

// ── Mock @/lib/supabase/get-auth-user ────────────────────────────────────────

vi.mock('@/lib/supabase/get-auth-user', () => ({
  getAuthUser: vi.fn().mockResolvedValue({ id: 'test-user-id', email: 'test@example.com' }),
}));

// ── Mock next/server ─────────────────────────────────────────────────────────

vi.mock('next/server', () => ({
  NextResponse: {
    json(body, init) {
      return { body, status: init?.status || 200, headers: new Map() };
    },
  },
}));

// ── Mock Gmail ───────────────────────────────────────────────────────────────

vi.mock('@/lib/gmail/client', () => ({
  refreshAccessToken: vi.fn().mockResolvedValue({ access_token: 'new-token', expires_in: 3600 }),
  getOAuthUrl: vi.fn(),
}));

vi.mock('@/lib/gmail/send', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'gmail-msg-123', threadId: 'thread-456' }),
}));

// ── Helper: create a mock Request ────────────────────────────────────────────

export function mockRequest(body = {}) {
  const headers = new Map([['authorization', 'Bearer test-token']]);
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: {
      get(name) { return headers.get(name.toLowerCase()) || null; },
      has(name) { return headers.has(name.toLowerCase()); },
      entries() { return headers.entries(); },
    },
  };
}
