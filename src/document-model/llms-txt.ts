import type { DocumentModel, Endpoint } from './types.js';
import { operationToAiText } from '../transformers/copy-for-ai.js';

export interface LlmsTxtOptions {
  /** Overrides `document.info.title`. */
  title?: string;
  /** Overrides `document.info.description`. */
  description?: string;
  /**
   * Base URL each endpoint entry links to, e.g. `https://api.example.com/docs` or `/docs` —
   * matches the `mountPath` passed to `DocfyUiModule.setup()`. Per-endpoint slugs mirror
   * `docfy-ui`'s own route scheme (`EndpointRoute.tsx`: `:tag/:operationId`, falling back to
   * `${method}-${path}` when `operationId` is undefined) — kept in sync by hand since the two
   * packages don't share a routing module. Omit to list endpoints as plain text, no links.
   */
  docsBaseUrl?: string;
}

/** Mirrors `docfy-ui`'s `EndpointRoute.tsx` slug logic exactly — see `docsBaseUrl` above. */
function endpointHref(docsBaseUrl: string, tag: string, endpoint: Endpoint): string {
  const opSlug = endpoint.operationId ?? `${endpoint.method}-${endpoint.path}`;
  const base = docsBaseUrl.replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(tag)}/${encodeURIComponent(opSlug)}`;
}

function header(document: DocumentModel, options: LlmsTxtOptions): string[] {
  const title = options.title ?? document.info.title;
  const description = options.description ?? document.info.description;
  const lines = [`# ${title}`];
  if (description) lines.push('', `> ${description}`);
  return lines;
}

/**
 * Serializes the document model into the `llms.txt` convention (llmstxt.org): an H1 title, an
 * optional blockquote summary, then one H2 section per tag group listing its endpoints as
 * markdown bullets. Built for the same reason `docfy-mcp`'s `list_endpoints` tool exists — so
 * an agent can discover an API's shape — but reachable with a plain `curl`/`fetch`, no MCP
 * server required. Endpoints with no tag (the synthetic "Default" group) are included too.
 */
export function buildLlmsTxt(document: DocumentModel, options: LlmsTxtOptions = {}): string {
  const lines = header(document, options);

  for (const group of document.tagGroups) {
    if (group.endpoints.length === 0) continue;
    lines.push('', `## ${group.name}`);
    for (const endpoint of group.endpoints) {
      const label = `${endpoint.method} ${endpoint.path}`;
      const summary = endpoint.summary ? `: ${endpoint.summary}` : '';
      const entry = options.docsBaseUrl
        ? `[${label}](${endpointHref(options.docsBaseUrl, group.name, endpoint)})`
        : label;
      lines.push(`- ${entry}${summary}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

/**
 * The `llms-full.txt` variant: same header, but each endpoint is expanded inline to its full
 * "Copy for AI" text (`operationToAiText()`) instead of a one-line bullet — the same content
 * `docfy-mcp`'s `get_endpoint` tool returns per call, all in one document.
 */
export function buildLlmsFullTxt(document: DocumentModel, options: LlmsTxtOptions = {}): string {
  const lines = header(document, options);

  for (const group of document.tagGroups) {
    if (group.endpoints.length === 0) continue;
    lines.push('', `## ${group.name}`);
    for (const endpoint of group.endpoints) {
      lines.push('', operationToAiText(endpoint));
    }
  }

  return `${lines.join('\n')}\n`;
}
