# AI Agent Guide for Nightscout

## Architecture Overview

This codebase contains **two parallel implementations**:

1. **Legacy Express Server** (`lib/server/`, `views/`, root `package.json`): Node.js/Express with jQuery frontend, MongoDB, Socket.IO. Entry: `server.js` → `lib/server/server.js`.
2. **Next.js Modernization** (`apps/web/`): React 18 + Next.js 16 App Router, TypeScript, Tailwind. Active development alongside legacy.

**Critical**: Next.js reads the same MongoDB and can call legacy APIs. Both coexist during migration. See `docs/nextjs-overhaul-plan.md`.

## Critical Patterns

### MongoDB Connection
- **Legacy**: `lib/storage/` with `ctx.store.client` pooling
- **Next.js**: `apps/web/lib/mongodb.ts` with `global._mongoClientPromise` caching for server components
- **Config**: Both read `MONGODB_URI` (or `NIGHTSCOUT_MONGODB_URI`). Collections from env: `MONGO_COLLECTION`, `MONGO_TREATMENTS_COLLECTION`. See `apps/web/lib/api/config.ts`.

### API Structure
- **Legacy**: `/api/v1/*` in `lib/api/index.js`, `lib/api2/`, `lib/api3/`
- **Next.js**: `apps/web/app/api/v1/*/route.ts` (Route Handlers) - status, entries, treatments, devicestatus
- **Client**: `apps/web/lib/nightscout-client.ts` - typed fetch for server/client components

### Data Collections
- **Entries**: `entries` collection. Fields: `sgv` (mg/dl), `direction`, `dateString`, `date` (Unix timestamp)
- **Treatments**: `treatments` - boluses, carbs, site changes
- **Device Status**: `devicestatus` - uploader battery, pump status, loop data
- **Real-time**: Legacy uses Socket.IO (`lib/server/websocket.js`). Next.js uses polling (real-time migration planned).

### Environment Variables
- **Required**: `MONGODB_URI`, `API_SECRET` (min 12 chars), `DISPLAY_UNITS` (`mg/dl` or `mmol/L`)
- **Feature Flags**: `ENABLE` (space-delimited plugins), `DISABLE` (disable defaults)
- **Next.js**: `NEXT_PUBLIC_SITE_URL`, `NEXT_PRIVATE_INTERNAL_ORIGIN` for API base URL
- Full env var docs: `README.md` (700+ lines)

## Development Workflows

### Legacy Server
```bash
npm start          # Production: node lib/server/server.js
npm run dev        # Development: nodemon with my.env
npm test           # Mocha: env-cmd -f ./my.test.env mocha
npm run bundle     # Webpack build for client assets
```

**Tests**: `tests/*.test.js` use `env-cmd` with `my.test.env`. Require MongoDB (`MONGO_CONNECTION`). See `Makefile`.

### Next.js App
```bash
cd apps/web
npm run dev        # Next.js dev (port 3000)
npm run build      # Production build
npm test           # Jest + Testing Library
npm run test:watch # Watch mode
```

**Tests**: Jest (`apps/web/jest.config.ts` uses `next/jest`). Tests in `__tests__/`. Setup in `jest.setup.ts` extends `@testing-library/jest-dom`.

## Project-Specific Conventions

### TypeScript
- **Next.js**: Strict TypeScript (`apps/web/tsconfig.json`). Server components use `'use server'`.
- **Legacy**: JavaScript only. No TypeScript in root `lib/`.

### Component Patterns
- **Next.js**: Server components by default (`app/page.tsx`). Client components: `'use client'` (e.g., `components/dashboard/DashboardClient.tsx`)
- **Data Fetching**: Server components fetch from MongoDB or `createNightscoutClient()`. Client components use React Query (planned) or fetch from Next.js API routes.

### API Client Pattern
`NightscoutClient` (`apps/web/lib/nightscout-client.ts`) factory:
```typescript
const client = createNightscoutClient({ baseUrl?: string });
const entries = await client.getRecentEntries(limit);
const status = await client.getStatus();
```
Handles URL construction, error parsing, type coercion from MongoDB docs.

### Glucose Normalization
Use `apps/web/lib/glucose-normalize.ts` to normalize entries (filters invalid data, handles units). Dashboard filters `device: "nightscout-connect"` entries to avoid duplicates.

### Testing
- **Legacy**: Integration tests with real MongoDB. Use `mongomock` for unit tests.
- **Next.js**: Unit tests with mocks. Contract tests validate API client. Component tests use Testing Library.

## Key Files

- **Architecture**: `docs/nextjs-overhaul-plan.md` - Migration strategy
- **API Routes**: `apps/web/app/api/v1/*/route.ts` - Next.js implementations
- **MongoDB Config**: `apps/web/lib/api/config.ts` - Env var reader with fallbacks
- **Legacy Server**: `lib/server/server.js` - Boot sequence
- **Legacy API**: `lib/api/index.js` - Express router
- **Client Wrapper**: `apps/web/lib/nightscout-client.ts` - Typed API client

## Common Pitfalls

1. **Dual Codebases**: Don't modify legacy when working on Next.js unless fixing shared bugs. Keep isolated.
2. **MongoDB Collections**: Collection names are env-configurable. Don't hardcode `"entries"` - use config readers.
3. **Units**: `DISPLAY_UNITS` affects calculations. Always normalize glucose values.
4. **Real-time**: Next.js lacks Socket.IO. Use polling or server-sent events.
5. **Environment**: Next.js uses different env var names (`NIGHTSCOUT_MONGODB_URI` vs `MONGODB_URI`). Check `apps/web/lib/api/config.ts` for fallback chain.

## Build & Deploy

- **Legacy**: Webpack bundles client assets. `npm run bundle` required before deployment.
- **Next.js**: `next build` creates optimized bundle. Deployable to Vercel or self-hosted. See `docs/deploying-nextjs-to-vercel.md`.

## Plugin System (Legacy)

Plugins in `lib/plugins/*.js` extend functionality (alarms, IOB, COB, etc.). Enabled via `ENABLE` env var. Each exports `(env, ctx)` and registers handlers on `ctx.bus`. Next.js will port as React components or server actions.
