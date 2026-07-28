export { normalizeDocument } from './document-model/normalize';
export {
  STATUS_TEXT,
  buildSchemaExample,
  circularMarker,
  pickPrimarySuccessResponse,
  resolveUnion,
  withUnionNotes,
} from './document-model/example';
export type { SchemaExampleResult } from './document-model/example';
export { capDepth } from './document-model/cap-depth';
export type { CapDepthOptions } from './document-model/cap-depth';
export { operationToAiText } from './transformers/copy-for-ai';
export type {
  DocumentModel,
  Endpoint,
  JSONSchemaLike,
  ParameterInfo,
  RequestBodyInfo,
  ResponseInfo,
  TagGroup,
} from './document-model/types';
