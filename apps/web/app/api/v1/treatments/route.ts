import { type NextRequest, NextResponse } from "next/server";

import { resolveAuth, checkPermission } from "@/lib/api/auth";
import {
  deleteTreatments,
  findTreatments,
  saveTreatments
} from "@/lib/api/treatments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    // Check read permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:treatments:read")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const treatments = await findTreatments(request.nextUrl.searchParams);
    return NextResponse.json(treatments);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read treatments";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check create permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:treatments:create")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = await request.json();
    const saved = await saveTreatments(payload);
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save treatments";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check delete permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:treatments:delete")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await deleteTreatments(request.nextUrl.searchParams);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete treatments";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
