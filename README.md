# Isolator

Self-hosted ISMS for mid-sized businesses going for their first ISO/IEC 27001:2022 certificate and keeping it afterwards: risks, assets, suppliers, the Statement of Applicability, documents, evidence and audit preparation. Every step works by hand, and automated scans and AI come later.

See [docs/roadmap.md](docs/roadmap.md) for scope and phases, [CONTEXT.md](CONTEXT.md) for domain context, [docs/design-system.md](docs/design-system.md) for the logo, tokens and UI rules, [docs/deployment.md](docs/deployment.md) to run it in production.

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
npx clerk@latest auth login
npx clerk@latest link                            # choose the Isolator application
npx clerk@latest env pull --file apps/api/.env   # Clerk development keys
npm run db:up         # Postgres on localhost:5440
npm run db:migrate
npm run db:seed       # Annex A 2022 control catalog
npm run db:seed:dev   # sample Organization, Members and records to try things with
npm run dev           # api on :3000, web on :5173 (proxies /api)
```

Schema changes: edit `apps/api/src/db/schema.ts`, then `npm run db:generate` and `npm run db:migrate`.

`npm test` runs against a separate `isolator_test` database on the same Postgres, so it needs `npm run db:up`.

Uploaded files go to `apps/api/storage` by default. Set `S3_BUCKET` in `apps/api/.env` to store new files in S3 or an S3-compatible service instead; [.env.example](apps/api/.env.example) lists the settings. Files already stored stay readable where they are. To try it locally, `docker compose --profile s3 up -d minio` starts MinIO, and setting `TEST_S3_ENDPOINT=http://localhost:9000` makes `npm test` include the S3 test.

To scan uploads for viruses, set `CLAMAV_HOST`. Isolator then refuses an infected file, and refuses every upload if the scanner can't be reached. `docker compose --profile clamav up -d clamav` starts ClamAV locally; it takes a few minutes to load its signatures.

### Signing in

Sign-in runs on Clerk. `npm run db:seed:dev` creates three people, with the emails at the top of [seed-dev.ts](apps/api/src/db/seed-dev.ts). These are Clerk test addresses: sign up with one and enter `424242` as the verification code. Anna Keller is the Operator.

A new install has nobody to sign in as, so the app opens on Claim. Sign in, then enter the setup token from the API's logs, which changes each time the API starts. Whoever claims the install becomes its Operator and creates its Organizations.

Invitations are links you pass on yourself. A Clerk account alone opens no Organization. People manage their name, email and password from the menu on their avatar, and a change reaches Isolator the next time they sign in.

## Production

One container serves the API and the web app, and Postgres runs outside it. [docs/deployment.md](docs/deployment.md) covers setting up a server, upgrading, backups and publishing a new version.

## License

MIT, see [LICENSE](LICENSE). ISO control references and English control titles are excluded, see [NOTICE](NOTICE).
