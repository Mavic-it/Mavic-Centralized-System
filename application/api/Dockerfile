# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
# Native argon2 fallback compilation; tooling never enters the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY application/web/package.json application/web/package.json
COPY application/client-booking/package.json application/client-booking/package.json
COPY application/api/package.json application/api/package.json
RUN npm ci --workspace api --include-workspace-root=false --no-audit --no-fund

FROM dependencies AS build
COPY application/api application/api
RUN npm run build --workspace api
RUN npm prune --omit=dev --workspace api --include-workspace-root=false --no-audit --no-fund
RUN mkdir -p application/api/node_modules

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=4000 DB_SYNCHRONIZE=false DB_MIGRATIONS_RUN=false
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/application/api/package.json ./application/api/package.json
COPY --from=build --chown=node:node /app/application/api/dist ./application/api/dist
# Preserve any workspace-local production dependencies as well as hoisted ones.
COPY --from=build --chown=node:node /app/application/api/node_modules ./application/api/node_modules
WORKDIR /app/application/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]

