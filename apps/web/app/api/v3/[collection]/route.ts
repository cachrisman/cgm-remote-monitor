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
import { serializeDocument, serializeDocuments } from "@/lib/api/serialization";
import { upsertV3Document, type V3Document } from "@/lib/api/v3-documents";
import { parseV3Query, buildProjection } from "@/lib/api/v3-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ collection: string }>;
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

function getCreatePermission(collection: string): string {
  if (collection === "settings") {
    return "api:settings:admin";
  }
  return `api:${collection}:create`;
}

/**
 * GET /api/v3/:collection
 * 
 * SEARCH operation: Search documents from the collection
 * 
 * Query parameters:
 * - Filter operators: field$eq, field$gt, field$gte, field$lt, field$lte, field$in, field$nin, field$re
 * - Sorting: sort=field, sort$desc=field
 * - Paging: limit=n, skip=n
 * - Fields: fields=field1,field2 or fields=_all
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { collection } = await params;

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
    const query = parseV3Query(request.nextUrl.searchParams);
    
    // Add isValid filter (exclude soft-deleted documents)
    query.filter = {
      ...query.filter,
      $or: [{ isValid: true }, { isValid: { $exists: false } }]
    };

    // Get collection
    const getCollection = COLLECTION_GETTERS[collection];
    const col = await getCollection();

    // Execute query
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

    return NextResponse.json({
      status: 200,
      result: serialized
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to search collection";
    return NextResponse.json(
      { status: 500, message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v3/:collection
 * 
 * CREATE operation: Create new document(s) in the collection
 * 
 * With deduplication enabled, if a document with the same identifier
 * exists, it will be updated instead.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { collection } = await params;

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

    // Check authorization
    const auth = await resolveAuth(request);
    const permission = getCreatePermission(collection);
    
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

    // Parse request body
    const payload = await request.json();
    const documents = Array.isArray(payload) ? payload : [payload];

    if (documents.length === 0) {
      return NextResponse.json(
        {
          status: 400,
          message: "Bad Request",
          description: "Request body is empty"
        },
        { status: 400 }
      );
    }

    // Get collection
    const getCollection = COLLECTION_GETTERS[collection];
    const col = await getCollection();

    // Insert/update documents
    const results: V3Document[] = [];
    for (const doc of documents) {
       
      const saved = await upsertV3Document(col, doc, collection);
      results.push(serializeDocument(saved));
    }

    // Return single document if single input, array if array input
    const result = Array.isArray(payload) ? results : results[0];
    const lastModified = results.length > 0 
      ? (results[results.length - 1].srvModified as number) 
      : Date.now();

    return NextResponse.json(
      {
        status: 201,
        result,
        lastModified
      },
      { 
        status: 201,
        headers: {
          "Last-Modified": new Date(lastModified).toUTCString()
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create document";
    return NextResponse.json(
      { status: 500, message },
      { status: 500 }
    );
  }
}

