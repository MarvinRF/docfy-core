export { normalizeDocument } from './document-model/normalize.js';
export {
  STATUS_TEXT,
  buildSchemaExample,
  circularMarker,
  pickPrimarySuccessResponse,
  resolveUnion,
  withUnionNotes,
} from './document-model/example.js';
export type { SchemaExampleResult } from './document-model/example.js';
export { capDepth } from './document-model/cap-depth.js';
export type { CapDepthOptions } from './document-model/cap-depth.js';
export { operationToAiText } from './transformers/copy-for-ai.js';
export type {
  DocumentModel,
  Endpoint,
  JSONSchemaLike,
  ParameterInfo,
  RequestBodyInfo,
  ResponseInfo,
  SecuritySchemeInfo,
  TagGroup,
} from './document-model/types';
export { diffDocuments } from './document-model/diff.js';
export type { ChangeSeverity, ChangedEndpoint, FieldChange, SpecDiff } from './document-model/diff.js';
