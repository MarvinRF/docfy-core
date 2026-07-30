import type { DocumentModel, Endpoint, ParameterInfo, ResponseInfo } from './types.js';

export type ChangeSeverity = 'breaking' | 'info';

export interface FieldChange {
  description: string;
  severity: ChangeSeverity;
}

export interface ChangedEndpoint {
  method: string;
  path: string;
  changes: FieldChange[];
}

export interface SpecDiff {
  added: Endpoint[];
  removed: Endpoint[];
  changed: ChangedEndpoint[];
}

function endpointKey(endpoint: Pick<Endpoint, 'method' | 'path'>): string {
  return `${endpoint.method} ${endpoint.path}`;
}

/**
 * `tagGroups` repeats an endpoint under every tag it declares, so a flat
 * list must dedupe by method+path — a Map naturally does this (same
 * endpoint, same content, last write wins).
 */
function indexEndpoints(model: DocumentModel): Map<string, Endpoint> {
  const index = new Map<string, Endpoint>();
  for (const group of model.tagGroups) {
    for (const endpoint of group.endpoints) {
      index.set(endpointKey(endpoint), endpoint);
    }
  }
  return index;
}

function diffParameters(oldParams: ParameterInfo[], newParams: ParameterInfo[]): FieldChange[] {
  const changes: FieldChange[] = [];
  const oldByName = new Map(oldParams.map((p) => [`${p.in}:${p.name}`, p]));
  const newByName = new Map(newParams.map((p) => [`${p.in}:${p.name}`, p]));

  for (const [key, param] of newByName) {
    const before = oldByName.get(key);
    if (!before) {
      changes.push({
        description: `new ${param.required ? 'required' : 'optional'} parameter "${param.name}" (${param.in})`,
        severity: param.required ? 'breaking' : 'info',
      });
    } else if (!before.required && param.required) {
      changes.push({
        description: `parameter "${param.name}" (${param.in}) is now required`,
        severity: 'breaking',
      });
    }
  }

  for (const [key, param] of oldByName) {
    if (!newByName.has(key)) {
      changes.push({
        description: `parameter "${param.name}" (${param.in}) was removed`,
        severity: 'info',
      });
    }
  }

  return changes;
}

function diffRequestBody(oldEndpoint: Endpoint, newEndpoint: Endpoint): FieldChange[] {
  const before = oldEndpoint.requestBody;
  const after = newEndpoint.requestBody;

  if (!before && after?.required) {
    return [{ description: 'request body is now required', severity: 'breaking' }];
  }
  if (before && !before.required && after?.required) {
    return [{ description: 'request body is now required', severity: 'breaking' }];
  }
  if (before && !after) {
    return [{ description: 'request body was removed', severity: 'info' }];
  }
  return [];
}

function diffResponses(oldResponses: ResponseInfo[], newResponses: ResponseInfo[]): FieldChange[] {
  const changes: FieldChange[] = [];
  const oldStatuses = new Set(oldResponses.map((r) => r.status));
  const newStatuses = new Set(newResponses.map((r) => r.status));

  for (const status of oldStatuses) {
    if (!newStatuses.has(status)) {
      const isSuccess = status.startsWith('2');
      changes.push({
        description: `response "${status}" was removed`,
        severity: isSuccess ? 'breaking' : 'info',
      });
    }
  }

  for (const status of newStatuses) {
    if (!oldStatuses.has(status)) {
      changes.push({ description: `new response "${status}" documented`, severity: 'info' });
    }
  }

  return changes;
}

/**
 * Compares two normalized OpenAPI documents and reports what changed,
 * flagging each difference as `breaking` (a client built against the old
 * spec could now fail) or `info` (additive/non-breaking). Deliberately
 * shallow: it looks at endpoint presence, parameter presence/required-ness,
 * request body required-ness, and response status codes — it does not
 * diff schema shapes field-by-field.
 */
export function diffDocuments(oldModel: DocumentModel, newModel: DocumentModel): SpecDiff {
  const oldIndex = indexEndpoints(oldModel);
  const newIndex = indexEndpoints(newModel);

  const added: Endpoint[] = [];
  const removed: Endpoint[] = [];
  const changed: ChangedEndpoint[] = [];

  for (const [key, endpoint] of newIndex) {
    if (!oldIndex.has(key)) added.push(endpoint);
  }

  for (const [key, endpoint] of oldIndex) {
    if (!newIndex.has(key)) removed.push(endpoint);
  }

  for (const [key, oldEndpoint] of oldIndex) {
    const newEndpoint = newIndex.get(key);
    if (!newEndpoint) continue;

    const changes = [
      ...diffParameters(oldEndpoint.parameters, newEndpoint.parameters),
      ...diffRequestBody(oldEndpoint, newEndpoint),
      ...diffResponses(oldEndpoint.responses, newEndpoint.responses),
    ];

    if (changes.length > 0) {
      changed.push({ method: oldEndpoint.method, path: oldEndpoint.path, changes });
    }
  }

  return { added, removed, changed };
}
