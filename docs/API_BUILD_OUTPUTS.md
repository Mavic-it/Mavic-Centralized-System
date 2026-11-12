# API build output isolation

Development and production previously shared `application/api/dist`. Running `nest build` with `deleteOutDir: true` could remove compiled modules while a live watch process restarted Node. That produced `ERR_MODULE_NOT_FOUND` for modules such as `dist/app.controller.js`, even though a later build restored the file.

- `npm run start:dev`: watches with `tsconfig.dev.json` and emits to `dist-dev`.
- `npm run start:debug`: uses the same development configuration with debugging enabled.
- `npm run build`: emits production files to `dist`.
- `npm run start:prod`: runs `dist/main.js` after a successful production build.

Each output keeps its own incremental build information. Generated development files are ignored, and the base TypeScript configuration excludes both output folders. The migration glob resolves relative to the running database module, so it uses that process's compiled migrations. This does not enable synchronization or automatic migrations.

Restart an existing watcher once after pulling this change so it reads the new command/configuration. Use one development watcher per API workspace. Do not rebuild production output while serving that same folder with `start:prod`; build/deploy that process while stopped or from a separate release directory.

Verification on 2026-10-27: isolated development compilation and production build passed. Each output contained 156 JavaScript modules, with all 199 relative imports resolving. Local API/database health returned HTTP 200 and the protected roster route rejected anonymous access with HTTP 401. The active listener ran from `dist-dev`; the duplicate repair watcher was removed. Synchronization and automatic migrations were disabled for the repair-launched process. No real business records or migrations were changed.
