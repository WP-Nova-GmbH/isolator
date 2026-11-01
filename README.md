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
npm run db:seed:dev   # sample Organization, Members and records to try things with
npm run dev           # api on :3000, web on :5173 (proxies /api)
```

Schema changes: edit `apps/api/src/db/schema.ts`, then `npm run db:generate` and `npm run db:migrate`.

`npm test` runs against a separate `isolator_test` database on the same Postgres, so it needs `npm run db:up`.

Uploaded files go to `apps/api/storage` by default. Set `S3_BUCKET` in `apps/api/.env` to store new files in S3 or an S3-compatible service instead; [.env.example](apps/api/.env.example) lists the settings. Files already stored stay readable where they are. To try it locally, `docker compose --profile s3 up -d minio` starts MinIO, and setting `TEST_S3_ENDPOINT=http://localhost:9000` makes `npm test` include the S3 test.

To scan uploads for viruses, set `CLAMAV_HOST`. Isolator then refuses an infected file, and refuses every upload if the scanner can't be reached. `docker compose --profile clamav up -d clamav` starts ClamAV locally; it takes a few minutes to load its signatures.

### Signing in

`npm run db:seed:dev` creates three people to sign in as; their emails and password are at the top of [seed-dev.ts](apps/api/src/db/seed-dev.ts). Anna Keller is the Operator.

A new install has nobody to sign in as, so the app opens on Claim. The setup token for it is in the API's logs, and it changes each time the API starts. Whoever claims the install becomes its Operator and creates its Organizations.

Isolator sends no email. Invitations are links you pass on yourself, and whoever runs the server resets a forgotten password:

```sh
npm run auth:reset-password -w api -- someone@example.com
```

## Production

One container serves the API and the web app on port 3000, so both share an address, which sign-in needs because it uses a cookie. Postgres runs outside the container.

Build the image, then publish it to the registry set in `scripts/.env`:

```sh
cp scripts/.env.example scripts/.env
npm run create-docker-image             # for this machine, to try it locally
npm run create-docker-image -- --push   # publishes amd64 and arm64
```

The image is tagged `latest` and with `version` from `package.json`. Publishing the same version again replaces it, so run `npm version patch` first.

To run it, put the settings in a file. `BETTER_AUTH_URL` is the address people open Isolator at, and changing `BETTER_AUTH_SECRET` signs everyone out. [.env.example](apps/api/.env.example) lists the optional S3 and ClamAV settings.

```sh
# isolator.env
DATABASE_URL=postgres://isolator:password@db.example.com:5432/isolator?sslmode=require
BETTER_AUTH_URL=https://isolator.example.com
BETTER_AUTH_SECRET=   # openssl rand -base64 32
```

```sh
docker run -d --name isolator --restart unless-stopped \
  --env-file isolator.env \
  -p 127.0.0.1:3000:3000 \
  -v isolator_storage:/data/storage \
  wp-containerz.cr.de-fra.ionos.com/isolator:0.1.0
```

- Put it behind a proxy that handles HTTPS and sets `X-Forwarded-For`, which the sign-in rate limit reads.
- Each start migrates the database and loads the control catalog before the API starts. Run one container at a time.
- Uploads stay in `/data/storage`, so keep that volume and back it up, or set `S3_BUCKET`.
- `docker logs isolator` shows the setup token until the install is claimed.
- To reset a password: `docker exec isolator node dist/src/auth/reset-password.js someone@example.com`

See [ADR 0004](docs/adr/0004-self-hostable-with-own-auth.md).

## License

MIT, see [LICENSE](LICENSE). ISO control references and English control titles are excluded.
