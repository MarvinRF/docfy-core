import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeDocument } from './normalize.js';
import { diffDocuments } from './diff.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture30 = path.join(__dirname, '..', '__tests__', 'fixtures', 'spec-3.0.json');
const fixture31 = path.join(__dirname, '..', '__tests__', 'fixtures', 'spec-3.1.json');

function spec(paths: Record<string, unknown>) {
  return { openapi: '3.0.3', info: { title: 'Test', version: '1.0.0' }, paths };
}

const baseGetUsers = {
  get: {
    operationId: 'findAllUsers',
    tags: ['users'],
    responses: { '200': { description: 'OK' }, '404': { description: 'Not Found' } },
  },
};

async function models(oldPaths: Record<string, unknown>, newPaths: Record<string, unknown>) {
  const oldModel = await normalizeDocument(spec(oldPaths));
  const newModel = await normalizeDocument(spec(newPaths));
  return { oldModel, newModel };
}

describe('diffDocuments()', () => {
  it('reports no changes for identical specs', async () => {
    const { oldModel, newModel } = await models({ '/users': baseGetUsers }, { '/users': baseGetUsers });
    const diff = diffDocuments(oldModel, newModel);
    expect(diff).toEqual({ added: [], removed: [], changed: [] });
  });

  it('reports a removed endpoint', async () => {
    const { oldModel, newModel } = await models({ '/users': baseGetUsers }, {});
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]).toMatchObject({ method: 'GET', path: '/users' });
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('reports an added endpoint', async () => {
    const { oldModel, newModel } = await models({}, { '/users': baseGetUsers });
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]).toMatchObject({ method: 'GET', path: '/users' });
  });

  it('does not duplicate an endpoint that appears under multiple tags', async () => {
    const multiTag = { get: { ...baseGetUsers.get, tags: ['users', 'admin'] } };
    const { oldModel, newModel } = await models({}, { '/users': multiTag });
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.added).toHaveLength(1);
  });

  it('flags a new required parameter as breaking', async () => {
    const withParam = {
      get: {
        ...baseGetUsers.get,
        parameters: [{ name: 'role', in: 'query', required: true, schema: { type: 'string' } }],
      },
    };
    const { oldModel, newModel } = await models({ '/users': baseGetUsers }, { '/users': withParam });
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].changes).toContainEqual({
      description: 'new required parameter "role" (query)',
      severity: 'breaking',
    });
  });

  it('flags a new optional parameter as info', async () => {
    const withParam = {
      get: {
        ...baseGetUsers.get,
        parameters: [{ name: 'role', in: 'query', required: false, schema: { type: 'string' } }],
      },
    };
    const { oldModel, newModel } = await models({ '/users': baseGetUsers }, { '/users': withParam });
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.changed[0].changes).toContainEqual({
      description: 'new optional parameter "role" (query)',
      severity: 'info',
    });
  });

  it('flags an existing parameter becoming required as breaking', async () => {
    const optional = {
      get: {
        ...baseGetUsers.get,
        parameters: [{ name: 'role', in: 'query', required: false, schema: { type: 'string' } }],
      },
    };
    const required = {
      get: {
        ...baseGetUsers.get,
        parameters: [{ name: 'role', in: 'query', required: true, schema: { type: 'string' } }],
      },
    };
    const { oldModel, newModel } = await models({ '/users': optional }, { '/users': required });
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.changed[0].changes).toContainEqual({
      description: 'parameter "role" (query) is now required',
      severity: 'breaking',
    });
  });

  it('flags a removed parameter as info', async () => {
    const withParam = {
      get: {
        ...baseGetUsers.get,
        parameters: [{ name: 'role', in: 'query', required: false, schema: { type: 'string' } }],
      },
    };
    const { oldModel, newModel } = await models({ '/users': withParam }, { '/users': baseGetUsers });
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.changed[0].changes).toContainEqual({
      description: 'parameter "role" (query) was removed',
      severity: 'info',
    });
  });

  it('flags a request body becoming required as breaking', async () => {
    const noBody = {
      post: { operationId: 'createUser', tags: ['users'], responses: { '201': { description: 'Created' } } },
    };
    const requiredBody = {
      post: {
        operationId: 'createUser',
        tags: ['users'],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Created' } },
      },
    };
    const { oldModel, newModel } = await models({ '/users': noBody }, { '/users': requiredBody });
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.changed[0].changes).toContainEqual({
      description: 'request body is now required',
      severity: 'breaking',
    });
  });

  it('flags a removed 2xx response as breaking', async () => {
    const withOk = { get: { ...baseGetUsers.get, responses: { '200': { description: 'OK' } } } };
    const withoutOk = { get: { ...baseGetUsers.get, responses: { '404': { description: 'Not Found' } } } };
    const { oldModel, newModel } = await models({ '/users': withOk }, { '/users': withoutOk });
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.changed[0].changes).toContainEqual({
      description: 'response "200" was removed',
      severity: 'breaking',
    });
  });

  it('flags a removed non-2xx response as info', async () => {
    const { oldModel, newModel } = await models(
      { '/users': baseGetUsers },
      { '/users': { get: { ...baseGetUsers.get, responses: { '200': { description: 'OK' } } } } },
    );
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.changed[0].changes).toContainEqual({
      description: 'response "404" was removed',
      severity: 'info',
    });
  });

  it('flags a new response status as info', async () => {
    const withExtra = {
      get: {
        ...baseGetUsers.get,
        responses: { ...baseGetUsers.get.responses, '500': { description: 'Server Error' } },
      },
    };
    const { oldModel, newModel } = await models({ '/users': baseGetUsers }, { '/users': withExtra });
    const diff = diffDocuments(oldModel, newModel);
    expect(diff.changed[0].changes).toContainEqual({
      description: 'new response "500" documented',
      severity: 'info',
    });
  });

  it('diffs the two real sample fixtures without throwing', async () => {
    const oldModel = await normalizeDocument(fixture31);
    const newModel = await normalizeDocument(fixture30);
    const diff = diffDocuments(oldModel, newModel);

    // fixture30 and fixture31 are unrelated real-world specs, not
    // before/after versions of the same API — this is a smoke test against
    // real dereferenced documents, not an assertion about a specific
    // expected diff shape.
    expect(Array.isArray(diff.added)).toBe(true);
    expect(Array.isArray(diff.removed)).toBe(true);
    expect(Array.isArray(diff.changed)).toBe(true);
  });
});
