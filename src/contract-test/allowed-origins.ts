/**
 * Builds the set of origins `runContractTests()`'s `restrictToServers` guard (and any other
 * caller doing the same SSRF-style check, e.g. docfy-mcp's `diff_specs`/`load-spec.ts`) is
 * permitted to target. Distinct from nest-docfy's `proxy-handler.ts` copy, which takes raw
 * `{ url: string }[]` server objects plus a user-declared `additional` allowlist for a
 * different concern (same-origin CORS-proxy forwarding for "Try it out") — not a drop-in
 * replacement for that one.
 */
export function buildAllowedOrigins(servers: string[]): Set<string> {
  const origins = new Set<string>();
  for (const url of servers) {
    try {
      origins.add(new URL(url).origin);
    } catch {
      // Relative or malformed server URL — no safe base to resolve it against, skip.
    }
  }
  return origins;
}

/** True if `targetUrl`'s origin is in `allowed`. False (not thrown) for a malformed `targetUrl` — the caller decides how to report that. */
export function isOriginAllowed(targetUrl: string, allowed: Set<string>): boolean {
  try {
    return allowed.has(new URL(targetUrl).origin);
  } catch {
    return false;
  }
}
