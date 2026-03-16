import { type NextRequest, NextResponse } from "next/server";

import { resolveAuth, checkPermission } from "@/lib/api/auth";
import {
  deleteDeviceStatuses,
  findDeviceStatuses,
  saveDeviceStatuses
} from "@/lib/api/devicestatus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    // Check read permission
    const auth = await resolveAuth(request);
    
    if (!checkPermission(auth.permissions, "api:devicestatus:read")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const statuses = await findDeviceStatuses(request.nextUrl.searchParams);
    const response = NextResponse.json(statuses);
    
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read device status";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check create permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:devicestatus:create")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = await request.json();
    const saved = await saveDeviceStatuses(payload);
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save device status";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check delete permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:devicestatus:delete")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await deleteDeviceStatuses(request.nextUrl.searchParams);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete device status";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
