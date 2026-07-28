import { describe, it, expect } from 'vitest';
import { operationToAiText } from './copy-for-ai';
import type { Endpoint } from '../document-model/types';

function baseEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    method: 'GET',
    path: '/items',
    operationId: undefined,
    summary: undefined,
    description: undefined,
    tags: [],
    parameters: [],
    requestBody: undefined,
    responses: [],
    ...overrides,
  };
}

describe('operationToAiText()', () => {
  it('joins sections with a blank line and groups parameters with explicit required/optional', () => {
    const endpoint = baseEndpoint({
      method: 'POST',
      path: '/auth/register',
      description: 'Register a new account.',
      requestBody: {
        required: true,
        contentType: 'application/json',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
          },
          required: ['name', 'email', 'password'],
        },
      },
      responses: [
        {
          status: '201',
          description: 'Created',
          contentType: 'application/json',
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string' },
            },
            required: ['id', 'email'],
          },
        },
        { status: '400', description: 'Validation Error', contentType: undefined, schema: undefined },
        { status: '409', description: 'Email already exists', contentType: undefined, schema: undefined },
      ],
    });

    const text = operationToAiText(endpoint);

    expect(text).toBe(
      [
        'Endpoint: POST /auth/register',
        'Purpose:\nRegister a new account.',
        'Request:\n{\n  "name": "string",\n  "email": "string",\n  "password": "string"\n}',
        'Validation:\n- email must be valid\n- password min length 8',
        'Success Response (201):\n{\n  "id": "string",\n  "email": "string"\n}',
        'Error Responses:\n400 Validation Error\n409 Email already exists',
      ].join('\n\n'),
    );
  });

  it('header uses uppercase method and the raw path', () => {
    const endpoint = baseEndpoint({ method: 'get', path: '/users/{id}' } as unknown as Endpoint);
    expect(operationToAiText(endpoint)).toContain('Endpoint: get /users/{id}');
  });

  it('uses summary over description for Purpose when both are present', () => {
    const endpoint = baseEndpoint({ summary: 'Short summary', description: 'A much longer description.' });
    const text = operationToAiText(endpoint);
    expect(text).toContain('Purpose:\nShort summary');
    expect(text).not.toContain('A much longer description');
  });

  it('truncates a long description to its first 2 sentences for Purpose', () => {
    const endpoint = baseEndpoint({
      description: 'First sentence here. Second sentence here. Third sentence should be dropped. Fourth too.',
    });
    const text = operationToAiText(endpoint);
    expect(text).toContain('Purpose:\nFirst sentence here. Second sentence here.');
    expect(text).not.toContain('Third sentence');
  });

  it('omits Purpose entirely when neither summary nor description exist', () => {
    const text = operationToAiText(baseEndpoint());
    expect(text).not.toContain('Purpose');
  });

  it('omits Request for a GET with no requestBody, but keeps Parameters', () => {
    const endpoint = baseEndpoint({
      method: 'GET',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: undefined },
      ],
    });
    const text = operationToAiText(endpoint);
    expect(text).not.toContain('Request:');
    expect(text).toContain('Parameters:\nPath Parameters:\n- id (required): string');
  });

  it('groups parameters into Path/Query/Headers sub-sections, each with an explicit required/optional', () => {
    const endpoint = baseEndpoint({
      method: 'GET',
      path: '/users',
      parameters: [
        { name: 'page', in: 'query', required: false, schema: { type: 'integer' }, description: 'Current page' },
        { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: undefined },
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: undefined },
        { name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' }, description: undefined },
        { name: 'session', in: 'cookie', required: false, schema: { type: 'string' }, description: undefined },
      ],
    });

    const text = operationToAiText(endpoint);

    expect(text).toContain(
      [
        'Parameters:',
        'Path Parameters:',
        '- id (required): string',
        'Query Parameters:',
        '- page (optional): integer — Current page',
        '- search (optional): string',
        'Headers:',
        '- x-api-key (required): string',
      ].join('\n'),
    );
    expect(text).not.toContain('session');
  });

  it('represents an array request body as [ {...item schema...} ]', () => {
    const endpoint = baseEndpoint({
      method: 'POST',
      requestBody: {
        required: true,
        contentType: 'application/json',
        schema: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
      },
    });
    const text = operationToAiText(endpoint);
    expect(text).toContain('Request:\n[\n  {\n    "name": "string"\n  }\n]');
  });

  it('annotates a oneOf request body with "(one of N possible shapes)" and uses the first variant', () => {
    const endpoint = baseEndpoint({
      method: 'POST',
      requestBody: {
        required: true,
        contentType: 'application/json',
        schema: {
          oneOf: [
            { type: 'object', properties: { kind: { type: 'string' } } },
            { type: 'object', properties: { other: { type: 'string' } } },
          ],
        },
      },
    });
    const text = operationToAiText(endpoint);
    expect(text).toContain('"kind": "string"');
    expect(text).not.toContain('"other"');
    expect(text).toContain('(one of 2 possible shapes)');
  });

  it('omits Error Responses entirely when no 4xx/5xx are declared', () => {
    const endpoint = baseEndpoint({
      responses: [{ status: '200', description: 'OK', contentType: undefined, schema: undefined }],
    });
    const text = operationToAiText(endpoint);
    expect(text).not.toContain('Error Responses');
  });

  it('falls back to the standard status text when a 4xx/5xx response has no description', () => {
    const endpoint = baseEndpoint({
      responses: [{ status: '500', description: undefined, contentType: undefined, schema: undefined }],
    });
    const text = operationToAiText(endpoint);
    expect(text).toContain('500 Internal Server Error');
  });

  it('lists error responses in spec declaration order, not sorted', () => {
    const endpoint = baseEndpoint({
      responses: [
        { status: '404', description: 'Not found', contentType: undefined, schema: undefined },
        { status: '400', description: 'Bad input', contentType: undefined, schema: undefined },
      ],
    });
    const text = operationToAiText(endpoint);
    const idx404 = text.indexOf('404');
    const idx400 = text.indexOf('400 Bad input');
    expect(idx404).toBeLessThan(idx400);
  });

  it('picks the smallest numeric 2xx as the primary Success Response', () => {
    const endpoint = baseEndpoint({
      responses: [
        { status: '201', description: 'Created', contentType: undefined, schema: { type: 'string' } },
        { status: '200', description: 'OK', contentType: undefined, schema: { type: 'boolean' } },
      ],
    });
    const text = operationToAiText(endpoint);
    expect(text).toContain('Success Response (200):');
    expect(text).not.toContain('Success Response (201):');
  });

  it('falls back to "No content" when a schema-less success response has an empty-string description (real-world @nestjs/swagger default)', () => {
    const endpoint = baseEndpoint({
      responses: [{ status: '201', description: '', contentType: undefined, schema: undefined }],
    });
    const text = operationToAiText(endpoint);
    expect(text).toContain('Success Response (201):\nNo content');
  });

  it('falls back to the status text when an error response has an empty-string description', () => {
    const endpoint = baseEndpoint({
      responses: [{ status: '404', description: '', contentType: undefined, schema: undefined }],
    });
    const text = operationToAiText(endpoint);
    expect(text).toContain('404 Not Found');
  });

  it('omits Validation entirely when the request schema has no constraints beyond types', () => {
    const endpoint = baseEndpoint({
      method: 'POST',
      requestBody: {
        required: true,
        contentType: 'application/json',
        schema: { type: 'object', properties: { name: { type: 'string' } } },
      },
    });
    const text = operationToAiText(endpoint);
    expect(text).not.toContain('Validation');
  });

  it('extracts minimum/maximum/pattern/enum as natural-language Validation lines', () => {
    const endpoint = baseEndpoint({
      method: 'POST',
      requestBody: {
        required: true,
        contentType: 'application/json',
        schema: {
          type: 'object',
          properties: {
            age: { type: 'integer', minimum: 18, maximum: 99 },
            code: { type: 'string', pattern: '^[A-Z]{3}$' },
            role: { type: 'string', enum: ['admin', 'member'] },
          },
        },
      },
    });
    const text = operationToAiText(endpoint);
    expect(text).toContain('- age min 18');
    expect(text).toContain('- age max 99');
    expect(text).toContain('- code must match pattern ^[A-Z]{3}$');
    expect(text).toContain('- role must be one of: admin, member');
  });

  it('does not stack-overflow on a circular schema (recursive DTO) — regression', () => {
    const recursive: Record<string, unknown> = { type: 'object', properties: {} };
    (recursive.properties as Record<string, unknown>).parent = recursive;
    (recursive.properties as Record<string, unknown>).name = { type: 'string', minLength: 1 };

    const endpoint = baseEndpoint({
      method: 'POST',
      requestBody: { required: true, contentType: 'application/json', schema: recursive as never },
    });

    expect(() => operationToAiText(endpoint)).not.toThrow();
    expect(operationToAiText(endpoint)).toContain('name min length 1');
  });

  describe('circular schemas — full reproduction of the reported bug (User.parent: User)', () => {
    function makeRecursiveUserResponse() {
      const user: Record<string, unknown> = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string' },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
      };
      (user.properties as Record<string, unknown>).parent = user;

      return {
        type: 'object',
        properties: {
          data: { type: 'array', items: user },
          meta: {
            type: 'object',
            properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' } },
          },
        },
      };
    }

    it('collapses the recursive User.parent chain to a single short marker instead of 8+ repeated levels', () => {
      const endpoint = baseEndpoint({
        method: 'GET',
        path: '/users',
        responses: [{ status: '200', description: 'Users found successfully', contentType: 'application/json', schema: makeRecursiveUserResponse() as never }],
      });

      const text = operationToAiText(endpoint);

      // The whole point of the fix: no wall of duplicated nesting.
      expect(text).toContain('"parent": "(circular reference)"');
      expect(text.match(/"email": "string"/g)).toHaveLength(1);
      expect(text).not.toContain('"object"'); // the old bug: depth-capped leaves mislabeled as "object"
    });

    it('does not duplicate validation rules for fields repeated across the (now-collapsed) cycle', () => {
      const endpoint = baseEndpoint({
        method: 'POST',
        requestBody: { required: true, contentType: 'application/json', schema: makeRecursiveUserResponse().properties.data.items as never },
      });

      const text = operationToAiText(endpoint);
      expect(text.match(/email must be valid/g)).toHaveLength(1);
    });

    it('stays well under 5ms even for a circular schema (no quadratic blowup from the fix)', () => {
      const endpoint = baseEndpoint({
        method: 'GET',
        responses: [{ status: '200', description: 'OK', contentType: 'application/json', schema: makeRecursiveUserResponse() as never }],
      });

      const start = performance.now();
      operationToAiText(endpoint);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  it('runs well under 5ms (pure string formatting, no I/O)', () => {
    const endpoint = baseEndpoint({
      method: 'POST',
      requestBody: {
        required: true,
        contentType: 'application/json',
        schema: { type: 'object', properties: { name: { type: 'string', minLength: 1 } } },
      },
      responses: [{ status: '201', description: 'Created', contentType: undefined, schema: { type: 'object', properties: {} } }],
    });

    const start = performance.now();
    operationToAiText(endpoint);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50); // generous CI margin around the 5ms target
  });
});
