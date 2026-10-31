# Isolator

Self-hosted ISMS for mid-sized businesses going for their first ISO/IEC 27001:2022 certificate and keeping it afterwards: risks, assets, suppliers, the Statement of Applicability, documents, evidence and audit preparation. Every step works by hand, and automated scans and AI come later.

See [docs/roadmap.md](docs/roadmap.md) for scope and phases, [CONTEXT.md](CONTEXT.md) for domain context, [docs/design-system.md](docs/design-system.md) for the logo, tokens and UI rules.

## Layout

```
apps/api   NestJS + Drizzle + Postgres
apps/web   React + Vite + React Router + Tailwind + shadcn/ui
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

## License

MIT, see [LICENSE](LICENSE). ISO control references and English control titles are excluded.
