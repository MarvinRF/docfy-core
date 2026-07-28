/** Loosely-typed JSON Schema node — we don't re-implement a schema type system, just pass it through. */
export type JSONSchemaLike = Record<string, unknown>;

export interface ParameterInfo {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  schema: JSONSchemaLike | undefined;
  description: string | undefined;
}

export interface RequestBodyInfo {
  required: boolean;
  /** The content type actually selected (application/json preferred, else first available). */
  contentType: string;
  schema: JSONSchemaLike | undefined;
}

export interface ResponseInfo {
  /** "200", "404", "default", etc. */
  status: string;
  description: string | undefined;
  contentType: string | undefined;
  schema: JSONSchemaLike | undefined;
}

export interface Endpoint {
  method: string; // uppercase: "GET", "POST", ...
  path: string;
  operationId: string | undefined;
  summary: string | undefined;
  description: string | undefined;
  tags: string[];
  parameters: ParameterInfo[];
  requestBody: RequestBodyInfo | undefined;
  responses: ResponseInfo[];
}

export interface TagGroup {
  name: string;
  description: string | undefined;
  endpoints: Endpoint[];
}

export interface DocumentModel {
  info: {
    title: string;
    version: string;
    description: string | undefined;
  };
  /** Tags in declared order (from the top-level `tags` array), then any
   * tags used by operations but not declared, in first-appearance order.
   * Operations with no tags fall into a synthetic "Default" group, last. */
  tagGroups: TagGroup[];
}
