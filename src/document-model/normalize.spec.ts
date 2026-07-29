import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeDocument } from './normalize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture30 = path.join(__dirname, '..', '__tests__', 'fixtures', 'spec-3.0.json');
const fixture31 = path.join(__dirname, '..', '__tests__', 'fixtures', 'spec-3.1.json');

describe('normalizeDocument()', () => {
  it('extracts info from a 3.0 spec', async () => {
    const model = await normalizeDocument(fixture30);
    expect(model.info.title).toBe('Sample API 3.0');
    expect(model.info.version).toBe('1.0.0');
  });

  it('groups endpoints under their declared tag', async () => {
    const model = await normalizeDocument(fixture30);
    expect(model.tagGroups).toHaveLength(1);
    expect(model.tagGroups[0].name).toBe('users');
    expect(model.tagGroups[0].endpoints).toHaveLength(2);
  });

  it('extracts method, path, and summary per endpoint', async () => {
    const model = await normalizeDocument(fixture30);
    const [getUsers, postUsers] = model.tagGroups[0].endpoints;

    expect(getUsers.method).toBe('GET');
    expect(getUsers.path).toBe('/users');
    expect(getUsers.summary).toBe('List all users');

    expect(postUsers.method).toBe('POST');
    expect(postUsers.operationId).toBe('createUser');
  });

  it('resolves the request body schema for POST', async () => {
    const model = await normalizeDocument(fixture30);
    const postUsers = model.tagGroups[0].endpoints[1];

    expect(postUsers.requestBody).toBeDefined();
    expect(postUsers.requestBody!.contentType).toBe('application/json');
    expect(postUsers.requestBody!.schema).toMatchObject({
      type: 'object',
      required: ['name', 'email', 'password'],
    });
  });

  it('omits requestBody for GET (no body declared)', async () => {
    const model = await normalizeDocument(fixture30);
    const getUsers = model.tagGroups[0].endpoints[0];
    expect(getUsers.requestBody).toBeUndefined();
  });

  it('extracts all declared responses, including error codes', async () => {
    const model = await normalizeDocument(fixture30);
    const postUsers = model.tagGroups[0].endpoints[1];

    const statuses = postUsers.responses.map((r) => r.status);
    expect(statuses).toEqual(['201', '400', '409']);
    expect(postUsers.responses.find((r) => r.status === '400')?.description).toBe('Validation Error');
  });

  it('resolves $ref schemas inside responses', async () => {
    const model = await normalizeDocument(fixture30);
    const postUsers = model.tagGroups[0].endpoints[1];
    const created = postUsers.responses.find((r) => r.status === '201');

    expect(created?.schema).toMatchObject({ type: 'object' });
    expect((created?.schema as any).properties.email).toMatchObject({ format: 'email' });
  });

  it('works identically for an OpenAPI 3.1 spec', async () => {
    const model = await normalizeDocument(fixture31);
    expect(model.info.title).toBe('Sample API 3.1');
    expect(model.tagGroups[0].endpoints).toHaveLength(2);
  });

  it('preserves declared tag order, then discovered, then a Default group for untagged ops', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Order test', version: '1.0.0' },
      tags: [{ name: 'beta' }, { name: 'alpha' }],
      paths: {
        '/a': { get: { tags: ['alpha'], responses: { '200': { description: 'OK' } } } },
        '/b': { get: { tags: ['gamma'], responses: { '200': { description: 'OK' } } } },
        '/c': { get: { responses: { '200': { description: 'OK' } } } }, // untagged
        '/d': { get: { tags: ['beta'], responses: { '200': { description: 'OK' } } } },
      },
    };

    const model = await normalizeDocument(spec);
    expect(model.tagGroups.map((g) => g.name)).toEqual(['beta', 'alpha', 'gamma', 'Default']);
  });

  it('a single endpoint appears in every tag it declares', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Multi-tag test', version: '1.0.0' },
      paths: {
        '/a': { get: { tags: ['x', 'y'], responses: { '200': { description: 'OK' } } } },
      },
    };

    const model = await normalizeDocument(spec);
    expect(model.tagGroups.map((g) => g.name)).toEqual(['x', 'y']);
    expect(model.tagGroups[0].endpoints).toHaveLength(1);
    expect(model.tagGroups[1].endpoints).toHaveLength(1);
  });

  it('extracts parameter info (name, in, required, description)', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Params test', version: '1.0.0' },
      paths: {
        '/items/{id}': {
          get: {
            tags: ['items'],
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Item id' },
              { name: 'verbose', in: 'query', required: false, schema: { type: 'boolean' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const model = await normalizeDocument(spec);
    const params = model.tagGroups[0].endpoints[0].parameters;
    expect(params).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Item id' },
      { name: 'verbose', in: 'query', required: false, schema: { type: 'boolean' }, description: undefined },
    ]);
  });

  it('does not include empty tag groups (declared but unused tags are dropped)', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Unused tag test', version: '1.0.0' },
      tags: [{ name: 'unused' }, { name: 'used' }],
      paths: {
        '/a': { get: { tags: ['used'], responses: { '200': { description: 'OK' } } } },
      },
    };

    const model = await normalizeDocument(spec);
    expect(model.tagGroups.map((g) => g.name)).toEqual(['used']);
  });

  it('extracts securitySchemes from components', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Security test', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
      paths: {
        '/a': { get: { tags: ['x'], responses: { '200': { description: 'OK' } } } },
      },
    };

    const model = await normalizeDocument(spec);
    expect(model.securitySchemes).toEqual({
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: undefined, name: undefined, description: undefined },
      apiKeyAuth: { type: 'apiKey', scheme: undefined, bearerFormat: undefined, in: 'header', name: 'X-API-Key', description: undefined },
    });
  });

  it('defaults securitySchemes to an empty object when components are absent', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'No security test', version: '1.0.0' },
      paths: { '/a': { get: { tags: ['x'], responses: { '200': { description: 'OK' } } } } },
    };

    const model = await normalizeDocument(spec);
    expect(model.securitySchemes).toEqual({});
  });

  it('falls back to global security when the operation does not declare its own', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Global security test', version: '1.0.0' },
      security: [{ bearerAuth: [] }],
      paths: { '/a': { get: { tags: ['x'], responses: { '200': { description: 'OK' } } } } },
    };

    const model = await normalizeDocument(spec);
    expect(model.tagGroups[0].endpoints[0].security).toEqual([{ bearerAuth: [] }]);
  });

  it('lets an operation override global security, including with an explicit empty array', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Override security test', version: '1.0.0' },
      security: [{ bearerAuth: [] }],
      paths: {
        '/public': { get: { tags: ['x'], security: [], responses: { '200': { description: 'OK' } } } },
        '/scoped': {
          get: { tags: ['x'], security: [{ apiKeyAuth: [] }], responses: { '200': { description: 'OK' } } },
        },
      },
    };

    const model = await normalizeDocument(spec);
    const [pub, scoped] = model.tagGroups[0].endpoints;
    expect(pub.security).toEqual([]);
    expect(scoped.security).toEqual([{ apiKeyAuth: [] }]);
  });

  it('extracts absolute server URLs, in declared order', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Servers test', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com' }, { url: 'https://staging.example.com' }],
      paths: { '/a': { get: { tags: ['x'], responses: { '200': { description: 'OK' } } } } },
    };

    const model = await normalizeDocument(spec);
    expect(model.servers).toEqual(['https://api.example.com', 'https://staging.example.com']);
  });

  it('drops relative server entries (no safe base to resolve them against)', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Relative servers test', version: '1.0.0' },
      servers: [{ url: '/' }, { url: 'https://api.example.com' }],
      paths: { '/a': { get: { tags: ['x'], responses: { '200': { description: 'OK' } } } } },
    };

    const model = await normalizeDocument(spec);
    expect(model.servers).toEqual(['https://api.example.com']);
  });

  it('defaults servers to an empty array when absent', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'No servers test', version: '1.0.0' },
      paths: { '/a': { get: { tags: ['x'], responses: { '200': { description: 'OK' } } } } },
    };

    const model = await normalizeDocument(spec);
    expect(model.servers).toEqual([]);
  });

  it('defaults an endpoint to no security requirements when neither operation nor global declares any', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'No security at all test', version: '1.0.0' },
      paths: { '/a': { get: { tags: ['x'], responses: { '200': { description: 'OK' } } } } },
    };

    const model = await normalizeDocument(spec);
    expect(model.tagGroups[0].endpoints[0].security).toEqual([]);
  });
});
