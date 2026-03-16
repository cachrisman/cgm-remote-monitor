# Deploying the Next.js branch to Vercel

The Nightscout dashboard now runs entirely on Vercel using App Router APIs backed by MongoDB—no legacy Express server required. Deploy the `apps/web` project to Vercel with a MongoDB connection string and the built-in serverless Nightscout API will serve `/api/v1/*` routes.

## Prerequisites
- A fork or clone of the repository with the Next.js branch pushed to your remote (for example `nextjs-overhaul` or `work`).
- Vercel account with access to create projects.
- MongoDB cluster reachable from Vercel (connection string with user/password and database name).

## One-time project setup
1. **Create a new Vercel project** and select this repository.
2. In the **Root Directory** setting, choose `apps/web` (Vercel will ignore the legacy Express code and build only the Next.js app).
3. Set **Framework Preset** to `Next.js`. Leave the Output Directory as `.vercel/output` (default).
4. Set the **Build Command** to `npm install --legacy-peer-deps && npm run build` and the **Install Command** to `npm install --legacy-peer-deps` to ensure dependencies in `apps/web` are installed with the pinned versions.
5. In **Environment Variables**, configure:
   - `MONGODB_URI` → your MongoDB connection string (includes username, password, and database name).
   - Optional: `MONGODB_DB_NAME` if the database name is not encoded in the URI.
   - Optional collection overrides if you use non-default names: `ENTRIES_COLLECTION`, `MONGO_TREATMENTS_COLLECTION`, `MONGO_DEVICESTATUS_COLLECTION`.
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
- Route handlers under `app/api/v1/*` implement the Nightscout API (entries, devicestatus, treatments, status) on Vercel Functions with a shared, cached MongoDB client. The frontend fetches from these internal routes; no external Nightscout URL is required.

## Troubleshooting
- **Unexpected Express errors**: confirm the project root is `apps/web`; Vercel will attempt to run `server.js` if the repository root is used.
- **API connectivity issues**: ensure `MONGODB_URI` is set correctly and that the MongoDB user has read/write permissions for the collections.
- **Missing dependencies**: the `--legacy-peer-deps` flag helps avoid peer conflicts in Vercel's build environment.

With this configuration, Vercel deployments exercise only the modern Next.js front end while leaving the legacy Express stack untouched for self-hosted users.
