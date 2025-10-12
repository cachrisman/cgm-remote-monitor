# Nightscout Next.js Overhaul Plan

## 1. Current Architecture Overview

### Server and Application Bootstrap
- The Node.js entry point delegates to `lib/server/server.js`, which loads environment settings, localization, and boot-time extensions before instantiating the Express app and Socket.IO layer.【F:server.js†L21-L24】【F:lib/server/server.js†L24-L74】

### API Surface
- `lib/api/index.js` builds an Express router that is mounted under `/api`, enabling feature flags, extensions, and registering route handlers for entries, treatments, profiles, device status, notifications, activity logs, food libraries, experiments, voice assistants, and status checks.【F:lib/api/index.js†L4-L64】
- Additional API versions live under `lib/api2`, `lib/api3`, and authorization helpers under `lib/authorization`, providing legacy compatibility and scoped access management.

### Client-Side Application
- The main Nightscout dashboard is rendered from `views/index.html`, which seeds a large DOM scaffold, loads bundled scripts, and relies on global modules in `lib/client` to hydrate widgets such as the glucose chart, status pills, toolbar, and plugin system.【F:views/index.html†L1-L120】【F:lib/client/index.js†L1-L120】
- Reporting capabilities leverage `lib/report/reportclient.js` and a collection of plugin modules (for example `lib/report_plugins/daytoday.js`, `weektoweek.js`, `hourlystats.js`) that inject HTML, manage report-specific UI controls, and render D3-based visualizations from cached data sets.【F:lib/report/reportclient.js†L1-L160】【F:lib/report_plugins/index.js†L1-L64】【F:lib/report_plugins/daytoday.js†L1-L120】

### Profile Editor
- The profile editor UI defined in `views/profileindex.html` uses shared toolbars and includes interactive form fields for insulin profiles, carb absorption, basal schedules, and target ranges. Client logic in `lib/profile/profileeditor.js` and `lib/profilefunctions.js` binds the DOM, persists settings, and talks to profile APIs.【F:views/profileindex.html†L1-L160】【F:lib/profile/profileeditor.js†L1-L160】【F:lib/profilefunctions.js†L1-L120】

### Admin Tools
- Administrative utilities render from `views/adminindex.html`, and `lib/admin_plugins/index.js` registers plugins for subject management, role assignment, database clean-up tasks, and future item scheduling.【F:views/adminindex.html†L1-L60】【F:lib/admin_plugins/index.js†L1-L80】
- Each plugin (for example `subjects.js`, `roles.js`, `cleanentriesdb.js`) provides its own modal dialogs and AJAX flows targeting `/api/v2/authorization` and related endpoints.【F:lib/admin_plugins/subjects.js†L1-L160】【F:lib/admin_plugins/roles.js†L1-L160】

## 2. Modernization Goals
1. **Next.js Platform** – Adopt Next.js (App Router) with React 18, TypeScript, and server components to replace the legacy Express + jQuery front-end. Utilize Vercel-style file routing while retaining compatibility with self-hosted deployments.
2. **Design System** – Introduce a component library (e.g., Chakra UI or Tailwind + Headless UI) for consistent accessibility, theming, and responsive layouts.
3. **State & Data Layer** – Centralize data fetching with React Query (TanStack Query) and server actions. Replace implicit globals with typed hooks and context providers for real-time glucose data, settings, and authentication state.
4. **API Evolution** – Consolidate REST endpoints into versioned Next.js Route Handlers, documenting schemas with Zod/OpenAPI, and progressively deprecate legacy routes while maintaining a compatibility bridge.
5. **Testing & Quality** – Implement Jest/Testing Library for component tests, Playwright for E2E, and contract tests for APIs. Add ESLint + Prettier with strict TypeScript settings.

## 3. Proposed Next.js Architecture

### Project Structure
```
apps/
  web/ (Next.js)
    app/
      layout.tsx
      page.tsx (dashboard)
      profile/
      admin/
      reports/
      api/ (route handlers)
    components/
    lib/
    hooks/
    styles/
  worker/ (optional background jobs)
packages/
  api-client/
  ui/
  config/
```

- Use Turborepo (optional) to manage shared packages (types, API client, design tokens).
- Introduce a dedicated `packages/api-client` that wraps Nightscout APIs with typed fetchers and supports both server and client usage.

### Data Sources & Realtime
- Re-implement Socket.IO functionality using Next.js-compatible real-time options (Next.js `app` directory with server-sent events or upgrade to WebSockets via `next-socket.io` integration).
- MongoDB integration handled via Prisma or Mongoose within Next.js route handlers, using an adapter that respects existing schema expectations.

## 4. Feature Implementation Plan

### 4.1 API Layer
- **Route Handlers**: Map existing Express routes to Next.js `app/api` structure (`app/api/entries/route.ts`, `app/api/treatments/route.ts`, etc.). Each handler exports `GET/POST/PUT/DELETE` functions mirroring the current controller logic from `lib/api/*` modules.【F:lib/api/index.js†L18-L64】
- **Middleware & Auth**: Recreate `ctx.wares` behaviors (extensions negotiation, API key enforcement) as shared middleware utilities. Implement edge-compatible authentication with JWT or API key headers aligned with `lib/authorization` logic.【F:lib/api/index.js†L6-L33】【F:lib/authorization/index.js†L1-L160】
- **Schema Validation**: Translate parameter parsing performed by modules like `lib/report/reportstorage.js` and `lib/profilefunctions.js` into reusable Zod schemas. Generate OpenAPI definitions for public use.
- **Compatibility**: Provide `/api/v1` proxies for legacy clients by bridging to the new handlers while logging usage for phased retirement.

### 4.2 Main Homepage (Dashboard)
- **Page Composition**: Implement `app/page.tsx` as a server component fetching initial glucose entries, status flags, and user settings. Client components handle live updates and interactions formerly driven by jQuery in `lib/client` modules.【F:views/index.html†L32-L110】【F:lib/client/index.js†L1-L160】
- **Widgets**: Convert each toolbar and pill component (`lib/client/browser-settings.js`, `renderer.js`) into React components with hooks for translations, units, and alarms. Use context providers for `NightscoutClient` state that currently lives globally in `window.Nightscout`.
- **Charts**: Replace D3 imperative rendering with React-friendly charting (e.g., Recharts, Visx) or wrap D3 within React components. Ensure accessible updates for screen readers, replicating ARIA usage (`aria-live` attributes) from the current HTML.【F:views/index.html†L70-L108】
- **Theming & Responsiveness**: Use CSS-in-JS (Emotion) or Tailwind for dynamic theming, including dark mode, offline banners, and mobile-first layouts.

### 4.3 Reporting and Plugins
- **Reports Hub**: Create `app/reports/page.tsx` with tabs or routes for each report. Server components fetch summary data; client components render charts.
- **Plugin System**: Model each report plugin as a React component implementing a standardized interface (metadata, settings schema, renderer). Use dynamic imports for heavy charts to keep the initial bundle small. Reference existing plugin metadata defined in `lib/report_plugins/index.js` and implement conversions for options currently stored via `reportstorage`.【F:lib/report_plugins/index.js†L12-L45】
- **Data Fetching**: Introduce report-specific loaders replicating logic from modules like `daytoday.js` (aggregation, chart building) but executed on the server for performance and to reduce client load.【F:lib/report_plugins/daytoday.js†L62-L152】
- **Export & Sharing**: Provide PDF/CSV export using server actions; add shareable URLs storing query parameters that define date range, metrics, and plugin states.

### 4.4 Reporting Plugin Roadmap
- **Day to Day / Week to Week**: Implement React components with virtualization for large data sets and maintain toggles for insulin, carbs, basal overlays.【F:lib/report_plugins/daytoday.js†L18-L118】【F:lib/report_plugins/weektoweek.js†L1-L120】
- **Statistical Summaries**: Port `dailystats`, `hourlystats`, `percentile`, and `glucosedistribution` to leverage React Table and chart primitives. Pre-compute aggregates via API route handlers to minimize browser computation.【F:lib/report_plugins/hourlystats.js†L1-L160】
- **Advanced Reports**: For specialized modules like `loopalyzer` and `success`, encapsulate domain logic into shared utilities under `packages/api-client/reporting`, ensuring they can be unit-tested and reused across UI surfaces.【F:lib/report_plugins/loopalyzer.js†L1-L160】

### 4.5 Profile Editor
- **Route Structure**: Implement `app/profile/page.tsx` (listing profiles) and nested routes for editing (`app/profile/[id]/edit/page.tsx`). Fetch profile data via server components using the new API client.【F:views/profileindex.html†L27-L120】
- **Form System**: Use React Hook Form + Zod to replicate validation and computed fields found in `lib/profilefunctions.js`, including basal totals, DIA, and carb absorption presets.【F:lib/profilefunctions.js†L1-L160】
- **Version History**: Provide a history sidebar using server-rendered tables with the ability to clone, delete, and schedule activation times similar to the current jQuery dialogs.【F:views/profileindex.html†L37-L118】
- **Real-Time Preview**: Offer chart previews built with the same visualization library as the dashboard for consistency.

### 4.6 Admin Tools
- **Admin Layout**: Create `app/admin/layout.tsx` to enforce role-based access and render navigation. Each tool becomes a React page or modal component under `app/admin/*` routes.【F:views/adminindex.html†L29-L46】
- **Subject & Role Management**: Replace jQuery dialogs from `subjects.js` and `roles.js` with table-based management UIs, inline editing, and optimistic updates using TanStack Table + React Query.【F:lib/admin_plugins/subjects.js†L17-L120】【F:lib/admin_plugins/roles.js†L1-L120】
- **Database Maintenance**: Expose background operations (clean entries/status/treatments, future item review) as server actions with progress feedback, using Next.js API routes to trigger asynchronous jobs previously wired through plugin `code` functions.【F:lib/admin_plugins/cleanentriesdb.js†L1-L120】
- **Audit Trail**: Add logging dashboards for admin actions using structured event records stored in MongoDB.

### 4.7 Authentication & Authorization
- Integrate NextAuth or custom auth to support API keys, personal tokens, and OAuth providers. Map existing authorization flows from `/api/v2/authorization` to Next.js middleware and server actions for consistent enforcement.【F:lib/authorization/index.js†L1-L160】

## 5. Migration Strategy
1. **Foundational Setup**: Initialize Next.js app alongside the legacy codebase. Establish shared TypeScript types and environment configuration wrappers.
2. **API Parity**: Re-implement high-traffic APIs (entries, status, treatments) first, verifying responses match existing behavior through integration tests.
3. **Incremental Front-End Migration**: Start with read-only dashboard components (trend graph, status tiles), then progressively migrate interactive features (alarms, notifications, care portal). Operate both front-ends in parallel behind a feature flag until parity is achieved.
4. **Report Porting**: Prioritize high-usage reports (`daytoday`, `dailystats`) before tackling specialized plugins. Provide alpha access for users to validate outputs.
5. **Profile & Admin**: Migrate administrative interfaces last, ensuring new authorization mechanisms are vetted. Offer fallbacks to legacy pages during beta.
6. **Deprecation & Cleanup**: After parity, retire legacy Express routes, remove jQuery assets, and refactor shared utilities into TypeScript packages.

## 6. Tooling & DevOps Updates
- **CI/CD**: Configure GitHub Actions for linting, testing, and building Next.js. Include preview deployments (Vercel or self-hosted) for PR validation.
- **Containerization**: Update Dockerfile to build the Next.js app with production optimizations (`next build`, `next start`) while maintaining the ability to run background workers for pumps or integrations.
- **Monitoring**: Introduce structured logging (pino), metrics (Prometheus exporters), and error tracking (Sentry) to monitor the modernized stack.

## 7. Documentation & Change Management
- Maintain a migration guide comparing legacy and Next.js endpoints, configuration variables, and deployment steps.
- Produce architectural decision records (ADRs) for framework choices, data handling, and third-party dependencies.
- Provide upgrade scripts or data migrations as needed for MongoDB schema changes.

## 8. Timeline Estimate
1. **Weeks 1-2**: Project scaffolding, shared config, initial API handlers.
2. **Weeks 3-6**: Dashboard core (charts, status cards, alerts), authentication integration.
3. **Weeks 7-9**: Reports MVP (day-to-day, weekly, stats) and export features.
4. **Weeks 10-12**: Profile editor migration with validation and preview.
5. **Weeks 13-15**: Admin console rewrite, audit logging, background job orchestration.
6. **Weeks 16+**: Beta testing, performance tuning, legacy decommissioning.

## 9. Risks & Mitigations
- **Data Consistency**: Validate responses from new APIs with automated regression tests comparing legacy outputs. Use contract tests derived from existing fixtures in `tests/`.
- **Real-Time Reliability**: Plan fallback polling if WebSocket support fails, ensuring alerts remain functional during migration.
- **User Adoption**: Roll out feature flags and collect user feedback through telemetry dashboards and support channels before defaulting to the new UI.

## 10. Success Metrics
- Reduced bundle size and faster Time-to-Interactive compared to legacy UI.
- API latency parity or improvement under load testing.
- Increased automated test coverage (target 80% critical path coverage).
- Positive feedback from caregivers and clinicians regarding accessibility and usability.

## 11. Implementation Log
- **Phase 1 Kickoff (Next.js Scaffolding)**: Added a co-located Next.js application under `apps/web` with Tailwind CSS, strict
  TypeScript settings, and an initial dashboard that reads from legacy Nightscout APIs using server components. Established a
  typed API client wrapper (`lib/nightscout-client.ts`) and a first route handler (`app/api/status/route.ts`) to validate the
  migration approach before porting additional features.

