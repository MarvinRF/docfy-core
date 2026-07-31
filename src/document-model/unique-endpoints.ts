import type { DocumentModel, Endpoint } from './types.js';

/**
 * Flattens `document.tagGroups` into one entry per endpoint, deduplicated by `method path`. An
 * endpoint declared with multiple `tags` appears once per tag group by design (see
 * `normalize.ts`) — callers that need to act on each real endpoint exactly once (registering a
 * mock route, running a contract test) should use this instead of `tagGroups.flatMap(...)`.
 */
export function uniqueEndpoints(document: DocumentModel): Endpoint[] {
  const byKey = new Map<string, Endpoint>();
  for (const group of document.tagGroups) {
    for (const endpoint of group.endpoints) {
      byKey.set(`${endpoint.method} ${endpoint.path}`, endpoint);
    }
  }
  return [...byKey.values()];
}
