import { describe, it, expect } from 'vitest';
import { buildLlmsTxt, buildLlmsFullTxt } from './llms-txt';
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

function document(overrides: Partial<DocumentModel> = {}): DocumentModel {
  return {
    info: { title: 'Demo API', version: '1.0.0', description: undefined },
    tagGroups: [],
    securitySchemes: {},
    servers: [],
    ...overrides,
  };
}

describe('buildLlmsTxt()', () => {
  it('renders the title and description from document.info', () => {
    const doc = document({ info: { title: 'Demo API', version: '1.0.0', description: 'Does demo things.' } });
    expect(buildLlmsTxt(doc)).toBe('# Demo API\n\n> Does demo things.\n');
  });

  it('lets explicit options override document.info', () => {
    const doc = document();
    expect(buildLlmsTxt(doc, { title: 'Custom', description: 'Custom desc' })).toBe('# Custom\n\n> Custom desc\n');
  });

  it('omits the blockquote when there is no description anywhere', () => {
    const doc = document({ info: { title: 'Demo API', version: '1.0.0', description: undefined } });
    expect(buildLlmsTxt(doc)).toBe('# Demo API\n');
  });

  it('lists endpoints per tag group as plain bullets when no docsBaseUrl is given', () => {
    const doc = document({
      tagGroups: [{ name: 'Users', description: undefined, endpoints: [endpoint({ summary: 'List all users' })] }],
    });
    expect(buildLlmsTxt(doc)).toBe('# Demo API\n\n## Users\n- GET /users: List all users\n');
  });

  it('skips a tag group with no endpoints', () => {
    const doc = document({ tagGroups: [{ name: 'Empty', description: undefined, endpoints: [] }] });
    expect(buildLlmsTxt(doc)).toBe('# Demo API\n');
  });

  it('links each endpoint to its docfy-ui route when docsBaseUrl is given, mirroring EndpointRoute.tsx', () => {
    const doc = document({
      tagGroups: [
        {
          name: 'Users',
          description: undefined,
          endpoints: [endpoint({ operationId: 'listUsers', summary: 'List all users' })],
        },
      ],
    });
    expect(buildLlmsTxt(doc, { docsBaseUrl: '/docs' })).toBe(
      '# Demo API\n\n## Users\n- [GET /users](/docs/Users/listUsers): List all users\n',
    );
  });

  it('falls back to method-path for the operationId slug when operationId is undefined', () => {
    const doc = document({
      tagGroups: [{ name: 'Users', description: undefined, endpoints: [endpoint()] }],
    });
    expect(buildLlmsTxt(doc, { docsBaseUrl: '/docs' })).toBe(
      '# Demo API\n\n## Users\n- [GET /users](/docs/Users/GET-%2Fusers)\n',
    );
  });
});

describe('buildLlmsFullTxt()', () => {
  it('expands each endpoint to its full "Copy for AI" text instead of a one-line bullet', () => {
    const doc = document({
      tagGroups: [{ name: 'Users', description: undefined, endpoints: [endpoint({ summary: 'List all users' })] }],
    });
    const result = buildLlmsFullTxt(doc);
    expect(result).toContain('# Demo API');
    expect(result).toContain('## Users');
    expect(result).toContain('GET /users');
    expect(result).toContain('List all users');
  });
});
