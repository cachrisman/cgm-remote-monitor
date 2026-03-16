import { type NextRequest, NextResponse } from "next/server";

import { resolveAuth, checkPermission } from "@/lib/api/auth";
import { buildStatusSummary } from "@/lib/api/status-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    // Check read permission for status
    const authStart = Date.now();
    const auth = await resolveAuth(request);
    const authTime = Date.now() - authStart;
    if (authTime > 1000) {
      console.warn(`[status] Slow auth resolution: ${authTime}ms`);
    }
    
    if (!checkPermission(auth.permissions, "api:status:read")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const summaryStart = Date.now();
    const { status, latestEntry } = await buildStatusSummary();
    const summaryTime = Date.now() - summaryStart;
    const totalTime = Date.now() - startTime;
    
    if (summaryTime > 1000) {
      console.warn(`[status] Slow buildStatusSummary: ${summaryTime}ms, total: ${totalTime}ms`);
    }

    return NextResponse.json({
      status,
      latestEntry
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[status] Error after ${totalTime}ms:`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to fetch Nightscout status"
      },
      { status: 502 }
    );
  }
}
