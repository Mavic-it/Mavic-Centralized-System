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

Build-check correction (2026-11-12): removed the redundant `ENV AUTH_API_URL` from the Admin build stage after Docker reported `SecretsUsedInArgOrEnv`. All Admin reads occur inside request handlers or cookie-dependent session loading; the variable is not required by `next build`. The existing Compose `admin.environment.AUTH_API_URL` remains the runtime configuration. Direct image launches outside Compose must also supply this runtime variable to use a non-local API. Booking's build-time rewrite argument and the API Dockerfile remain unchanged. No Docker checks were disabled or skipped. Local YAML/runtime-wiring and Dockerfile static checks passed; Docker's actual `--check` commands still require the GitHub-hosted runner, since no local Docker installation is used.

Booking's existing example lists `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_APP_NAME`, but the current application source does not read either variable. No artificial public variables were introduced. If public variables are introduced later, declare and pass them in the frontend build stage before `next build`: Next.js embeds public values into browser bundles, so they must contain no secrets and changing them requires rebuilding.

The root `.dockerignore` applies to all three Dockerfiles because every build uses repository-root context. It excludes dependency directories, generated output, local environment files, npm credentials, key/certificate files, database dumps/backups, upload directories, local tooling, documentation and temporary artifacts. The nested web lockfile and Bun lockfile are excluded to avoid competing container dependency inputs.

## GitHub Actions

`.github/workflows/docker-build.yml` runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. It grants only `contents: read`, cancels superseded runs for the same ref, and uses GitHub-hosted `ubuntu-latest` runners.

The validation job parses Compose with no environment file and runs Docker build-definition checks for all three Dockerfiles. Three independent matrix jobs use Buildx and per-app GitHub Actions caches. `push: false` prevents registry publishing; `load: true` makes each image available only on its temporary runner. Short-lived containers check packaged files and API runtime dependencies with an overridden Node entrypoint; they do not bootstrap Nest/Next or access a database. The images are not retained as downloadable artifacts in this phase. There is no registry login, package write permission, SSH, deployment command or Docker Compose startup.

The sole existing workflow was an untracked build-only draft at this same path. It was updated in place. No automatically publishing or deploying workflows were found to disable.

## Trigger and troubleshoot

### Admin Vitest TypeScript dependency repair (2026-11-12)

Vitest was declared only by `application/api`, not at the repository root or in `application/web`. A full development install happened to hoist it to root `node_modules`, masking the Admin's undeclared dependency. The Admin Dockerfile correctly installs only the web workspace, so the API's Vitest dependency was absent. Admin `tsconfig.json` includes `.spec.ts`, `.spec.tsx` and `.mts` files, including `vitest.config.mts`. Their missing imports caused TS2307 and removed contextual types from Vitest callbacks, producing the reported implicit-any errors.

Added exact `vitest: 4.1.11` to Admin development dependencies, matching the version already recorded in the root lockfile and installed locally. Updated only the Admin workspace's lock manifest; no package versions, transitive lock entries, API/booking dependency declarations or Tailwind native entries changed. Admin Docker installation now explicitly includes both development and optional dependencies. A pre-build resolution check verifies Vitest, `vitest/config` and TypeScript are installed from the Admin workspace, followed by the existing Tailwind native load verification and mandatory Next.js production build.

No production TypeScript split is needed: strict checking remains enabled and Next.js continues checking tests and Vitest config as well as application code. No test exclusions, ignored build errors, application source changes or new CI job were introduced. The workflow still builds all three images on GitHub-hosted Linux runners. The changed manifest, lockfile and install command invalidate the affected dependency layer automatically.

Validation: full Admin `tsc --noEmit --incremental false -p application/web/tsconfig.json` passed with the existing matching Vitest available; no remaining implicit-any or missing-Vitest type errors were found. A clean manifest-only, offline Linux/x64/glibc-targeted `npm ci --dry-run --workspace web --include-workspace-root=false --include=dev --include=optional --ignore-scripts` passed and explicitly selected Vitest 4.1.11, TypeScript 5.9.3 for Admin, and the preserved Oxide Linux GNU 4.3.3 package. All workspace dev-dependency manifests match the lockfile, and every non-web package entry is unchanged. Actual Linux image build execution awaits the next GitHub Actions run; Docker Desktop remains unnecessary.

The unchanged full frontend Vitest suite was also run using 4.1.11: 273 tests passed and 11 failed across 6 of 78 files. Failures concern existing `next/navigation` mocks missing `usePathname`, employee-profile source/layout assertions, the form-required-marker audit, and attendance wording assertions. These runtime/assertion failures are separate from the passing TypeScript check and were not hidden, disabled or repaired by changing unrelated application modules. The current Docker workflow does not execute this test suite. They remain follow-up work; no claim is made that the full suite passes.

To verify the next GitHub run, push the fix and open **Build MAVIC Admin**. Its install must resolve Vitest and TypeScript, print `Admin build dependencies verified`, retain `Tailwind Linux native binding verified`, and finish Next.js compilation and TypeScript validation. The Compose-validation, Client Reservation and API jobs retain their existing configuration. Local checks may be repeated with `node node_modules/typescript/bin/tsc --noEmit --incremental false -p application/web/tsconfig.json`; to run the existing frontend tests, change to `application/web` and run `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.mts` after installing workspace dependencies.

### Admin Tailwind Linux native binding repair (2026-11-12)

The root lockfile recorded `@tailwindcss/oxide@4.3.3` and its optional dependency declaration for `@tailwindcss/oxide-linux-x64-gnu@4.3.3`, but only the Windows x64 native package had a package entry. The workspace filter was not configured to omit optional dependencies; the missing Linux lock entry was the concrete defect. This is consistent with npm's documented [platform optional dependency lockfile issue](https://github.com/npm/cli/issues/4828).

The repair adds only the Linux x64 glibc native package entry, including npm registry tarball URL and SHA-512 integrity. Metadata was generated by npm 11.17.0 in an isolated package with Oxide pinned to the existing 4.3.3, no `node_modules` or previous lockfile, and explicit `--os=linux --cpu=x64 --libc=glibc --include=optional --package-lock-only --ignore-scripts`. That single entry was merged into the workspace lockfile; every pre-existing package entry and workspace manifest was compared and remains unchanged. A lock-only install against the old incomplete lockfile did not repair it, so that result was not used.

The Admin Dockerfile now passes `--include=optional` to `npm ci`. Immediately after installation, a fail-fast Node check resolves the native package from the Admin workspace, compares its version to Oxide, loads the actual native binding, and loads Oxide and the Tailwind PostCSS plugin. This runs inside the Linux build stage before the normal, required Next.js production build. It intentionally checks the Linux x64 GNU target used by the current Ubuntu runner/Bookworm image; ARM or musl images would need their matching lock entries and verification target.

The existing root `.dockerignore` already excludes `**/node_modules`, `.next`, and the nested web lockfile, so no host Windows binaries enter the Docker context. Buildx caches are separated by application. The modified install instruction and root lockfile invalidate the Admin dependency layer automatically; no cache deletion or workflow change is required. CSS, source modules, Compose environments, other Dockerfiles and package manifests are unchanged.

Local verification compared all original lock entries, confirmed matching Oxide/native versions and Linux/x64/glibc metadata, and used an isolated Linux-targeted workspace install with install scripts disabled. That install resolved the expected 4.3.3 native package; its binary header was verified as ELF64 x86-64. This cross-platform check runs on Windows and cannot execute a Linux native module. Actual binary loading and the complete production build remain enforced by the Dockerfile on GitHub's Linux runner; no local Docker or WSL was installed. Push the commit to rerun all four jobs. A successful Linux build has not yet been observed for this repair.

For a separate manual check on an existing Linux Docker host (not required on the Windows laptop), use `docker build --progress=plain -f application/web/Dockerfile .`. The log must show `Tailwind Linux native binding verified` before `npm run build --workspace web`, and both commands must succeed. GitHub Actions performs the equivalent build automatically. Repeating this locally on Windows is unnecessary.

Final isolated install result: `npm ci --workspace web --include-workspace-root=false --include=optional --ignore-scripts --os=linux --cpu=x64 --libc=glibc` completed successfully (486 packages). It emitted an existing `eslint@9.39.5` deprecation warning; no package upgrades were made to address that unrelated warning. Restricted-network attempts before the authorized fetch failed with EACCES; the completed install succeeded. No Linux native execution or full Docker build is claimed by this Windows-only check.

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
