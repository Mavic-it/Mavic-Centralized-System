# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY application/web/package.json application/web/package.json
COPY application/client-booking/package.json application/client-booking/package.json
COPY application/api/package.json application/api/package.json
RUN npm ci --workspace client-booking --include-workspace-root=false --no-audit --no-fund

FROM dependencies AS build
COPY application/client-booking application/client-booking
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_BASE_URL=http://api:4000
ENV API_BASE_URL=$API_BASE_URL
RUN npm run build --workspace client-booking

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3005
COPY --from=build --chown=node:node /app/application/client-booking/.next/standalone ./
COPY --from=build --chown=node:node /app/application/client-booking/.next/static ./application/client-booking/.next/static
COPY --from=build --chown=node:node /app/application/client-booking/public ./application/client-booking/public
USER node
EXPOSE 3005
CMD ["node", "application/client-booking/server.js"]

