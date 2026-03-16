import { headers } from "next/headers";
import Link from "next/link";

import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { getSettings } from "@/lib/api/settings";
import { normalizeGlucoseEntry } from "@/lib/glucose-normalize";
import { createNightscoutClient } from "@/lib/nightscout-client";

import type { GlucoseThresholds } from "@/lib/glucose-colors";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Read incoming request headers to pass through client auth
  const headersList = await headers();
  const authHeaders: HeadersInit = {};
  
  // Pass through Authorization header if present (client JWT token)
  const authorization = headersList.get("authorization");
  if (authorization) {
    authHeaders["Authorization"] = authorization;
  }
  
  // Pass through api-secret header if present (client access token)
  const apiSecret = headersList.get("api-secret");
  if (apiSecret) {
    authHeaders["api-secret"] = apiSecret;
  }
  
  const client = createNightscoutClient({ headers: Object.keys(authHeaders).length > 0 ? authHeaders : undefined });

  let entries = [] as Awaited<ReturnType<typeof client.getRecentEntries>>;
  let status = {
    state: "unknown",
    devices: []
  } as Awaited<ReturnType<typeof client.getStatus>>;
  let fetchError: string | null = null;
  let requiresAuth = false;

  // Get thresholds from settings (server-side)
  const settings = getSettings();
  const thresholds: GlucoseThresholds = settings.thresholds;

  try {
    // Fetch entries for exactly 48 hours using date filter
    [entries, status] = await Promise.all([client.getEntriesByHours(48), client.getStatus()]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "";
    
    // Check if this is a 401 auth error - this is expected when auth is required
    // The client-side DashboardClient will handle authentication
    if (errorMessage.includes("(401)") || errorMessage.includes("Unauthorized")) {
      requiresAuth = true;
      // Don't set fetchError for auth issues - let client handle it
    } else {
      fetchError = errorMessage || "Unable to reach the Nightscout API";
    }
  }

  entries = entries
    .map((e) => normalizeGlucoseEntry(e))
    .filter((e): e is NonNullable<typeof e> => e !== null && (e as { device?: string }).device !== "nightscout-connect");
  const resolvedSearchParams = await searchParams;
  const shortTermHoursParam = Array.isArray(resolvedSearchParams?.hours)
    ? resolvedSearchParams.hours[0]
    : resolvedSearchParams?.hours;
  const parsedHours = Number(shortTermHoursParam);
  const shortTermHours =
    parsedHours && [2, 3, 4, 6, 12, 24].includes(parsedHours) ? parsedHours : 3;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1224] text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-br from-[#0f172a] via-[#0b1224] to-[#060913]" />

      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <header className="flex h-[8vh] min-h-[56px] items-center justify-between border-b border-slate-800/60 px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Nightscout Next</p>
            {fetchError ? (
              <p className="text-xs font-medium text-amber-300">
                {fetchError}. Showing placeholders until the connection is restored.
              </p>
            ) : null}
          </div>
          <div className="flex gap-3 text-sm text-slate-400">
            <Link href="/reports" className="underline decoration-slate-600 underline-offset-4 hover:text-white">
              Reports
            </Link>
            <Link href="/profile" className="underline decoration-slate-600 underline-offset-4 hover:text-white">
              Profile
            </Link>
            <Link href="/admin" className="underline decoration-slate-600 underline-offset-4 hover:text-white">
              Admin
            </Link>
          </div>
        </header>

        <DashboardClient
          initialEntries={entries}
          initialStatus={status}
          selectedHours={shortTermHours}
          requiresAuth={requiresAuth}
          thresholds={thresholds}
        />
      </div>
    </div>
  );
}
