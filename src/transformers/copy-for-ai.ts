import type { Endpoint, JSONSchemaLike, ParameterInfo } from '../document-model/types';
import {
  STATUS_TEXT,
  buildSchemaExample,
  pickPrimarySuccessResponse,
  resolveUnion,
  withUnionNotes,
} from '../document-model/example';

function truncateToSentences(text: string, maxSentences: number): string {
  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, maxSentences).join(' ');
}

function buildPurpose(endpoint: Endpoint): string | undefined {
  if (endpoint.summary) return endpoint.summary;
  if (endpoint.description) return truncateToSentences(endpoint.description, 2);
  return undefined;
}

/**
 * Extracts explicit validation rules from a request body schema:
 * format, minLength/maxLength, minimum/maximum, pattern, enum.
 *
 * Deliberate decision: `required` does NOT produce its own line. The
 * worked example in section 3.3 shows zero "X is required" lines for a
 * register endpoint where email/password are almost certainly required —
 * presence is already conveyed by the field simply appearing in the
 * Request example, so a separate "required" line would be redundant
 * noise for the AI consumer. Reproduced exactly against that example.
 *
 * `ancestors` tracks resolved schema objects on the current recursion
 * path by identity — dereferenced schemas can be real object cycles
 * (recursive DTOs). Unlike a plain depth cap (which used to unroll the
 * cycle ~10 times, producing duplicated "parent.parent...x10 email must
 * be valid" lines), stopping the moment a schema repeats means a
 * recursive property contributes at most one pass of rules — its own
 * rules already cover what the cycle would otherwise repeat.
 */
function extractValidationRules(
  schema: JSONSchemaLike | undefined,
  prefix = '',
  ancestors: Set<JSONSchemaLike> = new Set(),
): string[] {
  const { schema: resolved } = resolveUnion(schema);
  if (!resolved) return [];
  if (ancestors.has(resolved)) return [];

  const properties = (resolved.properties as Record<string, JSONSchemaLike>) ?? {};
  const rules: string[] = [];

  ancestors.add(resolved);
  for (const [key, rawPropSchema] of Object.entries(properties)) {
    const name = prefix ? `${prefix}.${key}` : key;
    const { schema: prop } = resolveUnion(rawPropSchema);
    if (!prop) continue;

    if (prop.format) rules.push(`${name} must be valid`);
    if (prop.minLength !== undefined) rules.push(`${name} min length ${prop.minLength}`);
    if (prop.maxLength !== undefined) rules.push(`${name} max length ${prop.maxLength}`);
    if (prop.minimum !== undefined) rules.push(`${name} min ${prop.minimum}`);
    if (prop.maximum !== undefined) rules.push(`${name} max ${prop.maximum}`);
    if (prop.pattern) rules.push(`${name} must match pattern ${prop.pattern}`);
    if (Array.isArray(prop.enum)) rules.push(`${name} must be one of: ${(prop.enum as unknown[]).join(', ')}`);

    if (prop.type === 'object' && prop.properties) {
      rules.push(...extractValidationRules(prop, name, ancestors));
    }
  }
  ancestors.delete(resolved);

  return rules;
}

const PARAM_GROUP_LABELS: Record<string, string> = {
  path: 'Path Parameters',
  query: 'Query Parameters',
  header: 'Headers',
};

/** Same grouping/order/labels as the visual `ParametersSection` — cookie params stay out of scope for both. */
const PARAM_GROUP_ORDER = ['path', 'query', 'header'] as const;

function formatParameterLine(param: ParameterInfo): string {
  const requirement = param.required ? 'required' : 'optional';
  const type = typeof param.schema?.type === 'string' ? (param.schema!.type as string) : 'unknown';
  const description = param.description ? ` — ${param.description}` : '';
  return `- ${param.name} (${requirement}): ${type}${description}`;
}

/** Groups parameters into Path/Query/Headers sub-sections, each with an explicit required/optional per line. */
function buildParametersBlock(parameters: ParameterInfo[]): string | undefined {
  const groups = PARAM_GROUP_ORDER.map((kind) => ({
    kind,
    items: parameters.filter((p) => p.in === kind),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) return undefined;

  const body = groups
    .map((g) => `${PARAM_GROUP_LABELS[g.kind]}:\n${g.items.map(formatParameterLine).join('\n')}`)
    .join('\n');

  return `Parameters:\n${body}`;
}

function buildErrorResponseLines(responses: Endpoint['responses']): string[] {
  return responses
    .filter((r) => /^[45]\d\d$/.test(r.status))
    .map((r) => `${r.status} ${r.description || STATUS_TEXT[r.status] || ''}`.trim());
}

/**
 * Transforms a normalized Endpoint into the plain-text, LLM-ready
 * representation behind the "Copy for AI" button. Pure function, no I/O —
 * runs entirely client-side in well under 5ms.
 *
 * Section order: Endpoint → Purpose → Request → Parameters → Validation →
 * Success Response → Error Responses. Empty sections are omitted, and
 * sections are separated by a blank line for scannability.
 */
export function operationToAiText(endpoint: Endpoint): string {
  const sections: string[] = [];

  sections.push(`Endpoint: ${endpoint.method} ${endpoint.path}`);

  const purpose = buildPurpose(endpoint);
  if (purpose) sections.push(`Purpose:\n${purpose}`);

  if (endpoint.requestBody?.schema) {
    const result = buildSchemaExample(endpoint.requestBody.schema);
    if (result) sections.push(withUnionNotes(`Request:\n${result.json}`, result.unionSizes));
  }

  const parametersBlock = buildParametersBlock(endpoint.parameters);
  if (parametersBlock) sections.push(parametersBlock);

  if (endpoint.requestBody?.schema) {
    const rules = extractValidationRules(endpoint.requestBody.schema);
    if (rules.length > 0) {
      sections.push(`Validation:\n${rules.map((r) => `- ${r}`).join('\n')}`);
    }
  }

  const success = pickPrimarySuccessResponse(endpoint.responses);
  if (success) {
    const result = buildSchemaExample(success.schema);
    const body = result ? withUnionNotes(result.json, result.unionSizes) : (success.description || 'No content');
    sections.push(`Success Response (${success.status}):\n${body}`);
  }

  const errorLines = buildErrorResponseLines(endpoint.responses);
  if (errorLines.length > 0) {
    sections.push(`Error Responses:\n${errorLines.join('\n')}`);
  }

  return sections.join('\n\n');
}
