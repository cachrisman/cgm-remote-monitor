# Next.js Modernization Phase 2 – Implementation PR Plan

## Objective
Deliver a Phase 2 pull request that hardens the freshly scaffolded Next.js app by validating parity with the legacy Nightscout experience. The PR focuses on a production-ready testing toolchain, strict contract coverage for the status surface area, and guardrails for upcoming feature ports.

## Scope
- Establish a Jest + Testing Library stack that exercises both server and client components within the Next.js workspace.
- Provide regression coverage for the status API, the dashboard status card, sparkline visual, and the typed Nightscout API client.
- Capture the agreed testing strategy within the modernization log to keep stakeholders aligned.
- Ensure CI can execute the tests and linting against the Next.js project without interfering with the legacy pipeline.

## Proposed Changes
1. **Tooling**
   - Add `jest`, `ts-jest`, `@testing-library/react`, and `@testing-library/jest-dom` as dev dependencies in `apps/web/package.json`.
   - Generate a project-local `jest.config.ts` with `next/jest` integration, specifying `testEnvironment`, module name mappers, and transform options that align with Next.js 13.
   - Create a shared `jest.setup.ts` to extend `expect` with Testing Library matchers and stub browser-only APIs used by the dashboard components.
   - Update `tsconfig.json` to surface the `__tests__` directory and support isolated module resolution for test files.

2. **API Client Contract Tests**
   - Author tests under `apps/web/lib/__tests__/nightscout-client.test.ts` covering:
     - `NightscoutClient#getStatus` returning the transformed shape expected by the dashboard.
     - HTTP error handling and retry/backoff behavior.
     - URL construction honoring trailing slash configuration and API secrets.
   - Add fixtures for sample status responses mirroring `/api/v1/status.json` today.

3. **Environment Utilities**
   - Add `lib/env.ts` with schema validation (using Zod) for Nightscout host and API secret configuration.
   - Test invalid and valid configurations in `lib/__tests__/env.test.ts` to block misconfiguration regressions.

4. **Route Handler Regression Tests**
   - Implement `app/api/status/route.ts` delegating to `NightscoutClient#getStatus` and re-exposing the current JSON contract.
   - Verify HTTP semantics (200 vs 500) and payload shape in `app/api/status/__tests__/route.test.ts` using the Next.js `app` testing utilities.

5. **Dashboard Components**
   - Create `StatusCard` and `TrendSparkline` components under `components/dashboard/` mirroring the legacy UI copy and formatting.
   - Add unit tests that render each component with the Testing Library, asserting text content, formatting, and sparkline accessibility props.
   - Implement a reusable `useSparkline` hook to encapsulate SVG math, exposing it for test assertions.

6. **Styling & Layout**
   - Update `app/layout.tsx` and `app/globals.css` to provide consistent typography, background, and card styling comparable to the legacy dashboard.
   - Refresh `app/page.tsx` to consume the new API client, render status cards, and show sparkline visuals using server + client components.

7. **Documentation**
   - Append a Phase 2 milestone entry in `docs/nextjs-overhaul-plan.md`, documenting the tooling decisions and parity verification coverage.

## Testing Strategy
- `npm test` at the workspace root to execute unit tests in watchless mode.
- `npm run lint` once ESLint is configured (Phase 3) to keep TypeScript strict.
- Future integration: Add GitHub Actions workflow to call the new scripts within CI.

## Acceptance Criteria
- All new tests pass locally.
- The status API response from Next.js matches the legacy `/api/v1/status.json` structure byte-for-byte (excluding ordering of object keys).
- Dashboard renders without runtime warnings in development mode and consumes mocked data without hitting production servers.
- Documentation clearly communicates the Phase 2 deliverables and next steps.

## Follow-Up Work (Out of Scope)
- Expanding contract tests to entries/treatments endpoints.
- Introducing Playwright E2E coverage (planned for Phase 3).
- Porting additional dashboard widgets beyond the status overview and sparkline.

