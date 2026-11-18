import { describe, expect, it } from 'vitest';
import { isLoopbackUrl } from './run-contract-tests.js';

describe('isLoopbackUrl()', () => {
  it.each(['http://localhost:3000', 'http://127.0.0.1', 'http://127.10.0.5:8080', 'http://[::1]:3000'])(
    'treats %s as loopback',
    (url) => expect(isLoopbackUrl(url)).toBe(true),
  );

  it.each(['https://api.example.com', 'http://127.0.0.1.evil.com', 'http://10.0.0.1', 'not a url'])(
    'does not treat %s as loopback',
    (url) => expect(isLoopbackUrl(url)).toBe(false),
  );
});
