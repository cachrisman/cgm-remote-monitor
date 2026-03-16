import { type NextRequest, NextResponse } from "next/server";

import {
  findProfiles,
  saveProfiles,
  deleteProfiles,
  getCurrentProfile
} from "@/lib/api/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/profile
 * 
 * Returns profile documents. By default returns the current (most recent) profile.
 * 
 * Query parameters:
 * - find[field]=value - Filter by field value
 * - count=n - Limit number of results
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Check for find params (both 'find' and nested 'find[...]')
    const hasFind = Array.from(searchParams.keys()).some(
      (k) => k === "find" || k.startsWith("find[")
    );
    
    // If no specific query params, return current profile
    if (!hasFind && !searchParams.has("count")) {
      const current = await getCurrentProfile();
      if (current) {
        return NextResponse.json([current]);
      }
      return NextResponse.json([]);
    }

    const profiles = await findProfiles(searchParams);
    return NextResponse.json(profiles);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read profiles";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * POST /api/v1/profile
 * 
 * Create or update profile(s)
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const saved = await saveProfiles(payload);
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/v1/profile
 * 
 * Delete profiles matching query
 */
export async function DELETE(request: NextRequest) {
  try {
    const result = await deleteProfiles(request.nextUrl.searchParams);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete profiles";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

