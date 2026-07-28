const DEFAULT_MAX_DEPTH = 50;

export interface CapDepthOptions {
  maxDepth?: number;
}

/**
 * Walks a dereferenced OpenAPI schema (or any object graph) and produces a
 * JSON-safe copy: cycles become `"[Circular]"` and anything past `maxDepth`
 * becomes `"[Object]"`/`"[Array]"`.
 *
 * Needed because `SwaggerParser.dereference()` resolves `$ref` into real
 * object identity — a recursive DTO (`User.parent: User`) becomes an actual
 * cycle, which `JSON.stringify` cannot serialize. Cycle detection uses the
 * current ancestor chain, not a global "seen" set: the same dereferenced
 * object can legitimately appear in multiple sibling branches (e.g.
 * `createdBy: User` and `updatedBy: User`) without being circular — only
 * an object appearing in its own chain of parents is a real cycle.
 */
export function capDepth(value: unknown, options: CapDepthOptions = {}): unknown {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const ancestors = new Set<object>();

  function walk(node: unknown, depth: number): unknown {
    if (node === null || typeof node !== 'object') return node;

    if (ancestors.has(node)) return '[Circular]';
    if (depth >= maxDepth) return Array.isArray(node) ? '[Array]' : '[Object]';

    ancestors.add(node);
    try {
      if (Array.isArray(node)) {
        return node.map((item) => walk(item, depth + 1));
      }
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
        result[key] = walk(val, depth + 1);
      }
      return result;
    } finally {
      ancestors.delete(node);
    }
  }

  return walk(value, 0);
}
