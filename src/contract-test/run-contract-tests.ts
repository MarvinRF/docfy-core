import { buildSchemaExample } from '../document-model/example.js';
import { uniqueEndpoints } from '../document-model/unique-endpoints.js';
import { validateAgainstSchema } from '../document-model/validate-response.js';
import type { DocumentModel, Endpoint, JSONSchemaLike } from '../document-model/types.js';
import type { SchemaMismatch } from '../document-model/validate-response.js';
import { buildAllowedOrigins, isOriginAllowed } from './allowed-origins.js';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** A live response is read into memory in full to validate against the schema, so an unbounded body is a real DoS surface. */
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10MB
/** Contract tests can legitimately be slower than a simple probe (real business logic runs per request), but must still not hang forever. */
const TIMEOUT_MS = 10_000;

export type EndpointTestOutcome =
  | { kind: 'matched'; httpStatus: number; mismatches: SchemaMismatch[] }
  | { kind: 'undeclared-status'; httpStatus: number }
  | { kind: 'no-schema'; httpStatus: number }
  | { kind: 'unparseable-body'; httpStatus: number }
  | { kind: 'response-too-large'; httpStatus: number }
  | { kind: 'request-failed'; message: string };

export interface EndpointTestResult {
  method: string;
  path: string;
  requestUrl: string;
  outcome: EndpointTestOutcome;
}

export interface RunContractTestsOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  /** Case-insensitive substring match against path/tags — same filter semantics as `list_endpoints`. */
  filter?: string;
  /** When true, `baseUrl` must match one of `document.servers`'s origins, or the run is rejected before firing any request. Opt-in — off by default so pointing at a plain local server keeps working with zero extra config. */
  restrictToServers?: boolean;
}

/** Reads a response body up to `maxBytes`, aborting the underlying stream instead of buffering an unbounded body into memory. */
async function readBodyCapped(response: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: await response.text(), truncated: false };

  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return { text: '', truncated: true };
    }
    text += decoder.decode(value, { stream: true });
  }
  return { text, truncated: false };
}

/** Renders a schema-derived example value down to something usable as a raw path/query
 * token — `buildSchemaExample()`'s `example` is a real value for scalars (e.g. `"string"`,
 * `42`) but an array/object for structured schemas, which can't be flattened into a single
 * URL segment; those fall back to the literal `"test"` rather than `"[object Object]"`. */
function placeholderValue(schema: JSONSchemaLike | undefined): string {
  const example = buildSchemaExample(schema)?.example;
  if (example === undefined || example === null || typeof example === 'object') return 'test';
  return String(example);
}

function buildTestUrl(baseUrl: string, endpoint: Endpoint): string {
  let requestPath = endpoint.path;
  for (const param of endpoint.parameters.filter((p) => p.in === 'path')) {
    requestPath = requestPath.replace(`{${param.name}}`, encodeURIComponent(placeholderValue(param.schema)));
  }

  const query = new URLSearchParams();
  for (const param of endpoint.parameters.filter((p) => p.in === 'query' && p.required)) {
    query.set(param.name, placeholderValue(param.schema));
  }

  const base = baseUrl.replace(/\/+$/, '');
  const queryString = query.toString();
  return `${base}${requestPath}${queryString ? `?${queryString}` : ''}`;
}

function buildTestBody(endpoint: Endpoint): { body: string | undefined; contentType: string | undefined } {
  if (!endpoint.requestBody || !METHODS_WITH_BODY.has(endpoint.method))
    return { body: undefined, contentType: undefined };
  const example = buildSchemaExample(endpoint.requestBody.schema);
  return { body: example?.json, contentType: endpoint.requestBody.contentType };
}

/**
 * Fires a real request at `options.baseUrl` for one endpoint — path/query params and the
 * request body are filled in with the same deterministic, type-token examples `buildSchemaExample()`
 * produces elsewhere (no fake-but-plausible data) — and checks the live response against the
 * spec. A response whose status code isn't declared at all, or is declared with no schema, is
 * reported but never counted as a mismatch: a fabricated ID legitimately 404ing isn't a contract
 * break, and there's nothing to structurally check against for a schema-less response.
 */
async function testEndpoint(endpoint: Endpoint, options: RunContractTestsOptions): Promise<EndpointTestResult> {
  const requestUrl = buildTestUrl(options.baseUrl, endpoint);
  const { body, contentType } = buildTestBody(endpoint);

  const headers = new Headers(options.headers);
  if (body !== undefined && contentType) headers.set('Content-Type', contentType);

  const base = { method: endpoint.method, path: endpoint.path, requestUrl };

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      response = await fetch(requestUrl, { method: endpoint.method, headers, body, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    return { ...base, outcome: { kind: 'request-failed', message: err instanceof Error ? err.message : String(err) } };
  }

  const declared = endpoint.responses.find((r) => r.status === String(response.status));
  if (!declared) return { ...base, outcome: { kind: 'undeclared-status', httpStatus: response.status } };
  if (!declared.schema) return { ...base, outcome: { kind: 'no-schema', httpStatus: response.status } };

  const { text: bodyText, truncated } = await readBodyCapped(response, MAX_BODY_BYTES);
  if (truncated) return { ...base, outcome: { kind: 'response-too-large', httpStatus: response.status } };

  let parsed: unknown;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    return { ...base, outcome: { kind: 'unparseable-body', httpStatus: response.status } };
  }

  const mismatches = validateAgainstSchema(declared.schema, parsed);
  return { ...base, outcome: { kind: 'matched', httpStatus: response.status, mismatches } };
}

/**
 * Runs every endpoint in `document` (optionally narrowed by `options.filter`) against a real,
 * already-running server — a Postman-collection-runner-equivalent with zero setup, driven
 * straight off an already-normalized OpenAPI document. Endpoints run concurrently; one
 * endpoint's network failure never blocks the others. `document` must already be normalized
 * (via `normalizeDocument()`) — this function does not normalize internally, since callers that
 * already hold a `DocumentModel` (e.g. a long-lived server that normalized once at startup)
 * shouldn't pay to re-parse it on every call.
 */
export async function runContractTests(
  document: DocumentModel,
  options: RunContractTestsOptions,
): Promise<EndpointTestResult[]> {
  if (options.restrictToServers) {
    const allowed = buildAllowedOrigins(document.servers);
    if (!isOriginAllowed(options.baseUrl, allowed)) {
      throw new Error(
        `baseUrl "${options.baseUrl}" is not one of the spec's declared servers (${document.servers.join(', ') || 'none declared'}) — pass restrictToServers: false to override.`,
      );
    }
  }

  const needle = options.filter?.toLowerCase();
  const endpoints = uniqueEndpoints(document).filter(
    (e) => !needle || e.path.toLowerCase().includes(needle) || e.tags.some((t) => t.toLowerCase().includes(needle)),
  );
  return Promise.all(endpoints.map((endpoint) => testEndpoint(endpoint, options)));
}
