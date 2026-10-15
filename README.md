# TFG-PGIM

Plataforma web de gestión de restaurantes multi-sucursal: reservas, pedidos, pagos con Mercado Pago, fidelización, stock por recetas, menú con realidad aumentada y simulador de apertura.

## Stack

TypeScript en todo el monorepo (npm workspaces):

- `apps/web`: React, Vite y Tailwind CSS.
- `apps/api`: Node.js, Express, Prisma (PostgreSQL) y Socket.IO.
- `packages/shared`: tipos, esquemas zod y constantes compartidos.
- `docs/modelos`: diagramas UML y DER versionados.

## Requisitos

- Node.js 22 (ver `.nvmrc`).
- Docker, para la base de datos de desarrollo.

## Puesta en marcha

```bash
cp apps/api/.env.example apps/api/.env
npm install
npm run db:up
npm run dev
```

La web queda en http://localhost:5173 y la API en http://localhost:3000.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Levanta shared (watch), API y web |
| `npm run build` | Compila los tres paquetes |
| `npm test` | Corre los tests (Jest y Supertest) |
| `npm run typecheck` | Verifica tipos en todo el monorepo |
| `npm run format` | Formatea con Prettier |
| `npm run db:up` / `db:down` | Levanta o baja PostgreSQL en Docker |
| `npm run db:migrate -w @pgim/api` | Aplica migraciones de Prisma |
