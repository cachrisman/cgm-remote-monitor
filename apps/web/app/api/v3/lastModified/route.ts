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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CollectionInfo = {
  name: string;
  permission: string;
  dateFields: string[];
  getCollection: typeof getEntriesCollection;
};

const COLLECTIONS: CollectionInfo[] = [
  {
    name: "entries",
    permission: "api:entries:read",
    dateFields: ["date", "srvModified", "srvCreated"],
    getCollection: getEntriesCollection
  },
  {
    name: "treatments",
    permission: "api:treatments:read",
    dateFields: ["created_at", "srvModified", "srvCreated"],
    getCollection: getTreatmentsCollection
  },
  {
    name: "devicestatus",
    permission: "api:devicestatus:read",
    dateFields: ["created_at", "srvModified", "srvCreated"],
    getCollection: getDeviceStatusCollection
  },
  {
    name: "profile",
    permission: "api:profile:read",
    dateFields: ["created_at", "srvModified", "srvCreated"],
    getCollection: getProfileCollection
  },
  {
    name: "food",
    permission: "api:food:read",
    dateFields: ["created_at", "srvModified", "srvCreated"],
    getCollection: getFoodCollection
  },
  {
    name: "settings",
    permission: "api:settings:admin",
    dateFields: ["srvModified", "srvCreated"],
    getCollection: getSettingsCollection
  }
];

/**
 * Get the last modified timestamp for a collection
 */
async function getCollectionLastModified(
  info: CollectionInfo
): Promise<number | null> {
  try {
    const collection = await info.getCollection();
    
    // Try to find the most recently modified document
    for (const field of info.dateFields) {
      const doc = await collection.findOne(
        { [field]: { $exists: true } },
        { sort: { [field]: -1 }, projection: { [field]: 1 } }
      );
      
      if (doc) {
        const value = doc[field];
        if (typeof value === "number") {
          return value;
        }
        if (typeof value === "string") {
          const parsed = Date.parse(value);
          if (!isNaN(parsed)) {
            return parsed;
          }
        }
        if (value instanceof Date) {
          return value.getTime();
        }
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/v3/lastModified
 * 
 * Retrieves timestamp of the last modification of every collection.
 * For each collection, the permission is checked separately. You will get
 * timestamps only for collections you have access to.
 * 
 * Response:
 * - status: 200
 * - result: { srvDate, collections: { entries, treatments, ... } }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);

    // Check if authorized (need at least some permissions)
    if (!auth.authorized && auth.permissions.length === 0) {
      return NextResponse.json(
        {
          status: 401,
          message: "Unauthorized",
          description: "Missing or invalid authentication token"
        },
        { status: 401 }
      );
    }

    const srvDate = Date.now();
    const collections: Record<string, number | null> = {};

    // Check each collection in parallel
    const results = await Promise.all(
      COLLECTIONS.map(async (info) => {
        // Check permission for this collection
        if (!checkPermission(auth.permissions, info.permission)) {
          return { name: info.name, lastModified: null, hasPermission: false };
        }
        
        const lastModified = await getCollectionLastModified(info);
        return { name: info.name, lastModified, hasPermission: true };
      })
    );

    // Build the collections object, only including those with permission
    for (const result of results) {
      if (result.hasPermission) {
        collections[result.name] = result.lastModified;
      }
    }

    const response = {
      status: 200,
      result: {
        srvDate,
        collections
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to get last modified";
    return NextResponse.json(
      { status: 500, message },
      { status: 500 }
    );
  }
}

