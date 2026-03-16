import { type NextRequest } from "next/server";

import { GET as statusGet } from "../status/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return statusGet(request);
}
