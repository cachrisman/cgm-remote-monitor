import { type NextRequest, NextResponse } from "next/server";

import { resolveAuth, getAuthorizationInfo } from "@/lib/api/auth";
import { checkPermission } from "@/lib/api/auth";
import {
  getFilteredSettings,
  getExtendedSettings,
  getAppInfo,
  isEnabled
} from "@/lib/api/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/status
 * 
 * Returns server status, settings, and capabilities matching the legacy
 * response structure defined in lib/server/swagger.json.
 * 
 * Response schema:
 * - status: 'ok'
 * - name: app name
 * - version: app version
 * - serverTime: ISO timestamp
 * - serverTimeEpoch: Unix epoch ms
 * - apiEnabled: boolean
 * - careportalEnabled: boolean
 * - boluscalcEnabled: boolean
 * - settings: Settings object
 * - extendedSettings: Plugin-specific settings
 * - authorized: Authorization info or null
 * - runtimeState: Runtime state object
 */
export async function GET(request: NextRequest) {
  try {
    // Check permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, 'api:status:read')) {
      return NextResponse.json(
        { status: 401, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const date = new Date();
    const appInfo = getAppInfo();
    const settings = getFilteredSettings();
    const extendedSettings = getExtendedSettings();
    const authorized = await getAuthorizationInfo(request);

    // Build runtime state (minimal for now, can be expanded)
    const runtimeState = {
      lastDataUpdate: date.getTime()
    };

    const response = {
      status: 'ok',
      name: appInfo.name,
      version: appInfo.version,
      serverTime: date.toISOString(),
      serverTimeEpoch: date.getTime(),
      apiEnabled: true,
      careportalEnabled: isEnabled('careportal'),
      boluscalcEnabled: isEnabled('boluscalc'),
      settings,
      extendedSettings,
      authorized,
      runtimeState
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read status";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
