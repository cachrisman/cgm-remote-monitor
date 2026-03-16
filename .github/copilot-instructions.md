**Purpose**: Quick, actionable guidance for AI coding agents working on Nightscout (`cgm-remote-monitor`). Focus on the repository layout, common workflows, conventions, and concrete examples you can use immediately.

- **Repo Shape**: Server-side code lives under `lib/` (entry: `lib/server/server.js`). The legacy frontend lives under `static/` and `webpack/` bundles; a modern Next.js frontend is in `apps/web`.

- **Start Here (big picture)**: The server (`lib/server/*`) reads configuration via `lib/server/env.js`, connects to MongoDB and exposes the Nightscout REST API (Swagger available at `/api-docs/`, source in `lib/server/swagger.*`). Plugins (feature modules) are under `lib/plugins/` and are wired in `lib/plugins/index.js`.

- **Key files to reference**:
  - `lib/server/server.js` : server bootstrap and socket wiring.
  - `lib/server/env.js` : all environment parsing and plugin extended-settings mapping.
  - `lib/plugins/index.js` : canonical list of server/client plugins and how `ENABLE` controls them.
  - `webpack/webpack.config.js` : building the client bundles used by the legacy UI.
  - `apps/web/package.json` : a separate Next.js app — dev/build/start commands live here.
  - `package.json` (repo root) : top-level scripts for running the server, bundling, and tests.

- **Important scripts / commands** (exact examples):
  - Start server in dev with env file: `npm run dev` (uses `env-cmd -f ./my.env nodemon --inspect lib/server/server.js`).
  - Start prod server (with `my.prod.env`): `npm run prod`.
  - Build legacy static bundles: `npm run bundle` or `npm run bundle-dev` (runs `webpack --config webpack/webpack.config.js`).
  - Run root tests (Mocha): `npm test` (uses `env-cmd -f ./my.test.env mocha --require ./tests/hooks.js`).
  - Run Next.js frontend locally: `cd apps/web && npm run dev`.
  - Web app tests: `cd apps/web && npm test` (uses Jest).
  - Lint: `npm run lint` (runs `eslint lib`).

- **Environments & config conventions**:
  - Environment is canonical: `lib/server/env.js` reads `process.env` (also supports Azure `CUSTOMCONNSTR_` prefixes).
  - Common env files in the repo: `my.env`, `my.test.env`, `my.devtest.env`, `my.prod.env`, and `tests/ci.test.env`.
  - Feature toggles: `ENABLE` and `DISABLE` are space-separated lists of plugin names (e.g. `ENABLE="careportal rawbg iob"`).
  - Extended plugin settings are provided by env vars prefixed with a plugin name, e.g. `UPBAT_ENABLE_ALERTS=true` or `DEVICESTATUS_DAYS=2`. `lib/server/env.js` converts these names into camelCase and attaches them to `env.extendedSettings` for each plugin.
  - `API_SECRET` handling: server validates length/entropy (minimum ~12 chars). The secret is removed from `process.env` after being read and passed into `env.enclave`.

- **Plugin model & patterns**:
  - Plugins are CommonJS modules under `lib/plugins/*.js` and are loaded via `require('./plugins/<name>')(ctx)` in `lib/plugins/index.js`.
  - Each plugin typically exposes properties like `name`, `pluginType`, and optional hooks: `setProperties`, `checkNotifications`, `updateVisualisation`, `getEventTypes`, etc. See `lib/plugins/index.js` for how hooks are invoked.

- **Testing notes (practical details)**:
  - Tests clear the `require` cache after each run (`tests/hooks.js`) — changes to `require.cache` can affect test isolation.
  - Root tests run with Mocha + `env-cmd` which means environment files are required for tests to function; use `my.test.env` or `tests/ci.test.env` when replicating CI.

- **Client build & deployment**:
  - Legacy UI: `webpack` produces files consumed by `static/` and `bundle/`. Use `npm run bundle` for production bundles.
  - New UI: `apps/web` is a separate Next.js app (React 19 / Next 16). Its lifecycle is independent — build and deploy it from `apps/web`.

- **Conventions and gotchas to follow**:
  - Code is CommonJS (lots of `require(...)`) in `lib/`; avoid converting files to ESM without broad coordination.
  - Centralized env parsing: do not bypass `lib/server/env.js` for config — it normalizes values and builds `env.extendedSettings` used by plugins and server code.
  - When changing plugin behavior, update `lib/plugins/index.js` registration and ensure `ENABLE` interaction still works.
  - Don't assume process.env values are strings; `env.js` interprets `on/off/true/false` and numeric strings in `findExtendedSettings`.

- **Useful quick examples**:
  - Enable Care Portal and IOB and run in dev:
    `ENABLE="careportal iob" env-cmd -f ./my.env nodemon --inspect lib/server/server.js`
  - Build the server + client bundles locally before testing:
    `npm run bundle-dev && npm test`
  - Run Next web frontend only:
    `cd apps/web && npm install && npm run dev`

**If something is missing**: tell me which area you'd like expanded (API surface, plugin lifecycle, webpack details, or CI/test behavior) and I will update the file.
