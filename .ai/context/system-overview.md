# System Overview

- Repository: `mspaces-system`.
- Workspace manager: Bun workspaces.
- Frontend: protected Next.js application under `application/web`; public client booking Next.js application under `application/client-booking` (port 3005), sharing the existing API and PostgreSQL reservation system.
- Backend: NestJS application under `application/api`.
- Shared libraries belong under `packages`.
- Root commands include `bun run dev:web`, `bun run dev:api`, `bun run build`, and `bun run lint`.
- Keep this document factual and update it when system boundaries change.
