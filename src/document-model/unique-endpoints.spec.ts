import { describe, it, expect } from 'vitest';
import { uniqueEndpoints } from './unique-endpoints';
import type { DocumentModel, Endpoint } from './types';

function endpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    method: 'GET',
    path: '/users',
    operationId: undefined,
    summary: undefined,
    description: undefined,
    tags: [],
    parameters: [],
    requestBody: undefined,
    responses: [],
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

describe('uniqueEndpoints()', () => {
  it('flattens endpoints across tag groups', () => {
    const doc = document([
      { name: 'Users', description: undefined, endpoints: [endpoint({ path: '/users' })] },
      { name: 'Orders', description: undefined, endpoints: [endpoint({ path: '/orders' })] },
    ]);
    expect(uniqueEndpoints(doc).map((e) => e.path)).toEqual(['/users', '/orders']);
  });

  it('deduplicates an endpoint that appears in multiple tag groups (multi-tag operation)', () => {
    const shared = endpoint({ path: '/users', operationId: 'listUsers' });
    const doc = document([
      { name: 'Users', description: undefined, endpoints: [shared] },
      { name: 'Admin', description: undefined, endpoints: [shared] },
    ]);
    expect(uniqueEndpoints(doc)).toHaveLength(1);
  });

  it('keeps two endpoints with the same path but different methods distinct', () => {
    const doc = document([
      {
        name: 'Users',
        description: undefined,
        endpoints: [endpoint({ path: '/users', method: 'GET' }), endpoint({ path: '/users', method: 'POST' })],
      },
    ]);
    expect(uniqueEndpoints(doc)).toHaveLength(2);
  });
});
