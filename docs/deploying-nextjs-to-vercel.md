# Deploying the Next.js branch to Vercel

The legacy Nightscout Express app in `server.js` cannot run on Vercel's serverless runtime, so deployments must target the Next.js branch under `apps/web`. Use this guide to publish preview and production builds on Vercel without blocking on the legacy stack.

## Prerequisites
- A fork or clone of the repository with the Next.js branch pushed to your remote (for example `nextjs-overhaul` or `work`).
- Vercel account with access to create projects.
- Nightscout API endpoint reachable from Vercel (public URL or tunnel) to satisfy `/entries.json` and `/status.json` calls.

## One-time project setup
1. **Create a new Vercel project** and select this repository.
2. In the **Root Directory** setting, choose `apps/web` (Vercel will ignore the legacy Express code and build only the Next.js app).
3. Set **Framework Preset** to `Next.js`. Leave the Output Directory as `.vercel/output` (default).
4. Set the **Build Command** to `npm install --legacy-peer-deps && npm run build` and the **Install Command** to `npm install --legacy-peer-deps` to ensure dependencies in `apps/web` are installed with the pinned versions.
5. In **Environment Variables**, configure at least:
   - `NEXT_PUBLIC_NIGHTSCOUT_API_BASE_URL` → the full base URL to your Nightscout API (e.g., `https://<your-site>.azurewebsites.net/api/v1`). This replaces the local default `http://localhost:1337/api/v1` defined in `apps/web/lib/env.ts`.
6. Choose the **Production Branch** as your Next.js branch (not `main`, which contains the Express app). Enable **Preview Deployments** for all other branches to get PR previews automatically.

## Local verification before shipping
From the repo root, run the Next.js workspace commands inside `apps/web`:
```bash
cd apps/web
npm install --legacy-peer-deps
npm run lint
npm test
npm run build
```
These commands mirror Vercel's pipeline and ensure the app is production-ready before pushing.

## What Vercel builds
- The dashboard at `app/page.tsx` renders glucose metrics, recent readings, and device health using server components and the typed Nightscout client.
- Route handlers (e.g., `app/api/status/route.ts`) fetch data from your configured Nightscout instance with ISR configured via `next: { revalidate }` hints.

## Troubleshooting
- **Unexpected Express errors**: confirm the project root is `apps/web`; Vercel will attempt to run `server.js` if the repository root is used.
- **API connectivity issues**: verify `NEXT_PUBLIC_NIGHTSCOUT_API_BASE_URL` points to a publicly reachable Nightscout deployment and that CORS allows Vercel domains.
- **Missing dependencies**: the `--legacy-peer-deps` flag helps avoid peer conflicts in Vercel's build environment.

With this configuration, Vercel deployments exercise only the modern Next.js front end while leaving the legacy Express stack untouched for self-hosted users.
