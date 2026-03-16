import { ObjectId } from "mongodb";

import { getDeviceStatusCollection } from "./collections";
import { parseQuery, type QuerySpec } from "./query";
import { ensureObjectId, serializeDocument, serializeDocuments } from "./serialization";

export type DeviceStatusDocument = {
  _id?: ObjectId | string;
  created_at?: string;
  utcOffset?: number;
  device?: string;
  uploader?: { battery?: number; [key: string]: unknown };
  pump?: { battery?: { percent?: number }; [key: string]: unknown };
  status?: { status?: string; [key: string]: unknown };
  [key: string]: unknown;
};

const queryConfig = {
  dateField: "created_at",
  defaultSort: { created_at: -1 },
  // Reduce default window from 2 days to 1 day for better performance
  // Most queries specify their own date range anyway
  defaultDeltaMs: 1000 * 60 * 60 * 24,
  numberFields: [],
  useEpochDates: false,
  defaultLimit: 20
} as const;

function normalizeDeviceStatus(input: DeviceStatusDocument): DeviceStatusDocument {
  const createdAt =
    input.created_at ?? new Date().toISOString();
  const utcOffset = new Date(createdAt).getTimezoneOffset();

  return {
    ...input,
    _id: ensureObjectId(input._id),
    created_at: new Date(createdAt).toISOString(),
    utcOffset
  };
}

async function upsertDeviceStatus(status: DeviceStatusDocument) {
  const collection = await getDeviceStatusCollection();
  const normalized = normalizeDeviceStatus(status);
  const { _id, ...rest } = normalized;

  const filter = _id 
    ? { _id: _id instanceof ObjectId ? _id : new ObjectId(_id as string) } 
    : { created_at: rest.created_at, device: rest.device };

  const result = await collection.findOneAndUpdate(
    filter,
    { $set: rest },
    { upsert: true, returnDocument: "after" }
  );

  return result ? serializeDocument(result) : serializeDocument({ ...normalized, _id });
}

export async function findDeviceStatuses(searchParams: URLSearchParams) {
  const query: QuerySpec = parseQuery(searchParams, queryConfig);

  const collection = await getDeviceStatusCollection();

  // Test connection with a simple query first
  try {
    await collection.findOne({}, { projection: { _id: 1 } });
  } catch (error) {
    // Don't throw - try the actual query anyway
  }

  let docs;
  try {
    // Use find() with projection instead of aggregation - test showed this works much better
    // Only fetch fields that are actually used by the application
    // This dramatically reduces transfer size (from ~5.5KB to ~1-2KB per doc)
    // 
    // Simplified: No longer need complex projection for history queries
    // Basal calculation now uses profile + treatments only (matching legacy app)
    // Devicestatus queries are now only for status display (typically count: 5)
    const limit = query.limit ?? queryConfig.defaultLimit;
    
    const queryPromise = collection
      .find(query.filter)
      .sort(query.sort)
      .limit(limit)
      .maxTimeMS(3000)
      .toArray();
    
    // Add a hard JavaScript timeout as backup
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000);
    });
    
    docs = await Promise.race([queryPromise, timeoutPromise]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // If it's a timeout, return empty array instead of failing
    if (error instanceof Error && (
      errorMessage.includes('timeout') || 
      errorMessage.includes('time limit') ||
      errorMessage.includes('exceeded') ||
      errorMessage.includes('socket') ||
      errorMessage.includes('connection')
    )) {
      return [];
    }
    throw error;
  }
  
  return serializeDocuments(docs);
}

export async function deleteDeviceStatuses(searchParams: URLSearchParams) {
  const query: QuerySpec = parseQuery(searchParams, queryConfig);
  const collection = await getDeviceStatusCollection();
  const result = await collection.deleteMany(query.filter);
  return { deletedCount: result.deletedCount ?? 0 };
}

export async function saveDeviceStatuses(payload: unknown) {
  const statuses = Array.isArray(payload) ? payload : [payload];
  const normalized = statuses.filter(Boolean) as DeviceStatusDocument[];

  const persisted = [];
  for (const status of normalized) {
     
    const doc = await upsertDeviceStatus(status);
    persisted.push(doc);
  }

  return serializeDocuments(persisted);
}
