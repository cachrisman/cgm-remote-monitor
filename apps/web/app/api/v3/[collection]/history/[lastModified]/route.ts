import { type Collection, type Document } from "mongodb";
import { type NextRequest, NextResponse } from "next/server";

import { resolveAuth, checkPermission } from "@/lib/api/auth";
import {
  getEntriesCollection,
  getTreatmentsCollection,
  getDeviceStatusCollection,
  getProfileCollection,
  getFoodCollection,
  getSettingsCollection
} from "@/lib/api/collections";
import { serializeDocuments } from "@/lib/api/serialization";
import { parseV3Query, buildProjection } from "@/lib/api/v3-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ collection: string; lastModified: string }>;
};

const VALID_COLLECTIONS = ["entries", "treatments", "devicestatus", "profile", "food", "settings"];

type CollectionGetter = () => Promise<Collection<Document>>;

const COLLECTION_GETTERS: Record<string, CollectionGetter> = {
  entries: getEntriesCollection,
  treatments: getTreatmentsCollection,
  devicestatus: getDeviceStatusCollection,
  profile: getProfileCollection,
  food: getFoodCollection,
  settings: getSettingsCollection
};

function getReadPermission(collection: string): string {
  if (collection === "settings") {
    return "api:settings:admin";
  }
  return `api:${collection}:read`;
}

/**
 * GET /api/v3/:collection/history/:lastModified
 * 
 * HISTORY2 operation: Get documents modified since the given timestamp
 * 
 * Path parameters:
 * - lastModified: Unix timestamp in milliseconds
 * 
 * Query parameters:
 * - All standard query parameters (filter, sort, limit, skip, fields)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { collection, lastModified: lastModifiedParam } = await params;

    // Validate collection name
    if (!VALID_COLLECTIONS.includes(collection)) {
      return NextResponse.json(
        {
          status: 404,
          message: "Not Found",
          description: `Collection '${collection}' not found`
        },
        { status: 404 }
      );
    }

    // Parse lastModified parameter
    const lastModified = parseInt(lastModifiedParam, 10);
    if (isNaN(lastModified)) {
      return NextResponse.json(
        {
          status: 400,
          message: "Bad Request",
          description: "Invalid lastModified timestamp"
        },
        { status: 400 }
      );
    }

    // Check authorization
    const auth = await resolveAuth(request);
    const permission = getReadPermission(collection);
    
    if (!checkPermission(auth.permissions, permission)) {
      return NextResponse.json(
        {
          status: auth.authorized ? 403 : 401,
          message: auth.authorized ? "Forbidden" : "Unauthorized",
          description: `Missing permission: ${permission}`
        },
        { status: auth.authorized ? 403 : 401 }
      );
    }

    // Parse query parameters
    const query = parseV3Query(request.nextUrl.searchParams, {
      defaultSort: { srvModified: 1 }
    });

    // Add history filter
    query.filter = {
      ...query.filter,
      srvModified: { $gt: lastModified }
    };

    // Get collection
    const getCollection = COLLECTION_GETTERS[collection];
    const col = await getCollection();

    // Execute query (includes soft-deleted documents for history)
    const projection = buildProjection(query.fields);
    let cursor = col
      .find(query.filter)
      .sort(query.sort)
      .skip(query.skip)
      .limit(query.limit);

    if (projection) {
      cursor = cursor.project(projection);
    }

    const docs = await cursor.toArray();
    const serialized = serializeDocuments(docs);

    // Get the latest srvModified timestamp
    let latestModified = 0;
    for (const doc of docs) {
      const srvModified = (doc as { srvModified?: number }).srvModified;
      if (srvModified && srvModified > latestModified) {
        latestModified = srvModified;
      }
    }

    return NextResponse.json({
      status: 200,
      result: serialized,
      lastModified: latestModified || Date.now()
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to get history";
    return NextResponse.json(
      { status: 500, message },
      { status: 500 }
    );
  }
}

