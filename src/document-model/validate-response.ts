import type { JSONSchemaLike } from './types.js';

export interface SchemaMismatch {
  /** JSON-pointer-ish path to the offending value, e.g. `body.items[0].id`. */
  path: string;
  message: string;
}

const MAX_ARRAY_ITEMS_CHECKED = 20;

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** `schema.type` may be a single string or (JSON Schema draft 2020-12 style) an array of strings. */
function allowedTypes(schema: JSONSchemaLike): string[] | undefined {
  const type = schema.type;
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type as string[];
  return undefined;
}

function matchesType(value: unknown, schema: JSONSchemaLike): boolean {
  const types = allowedTypes(schema);
  if (!types) return true;
  const actual = typeOf(value);
  if (types.includes(actual)) return true;
  // OpenAPI 3.0's `integer` is a `number` at runtime; `nullable: true` (3.0) is the
  // pre-3.1 equivalent of `type: [..., "null"]`.
  if (types.includes('integer') && actual === 'number' && Number.isInteger(value)) return true;
  if (value === null && schema.nullable === true) return true;
  return false;
}

/**
 * Structural check of a parsed response body against its declared OpenAPI schema — not a full
 * JSON Schema validator (no `$ref` resolution, since `normalizeDocument()` already dereferences
 * everything upstream; no `pattern`/`format`/numeric bounds). Built to answer one question: did
 * the live response drift from what the docs promise (missing/renamed field, wrong type), the
 * same class of bug `diffDocuments()` catches between two specs but here caught at request time
 * against the real server. Extra properties not in `schema.properties` are intentionally not
 * flagged — additive/undocumented fields are common and not a contract break.
 */
export function validateAgainstSchema(
  schema: JSONSchemaLike | undefined,
  value: unknown,
  path = 'body',
): SchemaMismatch[] {
  if (!schema) return [];

  if (Array.isArray(schema.allOf)) {
    return (schema.allOf as JSONSchemaLike[]).flatMap((branch) => validateAgainstSchema(branch, value, path));
  }

  const union = (schema.oneOf as JSONSchemaLike[] | undefined) ?? (schema.anyOf as JSONSchemaLike[] | undefined);
  if (union && union.length > 0) {
    const perBranch = union.map((branch) => validateAgainstSchema(branch, value, path));
    const matched = perBranch.find((issues) => issues.length === 0);
    if (matched) return [];
    // None matched — surface the branch that came closest, not all of them at once.
    return perBranch.reduce((best, issues) => (issues.length < best.length ? issues : best));
  }

  const issues: SchemaMismatch[] = [];

  if (!matchesType(value, schema)) {
    issues.push({ path, message: `expected ${allowedTypes(schema)?.join(' | ')}, got ${typeOf(value)}` });
    return issues;
  }

  if (Array.isArray(schema.enum) && value !== undefined && !schema.enum.includes(value)) {
    issues.push({ path, message: `expected one of [${schema.enum.join(', ')}], got ${JSON.stringify(value)}` });
  }

  if (typeOf(value) === 'object' && schema.properties) {
    const obj = value as Record<string, unknown>;
    const required = (schema.required as string[] | undefined) ?? [];
    const properties = schema.properties as Record<string, JSONSchemaLike>;

    for (const name of required) {
      if (!(name in obj)) issues.push({ path: `${path}.${name}`, message: 'required property missing' });
    }
    for (const [name, propSchema] of Object.entries(properties)) {
      if (name in obj) issues.push(...validateAgainstSchema(propSchema, obj[name], `${path}.${name}`));
    }
  }

  if (typeOf(value) === 'array' && schema.items) {
    const items = value as unknown[];
    const itemSchema = schema.items as JSONSchemaLike;
    for (let i = 0; i < Math.min(items.length, MAX_ARRAY_ITEMS_CHECKED); i++) {
      issues.push(...validateAgainstSchema(itemSchema, items[i], `${path}[${i}]`));
    }
  }

  return issues;
}
