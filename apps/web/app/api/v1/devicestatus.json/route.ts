import {
  DELETE as deleteDeviceStatus,
  GET as getDeviceStatus,
  POST as postDeviceStatus
} from "../devicestatus/route";

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return getDeviceStatus(request);
}

export async function POST(request: NextRequest) {
  return postDeviceStatus(request);
}

export async function DELETE(request: NextRequest) {
  return deleteDeviceStatus(request);
}
