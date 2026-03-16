import { ObjectId } from "mongodb";
import { type NextRequest, NextResponse } from "next/server";

import { resolveAuth, checkPermission } from "@/lib/api/auth";
import { getEntriesCollection } from "@/lib/api/collections";
import { deleteEntries } from "@/lib/api/entries";
import { parseQuery, type QuerySpec } from "@/lib/api/query";
import { serializeDocument, serializeDocuments } from "@/lib/api/serialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ spec: string }>;
};

const queryConfig = {
  dateField: "date",
  defaultSort: { date: -1 },
  defaultDeltaMs: 1000 * 60 * 60 * 24 * 4,
  numberFields: ["date", "sgv", "mbg", "filtered", "unfiltered", "rssi", "noise"],
  useEpochDates: true,
  defaultLimit: 10
} as const;

/**
 * Check if a string is a valid MongoDB ObjectId
 */
function isValidObjectId(str: string): boolean {
  if (str.length !== 24) return false;
  return /^[0-9a-fA-F]{24}$/.test(str);
}

/**
 * GET /api/v1/entries/:spec
 * 
 * The spec parameter can be:
 * - A MongoDB ObjectId (24 hex chars) - returns single entry by ID
 * - A type filter like 'sgv', 'mbg', etc. - returns entries of that type
 * - 'current' - returns the most recent entry
 * 
 * Query parameters:
 * - find[field]=value - Filter by field value
 * - count=n - Limit number of results
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Check read permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:entries:read")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }
    const { spec } = await params;
    const collection = await getEntriesCollection();

    // Handle 'current' special case
    if (spec === 'current') {
      const doc = await collection.findOne({}, { sort: { date: -1 } });
      if (!doc) {
        return NextResponse.json({ error: 'No entries found' }, { status: 404 });
      }
      return NextResponse.json(serializeDocument(doc));
    }

    // Check if spec is an ObjectId
    if (isValidObjectId(spec)) {
      const doc = await collection.findOne({ _id: new ObjectId(spec) });
      if (!doc) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      }
      // Return single entry as array per legacy behavior
      return NextResponse.json([serializeDocument(doc)]);
    }

    // Treat spec as a type filter
    const query: QuerySpec = parseQuery(request.nextUrl.searchParams, queryConfig);
    
    // Add type filter
    query.filter = { ...query.filter, type: spec };

    const cursor = collection
      .find(query.filter)
      .sort(query.sort)
      .limit(query.limit ?? queryConfig.defaultLimit);

    const docs = await cursor.toArray();
    return NextResponse.json(serializeDocuments(docs));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read entries";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/v1/entries/:spec
 * 
 * Delete entry by ID or entries matching type filter
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Check delete permission
    const auth = await resolveAuth(request);
    if (!checkPermission(auth.permissions, "api:entries:delete")) {
      return NextResponse.json(
        { status: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { spec } = await params;
    const collection = await getEntriesCollection();

    // Check if spec is an ObjectId - delete single entry
    if (isValidObjectId(spec)) {
      const result = await collection.deleteOne({ _id: new ObjectId(spec) });
      if (result.deletedCount === 0) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      }
      return NextResponse.json({ deletedCount: result.deletedCount });
    }

    // Treat spec as a type filter - delete all entries of that type
    // This uses the existing deleteEntries function with an added type filter
    const searchParams = new URLSearchParams(request.nextUrl.searchParams);
    searchParams.set('find[type]', spec);
    
    const result = await deleteEntries(searchParams);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete entries";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

