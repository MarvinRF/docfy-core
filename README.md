# docfy-core

Document Model puro (normalização de spec OpenAPI + gerador de exemplos +
transformer "Copy for AI") extraído do `docfy-ui`, sem dependências de
React/DOM. Consumido por `docfy-ui` e `docfy-mcp`.

## API

```ts
import { normalizeDocument, operationToAiText } from 'docfy-core';

const document = await normalizeDocument(rawOpenApiSpec);
const endpoint = document.tagGroups[0].endpoints[0];
const aiText = operationToAiText(endpoint);
```

## Scripts

- `npm run build` — compila para `dist/` (tipos + JS)
- `npm test` — roda a suíte (vitest)
- `npm run typecheck` — `tsc --noEmit`
