import {
  DELETE as deleteProfileHandler,
  GET as getProfileHandler,
  POST as postProfileHandler
} from "../profile/route";

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return getProfileHandler(request);
}

export async function POST(request: NextRequest) {
  return postProfileHandler(request);
}

export async function DELETE(request: NextRequest) {
  return deleteProfileHandler(request);
}

