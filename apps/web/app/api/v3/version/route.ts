import { NextResponse } from "next/server";

import { getAppInfo } from "@/lib/api/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_VERSION = "3.0.4";

/**
 * GET /api/v3/version
 * 
 * Returns version information. This endpoint is public (no authentication required).
 * 
 * Response:
 * - status: 200
 * - result: { version, apiVersion, srvDate, storage }
 */
export async function GET() {
  try {
    const appInfo = getAppInfo();
    const srvDate = Date.now();

    const response = {
      status: 200,
      result: {
        version: appInfo.version,
        apiVersion: API_VERSION,
        srvDate,
        storage: {
          type: "mongodb",
          version: "7.0"
        }
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to get version";
    return NextResponse.json(
      { status: 500, message },
      { status: 500 }
    );
  }
}

