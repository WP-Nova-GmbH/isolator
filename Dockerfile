FROM node:24.22.1-bookworm-slim AS base
WORKDIR /app

# Copy package files first, for better Docker layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Builder stage
FROM base AS builder
RUN npm ci
COPY apps/ apps/
RUN npm run build -w api
RUN npm run build -w web

# The API's production dependencies only
FROM base AS installer
RUN npm ci --omit=dev -w api

# Runtime stage
FROM node:24.22.1-bookworm-slim AS runner

ENV NODE_ENV=production
ENV TZ=UTC
ENV WEB_DIR=/app/web
ENV STORAGE_DIR=/data/storage

# Uploads stay here unless S3_BUCKET is set, so this needs a volume.
RUN install -d -o node -g node /data/storage
USER node

COPY --from=installer /app/ /app/
COPY --from=builder /app/apps/web/dist /app/web

WORKDIR /app/apps/api
COPY --from=builder /app/apps/api/dist ./dist
COPY apps/api/drizzle ./drizzle

EXPOSE 3000
HEALTHCHECK --start-period=30s CMD ["node", "-e", "fetch(`http://localhost:${process.env.PORT ?? 3000}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Migrates before starting, because the API reads its tables as it boots.
CMD ["sh", "-c", "node dist/src/db/migrate.js && node dist/src/db/seed.js && exec node dist/src/main.js"]
