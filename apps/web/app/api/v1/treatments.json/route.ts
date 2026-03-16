import {
  DELETE as deleteTreatmentsHandler,
  GET as getTreatmentsHandler,
  POST as postTreatmentsHandler
} from "../treatments/route";

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return getTreatmentsHandler(request);
}

export async function POST(request: NextRequest) {
  return postTreatmentsHandler(request);
}

export async function DELETE(request: NextRequest) {
  return deleteTreatmentsHandler(request);
}
