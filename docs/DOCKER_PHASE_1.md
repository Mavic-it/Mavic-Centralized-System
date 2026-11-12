# MAVIC Docker build validation — Phase 1

Implemented 2026-11-12. GitHub builds and validates three application images; it does not publish images, deploy, start application servers, run migrations, or provision a database. Docker Desktop is not required on the development laptop.

## Repository inventory

| Application | Workspace | Build | Container port |
| --- | --- | --- | --- |
| MAVIC Admin | `application/web` (`web`) | `next build` | 3000 |
| MAVIC Client Reservation | `application/client-booking` (`client-booking`) | `next build` | 3005 |
| MAVIC NestJS API | `application/api` (`api`) | `nest build` | 4000 |

Both frontends use Next.js 16.3.6 and React 19.2.8. The backend uses NestJS 12, TypeORM and `pg`. The repository is a workspace monorepo; root scripts use Bun, with `bun.lock`, root `package-lock.json` and a second `application/web/package-lock.json`. Container installs use only the root npm lockfile with `npm ci --workspace ...`; existing development scripts and lockfiles are unchanged. The `packages` directory currently contains no package manifests. Future shared workspaces need their manifests and source added to the Dockerfiles.

No repository Node version pin was found. The inspected development runtime is Node 24.19.0; images use the Node 24 Debian Bookworm slim release line. Installed Next.js declares Node >=20.9 and Nest core >=20. Image tags track Node 24 patches; digest pinning can be considered separately.

Next.js images use standalone output with repository-wide file tracing, public assets and static assets, and run as the non-root `node` user. The API builds TypeScript to `dist/main.js`, retains compiled migrations, prunes development dependencies and runs as `node`. Native argon2 compilation tools stay in build stages. No application source, API contract or business logic was changed.

## Configuration and secrets

The API's existing TypeORM configuration reads `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SSL`, `DB_SYNCHRONIZE`, and `DB_MIGRATIONS_RUN`. Existing defaults refer to `mspaces_db`/`mspaces_app`; Compose deliberately uses dummy values instead of development credentials. There is no PostgreSQL service or database volume. Both schema synchronization and automatic migrations are explicitly false in Compose and default false in the API image.

Existing environment examples also contain mail (`SMTP_*`, `FRONTEND_URL`, `TEMPORARY_PASSWORD_TTL_HOURS`, `APP_ENV`), JWT, Redis, leave allocation and payment configuration. These existing examples and all actual `.env*` files are excluded from build contexts; their secret values are never copied or passed to CI. Mail and leave allocation are not enabled by the workflow. No GitHub secrets are needed for Phase 1.

Admin uses `AUTH_API_URL` in server route handlers and session loading. Compose sets it to `http://api:4000` at runtime. Booking uses same-origin `/api/public/booking` requests and its Next.js rewrite reads `API_BASE_URL` **during build**. The booking Dockerfile exposes that nonsecret build argument, defaulting to `http://api:4000`; Compose uses optional `BOOKING_API_BASE_URL` to override it. A changed rewrite destination requires rebuilding the image.

Booking's existing example lists `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_APP_NAME`, but the current application source does not read either variable. No artificial public variables were introduced. If public variables are introduced later, declare and pass them in the frontend build stage before `next build`: Next.js embeds public values into browser bundles, so they must contain no secrets and changing them requires rebuilding.

The root `.dockerignore` applies to all three Dockerfiles because every build uses repository-root context. It excludes dependency directories, generated output, local environment files, npm credentials, key/certificate files, database dumps/backups, upload directories, local tooling, documentation and temporary artifacts. The nested web lockfile and Bun lockfile are excluded to avoid competing container dependency inputs.

## GitHub Actions

`.github/workflows/docker-build.yml` runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. It grants only `contents: read`, cancels superseded runs for the same ref, and uses GitHub-hosted `ubuntu-latest` runners.

The validation job parses Compose with no environment file and runs Docker build-definition checks for all three Dockerfiles. Three independent matrix jobs use Buildx and per-app GitHub Actions caches. `push: false` prevents registry publishing; `load: true` makes each image available only on its temporary runner. Short-lived containers check packaged files and API runtime dependencies with an overridden Node entrypoint; they do not bootstrap Nest/Next or access a database. The images are not retained as downloadable artifacts in this phase. There is no registry login, package write permission, SSH, deployment command or Docker Compose startup.

The sole existing workflow was an untracked build-only draft at this same path. It was updated in place. No automatically publishing or deploying workflows were found to disable.

## Trigger and troubleshoot

Review the diff, then stage only the Phase 1 files:

```powershell
git add .dockerignore compose.yml .github/workflows/docker-build.yml application/web/Dockerfile application/web/next.config.ts application/client-booking/Dockerfile application/client-booking/next.config.ts application/api/Dockerfile docs/DOCKER_PHASE_1.md docs/HRIS_IMPLEMENTATION_PLAN.md
git commit -m "Add cloud Docker build validation for MAVIC apps"
git push origin HEAD
```

Pushing a feature branch triggers the workflow when its PR targets `main`. Pushing `main` triggers it directly. After the workflow exists on the default branch, it can also be started from **Actions → MAVIC Docker Build → Run workflow**. These commands are instructions only; no commit or push was performed by this implementation.

Open the matching Actions run, choose the failed validation or application job, then expand the first failed step. Compose errors identify invalid fields; install failures appear under `npm ci`; app errors under `next build` or `nest build`; packaging problems appear in the final artifact/dependency verification step. Inspect the earliest error before the final generic Docker exit-code message. Download the run logs for the complete output. Do not paste real `.env` contents or credentials into logs or issues.

## Manual configuration and validation limits

- Enable GitHub Actions for the repository and allow the referenced GitHub/Docker actions. Organization approval may be required for fork PR runs. No registry account, VPS or CI secrets are needed.
- CI needs network access to npm, Docker Hub and the existing SheetJS tarball URL recorded in the API dependencies. An upstream outage or inaccessible dependency URL can fail installation.
- Compose is an optional application topology, not a production deployment. Do not run it on the laptop for Phase 1. Before any future authorized runtime use, supply the existing database connection and real runtime secrets, configure mail/payment/storage and public URLs, and arrange persistent storage where required. Never use the dummy payment secret for real traffic. Production hardening and deployment belong to a later request.
- Local verification passed YAML parsing and workflow/service structure checks, all three workspace dependency-manifest comparisons against the root lockfile, Dockerfile static checks, and `git diff --check`. Next.js standalone configuration was checked against the installed Next.js documentation.
- Docker is not installed locally. Full Compose schema validation, Docker builds, Linux native dependency loading and image artifact checks are delegated to the first GitHub run. No local Docker daemon, application boot, database connection, migration or data modification was used to validate this change. An Actions success has not yet been observed.

## Files

Added: root `.dockerignore`, `compose.yml`, three application `Dockerfile` files and this report. Updated: the existing untracked `.github/workflows/docker-build.yml` draft, both `next.config.ts` files, and the HRIS inventory/phase tracker. Main HRIS Phase 1 remains active; no later HRIS phase was started.
