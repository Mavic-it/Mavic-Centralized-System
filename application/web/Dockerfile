# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY application/web/package.json application/web/package.json
COPY application/client-booking/package.json application/client-booking/package.json
COPY application/api/package.json application/api/package.json
RUN npm ci --workspace web --include-workspace-root=false --include=dev --include=optional --no-audit --no-fund
RUN node -e "const r = require('node:module').createRequire('/app/application/web/package.json'); console.log('Admin build dependencies verified:', r('vitest/package.json').version, r('typescript/package.json').version); r.resolve('vitest/config');"
# Load the actual Linux binding before Next.js processes any CSS.
RUN node -e "const assert = require('node:assert/strict'); const r = require('node:module').createRequire('/app/application/web/package.json'); const oxide = r('@tailwindcss/oxide/package.json'); const native = '@tailwindcss/oxide-linux-x64-gnu'; assert.equal(r(native + '/package.json').version, oxide.version); r(native); r('@tailwindcss/oxide'); r('@tailwindcss/postcss'); console.log('Tailwind Linux native binding verified:', r.resolve(native), oxide.version);"

FROM dependencies AS build
COPY application/web application/web
ENV NEXT_TELEMETRY_DISABLED=1
# AUTH_API_URL is supplied at runtime by the Compose admin service.
RUN npm run build --workspace web

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/application/web/.next/standalone ./
COPY --from=build --chown=node:node /app/application/web/.next/static ./application/web/.next/static
COPY --from=build --chown=node:node /app/application/web/public ./application/web/public
USER node
EXPOSE 3000
CMD ["node", "application/web/server.js"]

