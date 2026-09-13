# Compra em Casa

PWA mobile-first em português do Brasil para controlar compras domésticas em uma casa compartilhada.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/compra-em-casa/src/App.tsx` — shell, rotas e fluxos da interface.
- `artifacts/compra-em-casa/src/index.css` — tokens visuais, fontes e animações.
- `artifacts/compra-em-casa/public/manifest.webmanifest` e `sw.js` — instalação e cache PWA.
- `lib/api-spec/openapi.yaml` — contrato único da API; regenere os clientes após alterações.
- `lib/db/src/schema/` — tabelas PostgreSQL do produto.
- `artifacts/api-server/src/lib/household-state.ts` — estado agregado da casa e catálogo inicial.
- `artifacts/api-server/src/routes/` — rotas de casas, itens, lista e notas fiscais.

## Architecture decisions

- O código da casa é a identidade compartilhada enviada em `X-House-Code`; não há login obrigatório.
- PostgreSQL é a fonte de verdade quando a casa está conectada; o navegador guarda apenas o código da casa e o cache do PWA.
- O cliente gerado recebe `X-House-Code` via `request.headers` nas opções dos hooks de mutação.
- IDs de catálogo são prefixados por casa na criação para impedir colisões entre famílias.
- Importação fiscal salva a URL mesmo quando a página não pode ser consultada ou só retorna dados parciais.

## Product

- Comprar: lista atual, progresso, filtros, quantidades, marcação de compra e reinício da lista.
- Meus itens: catálogo pesquisável, cadastro, edição, exclusão e adição à lista atual.
- Histórico: registros por data, preço, mercado e origem (lista ou nota fiscal).
- Casa compartilhada: criar/entrar por código `CASA-XXXX` e sincronizar a mesma lista em dois dispositivos.
- Nota fiscal: URL HTTP/HTTPS validada, leitura heurística de mercado/data/total/produtos e câmera com BarcodeDetector quando disponível.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
