import { describe, it, expect } from 'vitest';
import { buildAllowedOrigins, isOriginAllowed } from './allowed-origins';

describe('buildAllowedOrigins()', () => {
  it('normalizes each server URL down to its origin', () => {
    const allowed = buildAllowedOrigins(['http://localhost:3000/api', 'https://api.example.com/v1/docs']);
    expect(allowed).toEqual(new Set(['http://localhost:3000', 'https://api.example.com']));
  });

  it('skips a malformed/relative server URL instead of throwing', () => {
    const allowed = buildAllowedOrigins(['/relative-path', 'http://localhost:3000']);
    expect(allowed).toEqual(new Set(['http://localhost:3000']));
  });

  it('returns an empty set for no declared servers', () => {
    expect(buildAllowedOrigins([])).toEqual(new Set());
  });
});

describe('isOriginAllowed()', () => {
  it('is true when the target origin is in the allowed set', () => {
    const allowed = new Set(['http://localhost:3000']);
    expect(isOriginAllowed('http://localhost:3000/docs-json', allowed)).toBe(true);
  });

  it('is false when the target origin is not in the allowed set', () => {
    const allowed = new Set(['http://localhost:3000']);
    expect(isOriginAllowed('http://169.254.169.254/latest/meta-data', allowed)).toBe(false);
  });

  it('is false for a malformed target URL rather than throwing', () => {
    expect(isOriginAllowed('not-a-url', new Set(['http://localhost:3000']))).toBe(false);
  });

  it('is false against an empty allowed set', () => {
    expect(isOriginAllowed('http://localhost:3000', new Set())).toBe(false);
  });
});
