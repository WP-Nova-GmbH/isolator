# Isolator

Platform that carries a business through its ISO/IEC 27001:2022 transition and keeps the ISMS running afterwards: risk management, automated system scans, AI-assisted recurring risk assessments, and certification-audit preparation.

See [docs/roadmap.md](docs/roadmap.md) for scope and phases, [CONTEXT.md](CONTEXT.md) for domain context.

## Layout

```
apps/api   NestJS + Drizzle + Postgres
apps/web   React + Vite + React Router + Tailwind
packages/  shared code (empty for now)
docs/adr   architecture decision records
```

## Getting started

```sh
nvm use               # Node 24
npm install
cp apps/api/.env.example apps/api/.env
npm run db:up         # Postgres on localhost:5440
npm run db:migrate
npm run db:seed       # Annex A 2022 control catalog
npm run dev           # api on :3000, web on :5173 (proxies /api)
```

Schema changes: edit `apps/api/src/db/schema.ts`, then `npm run db:generate` and `npm run db:migrate`.
