import { type NextRequest, NextResponse } from "next/server";

import { resolveAuth, checkPermission } from "@/lib/api/auth";
import { deleteEntries, findEntries, saveEntries } from "@/lib/api/entries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    // Check read permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:entries:read")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const entries = await findEntries(request.nextUrl.searchParams);
    return NextResponse.json(entries);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read entries";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check create permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:entries:create")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = await request.json();
    const saved = await saveEntries(payload);
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save entries";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check delete permission (requires admin)
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:entries:delete")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await deleteEntries(request.nextUrl.searchParams);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete entries";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
