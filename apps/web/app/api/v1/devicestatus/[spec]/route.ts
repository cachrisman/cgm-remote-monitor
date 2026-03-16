import { ObjectId } from "mongodb";
import { type NextRequest, NextResponse } from "next/server";

import { resolveAuth, checkPermission } from "@/lib/api/auth";
import { getDeviceStatusCollection } from "@/lib/api/collections";
import { parseQuery, type QuerySpec } from "@/lib/api/query";
import { serializeDocument, serializeDocuments } from "@/lib/api/serialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ spec: string }>;
};

const queryConfig = {
  dateField: "created_at",
  defaultSort: { created_at: -1 },
  defaultDeltaMs: 1000 * 60 * 60 * 24 * 2,
  numberFields: [],
  useEpochDates: false,
  defaultLimit: 20
} as const;

/**
 * Check if a string is a valid MongoDB ObjectId
 */
function isValidObjectId(str: string): boolean {
  if (str.length !== 24) return false;
  return /^[0-9a-fA-F]{24}$/.test(str);
}

/**
 * GET /api/v1/devicestatus/:spec
 * 
 * The spec parameter can be:
 * - A MongoDB ObjectId (24 hex chars) - returns single devicestatus by ID
 * - A device filter - returns devicestatus for that device
 * 
 * Query parameters:
 * - find[field]=value - Filter by field value
 * - count=n - Limit number of results
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Check read permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:devicestatus:read")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { spec } = await params;
    const collection = await getDeviceStatusCollection();

    // Check if spec is an ObjectId
    if (isValidObjectId(spec)) {
      const doc = await collection.findOne({ _id: new ObjectId(spec) });
      if (!doc) {
        return NextResponse.json({ error: 'Device status not found' }, { status: 404 });
      }
      // Return single status as array per legacy behavior
      return NextResponse.json([serializeDocument(doc)]);
    }

    // Treat spec as a device filter
    const query: QuerySpec = parseQuery(request.nextUrl.searchParams, queryConfig);
    
    // Add device filter
    query.filter = { ...query.filter, device: spec };

    const cursor = collection
      .find(query.filter)
      .sort(query.sort)
      .limit(query.limit ?? queryConfig.defaultLimit);

    const docs = await cursor.toArray();
    return NextResponse.json(serializeDocuments(docs));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read device status";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/v1/devicestatus/:spec
 * 
 * Delete devicestatus by ID or by device filter
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Check delete permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:devicestatus:delete")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { spec } = await params;
    const collection = await getDeviceStatusCollection();

    // Check if spec is an ObjectId - delete single status
    if (isValidObjectId(spec)) {
      const result = await collection.deleteOne({ _id: new ObjectId(spec) });
      if (result.deletedCount === 0) {
        return NextResponse.json({ error: 'Device status not found' }, { status: 404 });
      }
      return NextResponse.json({ deletedCount: result.deletedCount });
    }

    // Treat spec as a device filter - delete all statuses for that device
    const query: QuerySpec = parseQuery(request.nextUrl.searchParams, queryConfig);
    query.filter = { ...query.filter, device: spec };
    
    const result = await collection.deleteMany(query.filter);
    return NextResponse.json({ deletedCount: result.deletedCount ?? 0 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete device status";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

