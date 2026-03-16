import {
  DELETE as deleteEntriesHandler,
  GET as getEntriesHandler,
  POST as postEntriesHandler
} from "../entries/route";

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return getEntriesHandler(request);
}

export async function POST(request: NextRequest) {
  return postEntriesHandler(request);
}

export async function DELETE(request: NextRequest) {
  return deleteEntriesHandler(request);
}
