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
import { serializeDocument } from "@/lib/api/serialization";
import {
  findByIdentifier,
  upsertV3Document,
  softDeleteV3Document,
  hardDeleteV3Document,
  validateModification,
  type V3Document
} from "@/lib/api/v3-documents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ collection: string; identifier: string }>;
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

function getUpdatePermission(collection: string): string {
  if (collection === "settings") {
    return "api:settings:admin";
  }
  return `api:${collection}:update`;
}

function getDeletePermission(collection: string): string {
  if (collection === "settings") {
    return "api:settings:admin";
  }
  return `api:${collection}:delete`;
}

/**
 * GET /api/v3/:collection/:identifier
 * 
 * READ operation: Get a single document by identifier
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { collection, identifier } = await params;

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

    // Get collection and find document
    const getCollection = COLLECTION_GETTERS[collection];
    const col = await getCollection();
    const doc = await findByIdentifier(col, identifier);

    if (!doc) {
      return NextResponse.json(
        {
          status: 404,
          message: "Not Found",
          description: `Document with identifier '${identifier}' not found`
        },
        { status: 404 }
      );
    }

    // Check if document is soft-deleted
    if ((doc as V3Document).isValid === false) {
      return NextResponse.json(
        {
          status: 410,
          message: "Gone",
          description: "Document has been deleted"
        },
        { status: 410 }
      );
    }

    const serialized = serializeDocument(doc);
    const lastModified = (doc as V3Document).srvModified || Date.now();

    return NextResponse.json(
      {
        status: 200,
        result: serialized
      },
      {
        headers: {
          "Last-Modified": new Date(lastModified).toUTCString()
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read document";
    return NextResponse.json(
      { status: 500, message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v3/:collection/:identifier
 * 
 * UPDATE operation: Replace entire document
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { collection, identifier } = await params;

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
    const permission = getUpdatePermission(collection);
    
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

    // Get collection and find existing document
    const getCollection = COLLECTION_GETTERS[collection];
    const col = await getCollection();
    const existing = await findByIdentifier(col, identifier);

    // Validate modification
    const validation = validateModification(existing as V3Document, "update");
    if (!validation.valid) {
      return NextResponse.json(
        {
          status: existing ? 410 : 404,
          message: existing ? "Gone" : "Not Found",
          description: validation.error
        },
        { status: existing ? 410 : 404 }
      );
    }

    // Parse request body and update
    const payload = await request.json();
    payload.identifier = identifier; // Ensure identifier matches

    const saved = await upsertV3Document(col, payload, collection);
    const serialized = serializeDocument(saved);
    const lastModified = (saved as V3Document).srvModified || Date.now();

    return NextResponse.json(
      {
        status: 200,
        result: serialized,
        lastModified
      },
      {
        headers: {
          "Last-Modified": new Date(lastModified).toUTCString()
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update document";
    return NextResponse.json(
      { status: 500, message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v3/:collection/:identifier
 * 
 * PATCH operation: Partial update of document
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { collection, identifier } = await params;

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
    const permission = getUpdatePermission(collection);
    
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

    // Get collection and find existing document
    const getCollection = COLLECTION_GETTERS[collection];
    const col = await getCollection();
    const existing = await findByIdentifier(col, identifier);

    // Validate modification
    const validation = validateModification(existing as V3Document, "update");
    if (!validation.valid) {
      return NextResponse.json(
        {
          status: existing ? 410 : 404,
          message: existing ? "Gone" : "Not Found",
          description: validation.error
        },
        { status: existing ? 410 : 404 }
      );
    }

    // Parse request body and merge with existing
    const payload = await request.json();
    const merged = { ...existing, ...payload, identifier };

    const saved = await upsertV3Document(col, merged, collection);
    const serialized = serializeDocument(saved);
    const lastModified = (saved as V3Document).srvModified || Date.now();

    return NextResponse.json(
      {
        status: 200,
        result: serialized,
        lastModified
      },
      {
        headers: {
          "Last-Modified": new Date(lastModified).toUTCString()
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to patch document";
    return NextResponse.json(
      { status: 500, message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v3/:collection/:identifier
 * 
 * DELETE operation: Delete document (soft or hard based on query param)
 * 
 * Query params:
 * - permanent=true: Hard delete (permanently remove)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { collection, identifier } = await params;

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
    const permission = getDeletePermission(collection);
    
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

    // Get collection and find existing document
    const getCollection = COLLECTION_GETTERS[collection];
    const col = await getCollection();
    const existing = await findByIdentifier(col, identifier);

    // Validate deletion
    const validation = validateModification(existing as V3Document, "delete");
    if (!validation.valid) {
      return NextResponse.json(
        {
          status: existing ? 410 : 404,
          message: existing ? "Gone" : "Not Found",
          description: validation.error
        },
        { status: existing ? 410 : 404 }
      );
    }

    // Check if permanent delete
    const permanent = request.nextUrl.searchParams.get("permanent") === "true";

    let deleted: boolean;
    if (permanent) {
      deleted = await hardDeleteV3Document(col, identifier);
    } else {
      deleted = await softDeleteV3Document(col, identifier);
    }

    if (!deleted) {
      return NextResponse.json(
        {
          status: 404,
          message: "Not Found",
          description: "Document not found or already deleted"
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 200
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete document";
    return NextResponse.json(
      { status: 500, message },
      { status: 500 }
    );
  }
}

