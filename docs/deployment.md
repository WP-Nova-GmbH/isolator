# Deploying Isolator

This guide runs Isolator on one Linux server. One container holds the API and the web app, Caddy in front of it handles HTTPS, and Postgres runs elsewhere. Uploaded files stay on a Docker volume unless you configure S3.

```
browser ── HTTPS ──> Caddy ──> isolator container ──> your Postgres
                                       │
                                       └── /data/storage volume, or S3
```

## What you need

- A Linux server with Docker and Docker Compose. 1 vCPU and 2 GB of RAM are plenty, because Isolator uses about 200 MB. Virus scanning needs more, see [below](#virus-scanning).
- Postgres 17 that the server can reach.
- A domain pointing at the server, with ports 80 and 443 open.
- Access to the image. WP Nova publishes it to `wp-containerz.cr.de-fra.ionos.com/isolator`, which needs a token with pull access. Without one, [build your own](#build-your-own-image).

## 1. Prepare Postgres

Create a role and a database that it owns. Isolator needs no superuser and no extensions.

```sql
CREATE ROLE isolator LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE isolator OWNER isolator;
```

Allow connections from the server's address only, and use TLS if the connection leaves a private network.

## 2. Set up the server

Log in to the registry, then create a folder for the three files below.

```sh
docker login wp-containerz.cr.de-fra.ionos.com
sudo mkdir -p /opt/isolator
cd /opt/isolator
```

**`isolator.env`** holds the settings. Create it with `install -m 600 /dev/null isolator.env`, because it contains secrets.

```sh
DATABASE_URL=postgres://isolator:choose-a-password@db.example.com:5432/isolator?sslmode=verify-full
BETTER_AUTH_URL=https://isolator.example.com
BETTER_AUTH_SECRET=paste-the-output-of-openssl-rand-hex-32
```

| Setting | Meaning |
| --- | --- |
| `DATABASE_URL` | Percent-encode any special characters in the password. |
| `BETTER_AUTH_URL` | The exact address people open, with `https://` and no trailing slash. |
| `BETTER_AUTH_SECRET` | Generate it with `openssl rand -hex 32` and keep it. Changing it signs everyone out. |

For `sslmode`, use one of these:

- `verify-full` encrypts the connection and checks the certificate. If your database uses a private certificate authority, see [Private database certificates](#private-database-certificates).
- `require` encrypts the connection but accepts any certificate.
- Leave `sslmode` out only on a private network you trust, because the connection is then unencrypted.

**`Caddyfile`** configures HTTPS. Caddy gets the certificate by itself.

```caddyfile
isolator.example.com {
	reverse_proxy isolator:3000

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "same-origin"
		Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
	}
}
```

**`compose.yaml`** starts the containers. Pin a version here rather than `latest`, so a restart never changes what runs.

```yaml
services:
  isolator:
    image: wp-containerz.cr.de-fra.ionos.com/isolator:0.1.0
    restart: unless-stopped
    env_file: isolator.env
    volumes:
      - storage:/data/storage

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data

  clamav:
    image: clamav/clamav:1.4
    platform: linux/amd64
    profiles: [clamav]
    restart: unless-stopped
    volumes:
      - clamav_db:/var/lib/clamav

volumes:
  storage:
  caddy_data:
  clamav_db:
```

Port 3000 stays inside Docker, so nothing reaches Isolator except through Caddy. Run one `isolator` container at a time: the setup token, the sign-in rate limit and local uploads aren't shared between containers.

## 3. Start it and claim the install

```sh
docker compose up -d
docker compose logs isolator
```

Each start migrates the database and loads the control catalog before the API starts. `docker compose ps` shows `healthy` about 30 seconds later.

Until someone claims the install, the logs show a setup token, which changes on every restart. Whoever enters it becomes the Operator, so do this straight away:

1. Open your address. Isolator shows Claim.
2. Enter the setup token, your name, your email and a password of at least 12 characters.
3. Create the first Organization, then open the invitation link it shows you.

Isolator sends no email, so you pass on invitation links yourself. Each link works once, for 7 days.

## 4. Check it

- `https://isolator.example.com` opens with a valid certificate.
- `http://isolator.example.com` redirects to HTTPS.
- `curl -I http://SERVER-IP:3000` from another machine fails to connect.
- You can upload a file on a Supplier, and download it again.
- `docker compose logs isolator` doesn't say `Rate limiting could not determine a client IP`.

## Upgrading

Migrations only run forward, so back up first.

1. [Back up](#backups) the database and the files.
2. Change the image version in `compose.yaml`.
3. Pull the image and start it:

```sh
docker compose pull isolator
docker compose up -d isolator
docker compose logs isolator
```

The site is down for a few seconds. To go back, restore the backup and set the old version again. The old version can't run on a database that newer migrations changed.

## Backups

Back up the database and the files at the same time, because records point at stored files. Isolator doesn't do this for you.

On the Postgres host:

```sh
pg_dump -Fc -U isolator isolator > isolator-$(date +%F).dump
```

In `/opt/isolator`, unless your files are in S3:

```sh
docker compose exec -T isolator tar czf - -C /data/storage . > isolator-files-$(date +%F).tar.gz
```

Also keep a copy of `isolator.env`, and store all of this away from the server. It holds your risk register and Evidence, so treat it as confidential.

To restore, stop Isolator first:

```sh
docker compose stop isolator
```

Then replace the database on the Postgres host, as a superuser:

```sh
dropdb --if-exists isolator
createdb -O isolator isolator
pg_restore -U isolator -d isolator --no-owner isolator-2026-11-02.dump
```

Then put the files back and start Isolator:

```sh
docker compose run --rm -T --no-deps --entrypoint tar isolator xzf - -C /data/storage < isolator-files-2026-11-02.tar.gz
docker compose up -d isolator
```

Sessions survive a restore, so people stay signed in. Try a restore before you rely on it.

## Running it

| To | Do this |
| --- | --- |
| See logs | `docker compose logs -f isolator` |
| Check it's up | `GET /api/health`, which also checks the database |
| Reset a forgotten password | `docker compose exec isolator node dist/src/auth/reset-password.js someone@example.com` |

A password reset prints the new password and signs that person out everywhere.

### S3 file storage

Add these to `isolator.env` and run `docker compose up -d isolator`:

```sh
S3_BUCKET=isolator
S3_REGION=eu-central-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
# For an S3-compatible service:
# S3_ENDPOINT=https://fsn1.your-objectstorage.com
# S3_FORCE_PATH_STYLE=true
```

New files go to S3. Files already on the volume stay readable, so keep the volume and its backup. If you later remove `S3_BUCKET`, files in S3 show an error until you set it again.

### Virus scanning

Add these to `isolator.env`:

```sh
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
```

```sh
docker compose --profile clamav up -d
```

ClamAV's documentation asks for at least 3 GiB of RAM of its own, and its image is amd64 only. Isolator refuses every upload while it can't reach the scanner, including while ClamAV loads its signatures after each start, which can take a few minutes. It also refuses infected files, and records that in the Audit trail.

### Private database certificates

If `verify-full` fails with `unable to verify the first certificate`, give Isolator your certificate authority. Put the certificate next to `compose.yaml` and add this to the `isolator` service:

```yaml
    environment:
      NODE_EXTRA_CA_CERTS: /certs/db-ca.pem
    volumes:
      - storage:/data/storage
      - ./db-ca.pem:/certs/db-ca.pem:ro
```

The host name in `DATABASE_URL` must match the database's certificate.

## Using another proxy

Remove the `caddy` service, publish `127.0.0.1:3000:3000` on `isolator`, and point your proxy there. The proxy must:

- Serve HTTPS at the address in `BETTER_AUTH_URL`, and pass the `Host` header on.
- Set `X-Forwarded-For` to exactly one address, the client's, replacing whatever came in. On nginx, that's `proxy_set_header X-Forwarded-For $remote_addr;`. If the header is missing or holds a list, Isolator can't tell clients apart, and everyone shares one limit of 3 sign-ins every 10 seconds.
- Allow request bodies of at least 26 MB. Uploads go up to 25 MB, and nginx allows only 1 MB by default.
- Add the security headers from the `Caddyfile` above. Isolator doesn't set them itself.

A CDN in front of your proxy doesn't work well yet, because the proxy sees the CDN's address instead of the client's, so many people share one limit.

## Publishing a new version

On a machine with the repository and Docker, logged in to the registry with push access:

```sh
cp scripts/.env.example scripts/.env   # first time only
npm run release
npm run create-docker-image -- --push
```

`npm run release` picks the version from the commits since the last `isolator-*` tag, updates `CHANGELOG.md`, then commits and tags. `fix` raises the patch version, `feat` the minor version, and "breaking change" in a commit body the major version. Other types don't start a release. Use `npm run release -- --releaseAs=patch` to choose, or `--dry-run` to preview.

The second command builds amd64 and arm64, and publishes them as that version and `latest`. Publishing doesn't change any server: [upgrade](#upgrading) each one yourself. Publishing the same version again replaces it.

### Build your own image

Without registry access, build on the server from the repository and use that image in `compose.yaml`:

```sh
npm run create-docker-image
```

Leave `DOCKER_REGISTRY` unset and the image is called `isolator:<version>`. `--amd64` or `--arm64` builds for a platform other than your own.

## Troubleshooting

| What you see | What's wrong |
| --- | --- |
| Container keeps restarting, logs say `You are using the default secret` | `BETTER_AUTH_SECRET` is missing from `isolator.env`. |
| Logs say `permission denied for database` | The role doesn't own the database. See [step 1](#1-prepare-postgres). |
| Logs say `unable to verify the first certificate` | See [Private database certificates](#private-database-certificates). |
| Logs say `ERR_TLS_CERT_ALTNAME_INVALID` | The host name in `DATABASE_URL` doesn't match the database's certificate. |
| Signing in fails with `Invalid origin` | `BETTER_AUTH_URL` doesn't match the address in the browser exactly. |
| Sign-in is rate limited for everyone at once, and the logs say `Rate limiting could not determine a client IP` | The proxy isn't setting a single `X-Forwarded-For` address. See [Using another proxy](#using-another-proxy). |
| Every upload fails with `The virus scanner isn't reachable` | `CLAMAV_HOST` is set, but ClamAV isn't running or is still starting. |
| A file says `This file is stored in S3, but this install has no S3 settings` | `S3_BUCKET` was removed. Set it again. |
| Lost the setup token | `docker compose logs isolator` shows it. Restarting prints a new one. |
| Claim doesn't appear | The install is already claimed. The Operator signs in as usual. |

See [ADR 0004](adr/0004-self-hostable-with-own-auth.md) for why it's built this way.
