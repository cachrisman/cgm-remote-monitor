import { type NextRequest, NextResponse } from "next/server";

import { resolveAuth } from "@/lib/api/auth";
import { getAppInfo } from "@/lib/api/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_VERSION = "3.0.4";

/**
 * GET /api/v3/status
 * 
 * Returns version information and API permissions granted for the authenticated user.
 * This endpoint requires authentication.
 * 
 * Response:
 * - status: 200
 * - result: { version, apiVersion, srvDate, storage, apiPermissions }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);

    // Check if authorized
    if (!auth.authorized && auth.permissions.length === 0) {
      return NextResponse.json(
        {
          status: 401,
          message: "Unauthorized",
          description: "Missing or invalid authentication token"
        },
        { status: 401 }
      );
    }

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
        },
        apiPermissions: auth.permissions
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to get status";
    return NextResponse.json(
      { status: 500, message },
      { status: 500 }
    );
  }
}

