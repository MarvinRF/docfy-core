# docfy-core

Pure OpenAPI document model — spec normalization, example generator, and
the "Copy for AI" transformer — extracted from `docfy-ui`, with no
React/DOM dependencies. Consumed by [`docfy-ui`](../docfy-ui) and
[`docfy-mcp`](../docfy-mcp).

## Install

```bash
npm install docfy-core
```

## Usage

```ts
import { normalizeDocument, operationToAiText } from 'docfy-core';

const document = await normalizeDocument(rawOpenApiSpec);
const endpoint = document.tagGroups[0].endpoints[0];
const aiText = operationToAiText(endpoint);
```

## Scripts

- `npm run build` — compiles to `dist/` (types + JS)
- `npm test` — runs the test suite (vitest)
- `npm run typecheck` — `tsc --noEmit`
