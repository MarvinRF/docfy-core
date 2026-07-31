# docfy-core

Pure OpenAPI document model — spec normalization, example generator, response
schema validation, and the "Copy for AI"/`llms.txt` transformers — extracted
from `docfy-ui`, with no React/DOM dependencies. Consumed by
[`docfy-ui`](../docfy-ui), [`docfy-mcp`](../docfy-mcp), and
[`nest-docfy`](../nest-docfy).

## Install

```bash
npm install docfy-core
```

Ships both an ESM build (`dist/`, the package's `"type": "module"` default)
and a CommonJS build (`dist/cjs/`, via the `exports["."].require` condition)
— `import`/`require()` both resolve correctly regardless of the consuming
project's module system.

## Usage

```ts
import { normalizeDocument, operationToAiText } from 'docfy-core';

const document = await normalizeDocument(rawOpenApiSpec);
const endpoint = document.tagGroups[0].endpoints[0];
const aiText = operationToAiText(endpoint);
```

### Validating a live response against its declared schema

```ts
import { validateAgainstSchema } from 'docfy-core';

const mismatches = validateAgainstSchema(endpoint.responses[0].schema, liveResponseBody);
// [] when it matches; otherwise [{ path: 'body.name', message: 'required property missing' }, ...]
```

Structural only (no `pattern`/`format`/numeric bounds, no `$ref` resolution
since `normalizeDocument()` already dereferences everything) — built to catch
drift (missing/renamed fields, wrong types) at request time, the same class
of bug `diffDocuments()` catches between two specs.

### `llms.txt` / `llms-full.txt`

```ts
import { buildLlmsTxt, buildLlmsFullTxt } from 'docfy-core';

buildLlmsTxt(document, { docsBaseUrl: 'https://api.example.com/docs' });
// # My API
//
// ## Users
// - [GET /users](https://api.example.com/docs/Users/listUsers): List all users

buildLlmsFullTxt(document); // same header, each endpoint expanded to its full "Copy for AI" text
```

Serializes the document model into the [llms.txt](https://llmstxt.org)
convention — lets an agent discover an API's shape with a plain `curl`, no
MCP server required. `nest-docfy`'s `DocfyUiModule.setup({ llmsTxt: ... })`
serves both routes automatically.

### `uniqueEndpoints()`

```ts
import { uniqueEndpoints } from 'docfy-core';

for (const endpoint of uniqueEndpoints(document)) { /* ... */ }
```

Flattens `document.tagGroups` into one entry per endpoint, deduplicated by
`method path` — an endpoint declared under multiple `tags` appears once per
tag group by design, so anything acting on each real endpoint exactly once
(a mock route, a contract test) should use this instead of
`tagGroups.flatMap(...)`.

## Scripts

- `npm run build` — compiles both the ESM (`dist/`) and CJS (`dist/cjs/`) outputs
- `npm test` — runs the test suite (vitest)
- `npm run typecheck` — `tsc --noEmit`
