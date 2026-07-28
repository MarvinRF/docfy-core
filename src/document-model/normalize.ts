import SwaggerParser from '@apidevtools/swagger-parser';
import type {
  DocumentModel,
  Endpoint,
  ParameterInfo,
  RequestBodyInfo,
  ResponseInfo,
  TagGroup,
} from './types';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
const DEFAULT_TAG = 'Default';
const JSON_CONTENT_TYPE_PREFERENCE = ['application/json'];

type RawSpec = Record<string, any>;

function pickContent(content: Record<string, any> | undefined): { contentType: string; schema: Record<string, unknown> | undefined } | undefined {
  if (!content) return undefined;
  const keys = Object.keys(content);
  if (keys.length === 0) return undefined;

  const preferred = JSON_CONTENT_TYPE_PREFERENCE.find((ct) => keys.includes(ct));
  const contentType = preferred ?? keys[0];
  return { contentType, schema: content[contentType]?.schema };
}

function buildParameters(rawParams: any[] | undefined): ParameterInfo[] {
  if (!rawParams) return [];
  return rawParams.map((p) => ({
    name: p.name,
    in: p.in,
    required: Boolean(p.required),
    schema: p.schema,
    description: p.description,
  }));
}

function buildRequestBody(rawRequestBody: any | undefined): RequestBodyInfo | undefined {
  if (!rawRequestBody) return undefined;
  const picked = pickContent(rawRequestBody.content);
  if (!picked) return undefined;
  return {
    required: Boolean(rawRequestBody.required),
    contentType: picked.contentType,
    schema: picked.schema,
  };
}

function buildResponses(rawResponses: Record<string, any> | undefined): ResponseInfo[] {
  if (!rawResponses) return [];
  return Object.entries(rawResponses).map(([status, value]) => {
    const picked = pickContent(value?.content);
    return {
      status,
      description: value?.description,
      contentType: picked?.contentType,
      schema: picked?.schema,
    };
  });
}

/**
 * Returns tag names in the order the sidebar should display them:
 * 1. Tags declared in the top-level `tags` array, in that order.
 * 2. Any tag used by an operation but not declared at top level, in the
 *    order it's first encountered while walking `paths`.
 * 3. A synthetic "Default" group, last, for operations with no tags at all.
 */
function getOrderedTagNames(spec: RawSpec): string[] {
  const declared: string[] = (spec.tags ?? []).map((t: { name: string }) => t.name);
  const seen = new Set(declared);
  const discovered: string[] = [];
  let hasUntagged = false;

  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, any>)[method];
      if (!operation) continue;

      const tags: string[] = operation.tags ?? [];
      if (tags.length === 0) {
        hasUntagged = true;
        continue;
      }
      for (const tag of tags) {
        if (!seen.has(tag)) {
          seen.add(tag);
          discovered.push(tag);
        }
      }
    }
  }

  const ordered = [...declared, ...discovered];
  if (hasUntagged) ordered.push(DEFAULT_TAG);
  return ordered;
}

function getTagDescription(spec: RawSpec, tagName: string): string | undefined {
  const declared = (spec.tags ?? []).find((t: { name: string }) => t.name === tagName);
  return declared?.description;
}

/**
 * Normalizes a raw OpenAPI 3.0/3.1 spec (JSON or already-parsed object)
 * into the in-memory Document Model consumed by the sidebar and detail
 * panel. Dereferences all `$ref`s — see parser-spike.spec.ts for why
 * @apidevtools/swagger-parser was chosen over the alternative considered.
 *
 * Note: dereferencing turns recursive schemas into real object cycles.
 * This function does not break on that (cycles only matter at
 * serialization time) — callers that JSON.stringify a schema from this
 * model must run it through `capDepth()` first.
 */
export async function normalizeDocument(rawSpec: unknown): Promise<DocumentModel> {
  const spec = (await SwaggerParser.dereference(rawSpec as any)) as RawSpec;

  const endpointsByTag = new Map<string, Endpoint[]>();
  for (const tagName of getOrderedTagNames(spec)) {
    endpointsByTag.set(tagName, []);
  }

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, any>)[method];
      if (!operation) continue;

      const tags: string[] = operation.tags?.length ? operation.tags : [DEFAULT_TAG];

      const endpoint: Endpoint = {
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        tags,
        parameters: buildParameters(operation.parameters),
        requestBody: buildRequestBody(operation.requestBody),
        responses: buildResponses(operation.responses),
      };

      for (const tag of tags) {
        if (!endpointsByTag.has(tag)) endpointsByTag.set(tag, []);
        endpointsByTag.get(tag)!.push(endpoint);
      }
    }
  }

  const tagGroups: TagGroup[] = Array.from(endpointsByTag.entries())
    .filter(([, endpoints]) => endpoints.length > 0)
    .map(([name, endpoints]) => ({
      name,
      description: getTagDescription(spec, name),
      endpoints,
    }));

  return {
    info: {
      title: spec.info?.title ?? '',
      version: spec.info?.version ?? '',
      description: spec.info?.description,
    },
    tagGroups,
  };
}
