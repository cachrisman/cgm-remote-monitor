import { ObjectId, type Sort } from "mongodb";
import { type NextRequest, NextResponse } from "next/server";

import { getTreatmentsCollection } from "@/lib/api/collections";
import { parseQuery, type QuerySpec } from "@/lib/api/query";
import { serializeDocument, serializeDocuments } from "@/lib/api/serialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ spec: string }>;
};

const defaultSort: Sort = { created_at: -1 };

const queryConfig = {
  dateField: "created_at",
  defaultSort,
  defaultDeltaMs: 1000 * 60 * 60 * 24 * 4,
  numberFields: ["glucose", "carbs", "insulin", "duration"],
  useEpochDates: false,
  defaultLimit: 50
};

/**
 * Check if a string is a valid MongoDB ObjectId
 */
function isValidObjectId(str: string): boolean {
  if (str.length !== 24) return false;
  return /^[0-9a-fA-F]{24}$/.test(str);
}

/**
 * GET /api/v1/treatments/:spec
 * 
 * The spec parameter can be:
 * - A MongoDB ObjectId (24 hex chars) - returns single treatment by ID
 * - An eventType filter - returns treatments of that type
 * 
 * Query parameters:
 * - find[field]=value - Filter by field value
 * - count=n - Limit number of results
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { spec } = await params;
    const collection = await getTreatmentsCollection();

    // Check if spec is an ObjectId
    if (isValidObjectId(spec)) {
      const doc = await collection.findOne({ _id: new ObjectId(spec) });
      if (!doc) {
        return NextResponse.json({ error: 'Treatment not found' }, { status: 404 });
      }
      // Return single treatment as array per legacy behavior
      return NextResponse.json([serializeDocument(doc)]);
    }

    // Treat spec as an eventType filter
    const query: QuerySpec = parseQuery(request.nextUrl.searchParams, queryConfig);
    
    // Add eventType filter
    query.filter = { ...query.filter, eventType: spec };

    const cursor = collection
      .find(query.filter)
      .sort(query.sort)
      .limit(query.limit ?? queryConfig.defaultLimit);

    const docs = await cursor.toArray();
    return NextResponse.json(serializeDocuments(docs));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read treatments";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/v1/treatments/:spec
 * 
 * Delete treatment by ID or by eventType filter
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { spec } = await params;
    const collection = await getTreatmentsCollection();

    // Check if spec is an ObjectId - delete single treatment
    if (isValidObjectId(spec)) {
      const result = await collection.deleteOne({ _id: new ObjectId(spec) });
      if (result.deletedCount === 0) {
        return NextResponse.json({ error: 'Treatment not found' }, { status: 404 });
      }
      return NextResponse.json({ deletedCount: result.deletedCount });
    }

    // Treat spec as an eventType filter - delete all treatments of that type
    const query: QuerySpec = parseQuery(request.nextUrl.searchParams, queryConfig);
    query.filter = { ...query.filter, eventType: spec };
    
    const result = await collection.deleteMany(query.filter);
    return NextResponse.json({ deletedCount: result.deletedCount ?? 0 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete treatments";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * PUT /api/v1/treatments/:spec
 * 
 * Update treatment by ID
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { spec } = await params;
    const collection = await getTreatmentsCollection();

    if (!isValidObjectId(spec)) {
      return NextResponse.json(
        { error: 'Invalid treatment ID format' },
        { status: 400 }
      );
    }

    const payload = await request.json();
    const updates = { ...payload };
    delete updates._id;

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(spec) },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) {
      return NextResponse.json({ error: 'Treatment not found' }, { status: 404 });
    }

    return NextResponse.json(serializeDocument(result));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update treatment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

