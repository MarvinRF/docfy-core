import { describe, it, expect } from 'vitest';
import { lintSpec } from './lint-spec';
import type { DocumentModel, Endpoint } from './types';

function endpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    method: 'GET',
    path: '/users',
    operationId: undefined,
    summary: 'List users',
    description: 'Lists all users.',
    tags: ['Users'],
    parameters: [],
    requestBody: undefined,
    responses: [
      { status: '200', description: 'OK', contentType: 'application/json', schema: undefined },
      { status: '404', description: 'Not Found', contentType: undefined, schema: undefined },
    ],
    security: [],
    ...overrides,
  };
}

function document(tagGroups: DocumentModel['tagGroups']): DocumentModel {
  return {
    info: { title: 'Demo', version: '1.0.0', description: undefined },
    tagGroups,
    securitySchemes: {},
    servers: [],
  };
}

describe('lintSpec()', () => {
  it('returns no issues for a fully-documented endpoint', () => {
    const doc = document([{ name: 'Users', description: undefined, endpoints: [endpoint()] }]);
    expect(lintSpec(doc)).toEqual([]);
  });

  it('flags a missing summary', () => {
    const doc = document([{ name: 'Users', description: undefined, endpoints: [endpoint({ summary: undefined })] }]);
    expect(lintSpec(doc)).toContainEqual({
      method: 'GET',
      path: '/users',
      rule: 'missing-summary',
      message: 'no summary declared',
    });
  });

  it('flags a missing description', () => {
    const doc = document([
      { name: 'Users', description: undefined, endpoints: [endpoint({ description: undefined })] },
    ]);
    expect(lintSpec(doc)).toContainEqual({
      method: 'GET',
      path: '/users',
      rule: 'missing-description',
      message: 'no description declared',
    });
  });

  it('flags an endpoint with no tags', () => {
    const doc = document([{ name: 'Default', description: undefined, endpoints: [endpoint({ tags: [] })] }]);
    expect(lintSpec(doc)).toContainEqual({
      method: 'GET',
      path: '/users',
      rule: 'missing-tags',
      message: 'no tags declared (falls into the "Default" group)',
    });
  });

  it('flags an endpoint whose only tag is the synthetic "Default" (normalizeDocument()\'s actual untagged signal)', () => {
    const doc = document([{ name: 'Default', description: undefined, endpoints: [endpoint({ tags: ['Default'] })] }]);
    expect(lintSpec(doc)).toContainEqual({
      method: 'GET',
      path: '/users',
      rule: 'missing-tags',
      message: 'no tags declared (falls into the "Default" group)',
    });
  });

  it('does not flag an endpoint genuinely tagged "Default" alongside another real tag', () => {
    const doc = document([
      { name: 'Default', description: undefined, endpoints: [endpoint({ tags: ['Default', 'Users'] })] },
    ]);
    expect(lintSpec(doc).some((i) => i.rule === 'missing-tags')).toBe(false);
  });

  it('flags an endpoint with no 4xx/5xx response declared', () => {
    const doc = document([
      {
        name: 'Users',
        description: undefined,
        endpoints: [
          endpoint({ responses: [{ status: '200', description: 'OK', contentType: undefined, schema: undefined }] }),
        ],
      },
    ]);
    expect(lintSpec(doc)).toContainEqual({
      method: 'GET',
      path: '/users',
      rule: 'no-error-response',
      message: 'no 4xx/5xx response declared',
    });
  });

  it('flags a response with no description', () => {
    const doc = document([
      {
        name: 'Users',
        description: undefined,
        endpoints: [
          endpoint({
            responses: [
              { status: '200', description: '', contentType: undefined, schema: undefined },
              { status: '404', description: 'Not Found', contentType: undefined, schema: undefined },
            ],
          }),
        ],
      },
    ]);
    expect(lintSpec(doc)).toContainEqual({
      method: 'GET',
      path: '/users',
      rule: 'missing-response-description',
      message: 'response 200 has no description',
    });
  });

  it('flags a duplicate operationId across two different endpoints', () => {
    const doc = document([
      {
        name: 'Users',
        description: undefined,
        endpoints: [
          endpoint({ path: '/users', operationId: 'listUsers' }),
          endpoint({ path: '/users/{id}', operationId: 'listUsers' }),
        ],
      },
    ]);
    expect(lintSpec(doc)).toContainEqual({
      method: 'GET',
      path: '/users/{id}',
      rule: 'duplicate-operation-id',
      message: 'operationId "listUsers" is also used by GET /users',
    });
  });

  it('does not flag two endpoints that both omit operationId', () => {
    const doc = document([
      {
        name: 'Users',
        description: undefined,
        endpoints: [
          endpoint({ path: '/users', operationId: undefined }),
          endpoint({ path: '/orders', operationId: undefined }),
        ],
      },
    ]);
    expect(lintSpec(doc).some((i) => i.rule === 'duplicate-operation-id')).toBe(false);
  });

  it('deduplicates an endpoint declared under multiple tags (via uniqueEndpoints)', () => {
    const shared = endpoint();
    const doc = document([
      { name: 'Users', description: undefined, endpoints: [shared] },
      { name: 'Admin', description: undefined, endpoints: [shared] },
    ]);
    expect(lintSpec(doc)).toEqual([]);
  });
});
