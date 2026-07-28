import type { JSONSchemaLike, ResponseInfo } from './types';
import { capDepth } from './cap-depth';

export const STATUS_TEXT: Record<string, string> = {
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '403': 'Forbidden',
  '404': 'Not Found',
  '405': 'Method Not Allowed',
  '409': 'Conflict',
  '422': 'Unprocessable Entity',
  '429': 'Too Many Requests',
  '500': 'Internal Server Error',
  '502': 'Bad Gateway',
  '503': 'Service Unavailable',
};

/**
 * Caches `schema` (with `allOf`) -> merged result by identity. Without this,
 * every visit to the same `$ref`'d schema (e.g. a recursive `User.manager:
 * User` where `User` itself uses `allOf`) would produce a freshly-allocated
 * merged object, defeating the identity-based cycle detection in
 * `flattenSchema`/`buildNode` below — they track "have I seen this object
 * before" via a `Set`, which only works if the same input always resolves
 * to the same output object.
 */
const mergeCache = new WeakMap<JSONSchemaLike, JSONSchemaLike>();

/**
 * Shallow-merges an `allOf` composition into a single schema so downstream
 * type/property resolution sees one object instead of an opaque array.
 * `$ref`s are already dereferenced by `normalize.ts` by the time this runs,
 * so each `allOf` entry is a real schema object, not a `$ref` string.
 * Recurses so nested `allOf` (e.g. a `$ref`'d base schema that itself uses
 * `allOf`) flattens fully; `oneOf`/`anyOf` inside a branch are left alone
 * for `resolveUnion` to handle afterward.
 */
function mergeAllOf(schema: JSONSchemaLike): JSONSchemaLike {
  const branches = schema.allOf as JSONSchemaLike[] | undefined;
  if (!branches || branches.length === 0) return schema;

  const cached = mergeCache.get(schema);
  if (cached) return cached;

  const merged: JSONSchemaLike = { ...schema };
  mergeCache.set(schema, merged);
  delete (merged as Record<string, unknown>).allOf;
  let properties: Record<string, JSONSchemaLike> = { ...(merged.properties as Record<string, JSONSchemaLike> | undefined) };
  let required: string[] = [...((merged.required as string[] | undefined) ?? [])];

  for (const branch of branches) {
    const resolvedBranch = mergeAllOf(branch);
    if (resolvedBranch.type && !merged.type) merged.type = resolvedBranch.type;
    if (resolvedBranch.properties) {
      properties = { ...properties, ...(resolvedBranch.properties as Record<string, JSONSchemaLike>) };
    }
    if (Array.isArray(resolvedBranch.required)) {
      required = [...required, ...(resolvedBranch.required as string[])];
    }
  }

  if (Object.keys(properties).length > 0) {
    merged.properties = properties;
    if (!merged.type) merged.type = 'object';
  }
  if (required.length > 0) merged.required = [...new Set(required)];

  return merged;
}

/** Resolves `allOf`/`oneOf`/`anyOf` to a single concrete schema. Returns the variant count when a `oneOf`/`anyOf` union was found. */
export function resolveUnion(schema: JSONSchemaLike | undefined): { schema: JSONSchemaLike | undefined; unionSize?: number } {
  if (!schema) return { schema: undefined };
  const flattened = mergeAllOf(schema);
  const union = (flattened.oneOf as JSONSchemaLike[] | undefined) ?? (flattened.anyOf as JSONSchemaLike[] | undefined);
  if (union && union.length > 0) {
    // The chosen variant (e.g. `DigitalProduct`) may itself be an `allOf`
    // composition — merge it too, otherwise it surfaces with no `type`/
    // `properties` and falls back to the literal string "object".
    return { schema: mergeAllOf(union[0]), unionSize: union.length };
  }
  return { schema: flattened };
}

/** Text used wherever a schema cycle is detected, instead of expanding it again. */
export function circularMarker(schema: JSONSchemaLike): string {
  const title = typeof schema.title === 'string' ? schema.title : undefined;
  return title ? `(circular reference to ${title})` : '(circular reference)';
}

/**
 * Hard backstop against pathologically deep (but non-cyclic) schemas.
 * Real cycles are caught immediately by ancestor tracking below — this
 * only matters for the rare case of genuinely 20+ levels of distinct
 * nesting.
 */
const MAX_DEPTH = 20;

/**
 * Flattens a JSON Schema into an example using TYPE NAMES as values
 * ("name": "string"), never fake data — per the Copy for AI spec, section
 * 3.2 step 3 ("chave: tipo, não valores fake"). Shared between the Copy
 * for AI transformer and the code snippet generators so both render the
 * exact same request/response body shape.
 *
 * `ancestors` tracks resolved schema objects currently on the recursion
 * path (by identity, not a depth counter) — `SwaggerParser.dereference()`
 * turns recursive DTOs (`User.parent: User`) into real object cycles, and
 * a depth cap alone just unrolls the cycle N times before giving up,
 * producing a huge wall of duplicated, useless nesting. Detecting the
 * cycle the first time it repeats produces one concise marker instead.
 */
function flattenSchema(
  schema: JSONSchemaLike | undefined,
  depth: number,
  unionSizes: number[],
  ancestors: Set<JSONSchemaLike>,
): unknown {
  if (!schema || depth > MAX_DEPTH) return 'object';

  const { schema: resolved, unionSize } = resolveUnion(schema);
  if (unionSize) unionSizes.push(unionSize);
  if (!resolved) return 'object';

  if (ancestors.has(resolved)) return circularMarker(resolved);

  const rawType = resolved.type;
  const type = Array.isArray(rawType) ? (rawType as string[]).find((t) => t !== 'null') ?? rawType[0] : rawType;

  if (type === 'object' || resolved.properties) {
    const props = (resolved.properties as Record<string, JSONSchemaLike>) ?? {};
    ancestors.add(resolved);
    const out: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(props)) {
      out[key] = flattenSchema(propSchema, depth + 1, unionSizes, ancestors);
    }
    ancestors.delete(resolved);
    return out;
  }

  if (type === 'array') {
    ancestors.add(resolved);
    const item = flattenSchema(resolved.items as JSONSchemaLike | undefined, depth + 1, unionSizes, ancestors);
    ancestors.delete(resolved);
    return [item];
  }

  if (typeof type === 'string') return type;
  return 'object';
}

export interface SchemaExampleResult {
  /** The flattened example, JSON.stringify-safe (cycles already capped). */
  example: unknown;
  json: string;
  unionSizes: number[];
}

export function buildSchemaExample(schema: JSONSchemaLike | undefined): SchemaExampleResult | undefined {
  if (!schema) return undefined;
  const unionSizes: number[] = [];
  const example = flattenSchema(schema, 0, unionSizes, new Set());
  // Defense in depth: flattenSchema's own cycle detection should make this
  // a no-op in practice, but capDepth stays as a second guard against any
  // structure that's deep without being a detectable identity cycle.
  const safe = capDepth(example, { maxDepth: 12 });
  return { example: safe, json: JSON.stringify(safe, null, 2), unionSizes };
}

export function withUnionNotes(body: string, unionSizes: number[]): string {
  if (unionSizes.length === 0) return body;
  const notes = unionSizes.map((n) => `(one of ${n} possible shapes)`);
  return `${body}\n${notes.join('\n')}`;
}

/**
 * Primary 2xx response: smallest numeric 2xx code declared. Non-numeric
 * statuses (e.g. "default") are not considered.
 */
export function pickPrimarySuccessResponse(responses: ResponseInfo[]): ResponseInfo | undefined {
  const numeric2xx = responses
    .filter((r) => /^2\d\d$/.test(r.status))
    .sort((a, b) => Number(a.status) - Number(b.status));
  return numeric2xx[0];
}
