import { ObjectId } from "mongodb";

import { getEntriesCollection } from "./collections";
import { parseQuery, type QuerySpec } from "./query";
import { ensureObjectId, serializeDocument, serializeDocuments } from "./serialization";

export type EntryDocument = {
  _id?: ObjectId | string;
  type?: string;
  sgv?: number;
  mbg?: number;
  direction?: string;
  date?: number;
  dateString?: string;
  sysTime?: string;
  device?: string;
  utcOffset?: number;
  filtered?: number;
  unfiltered?: number;
  rssi?: number;
  noise?: number;
  mills?: number;
  [key: string]: unknown;
};

const DEFAULT_ENTRY_TYPE = "sgv";

const queryConfig = {
  dateField: "date",
  defaultSort: { date: -1 },
  defaultDeltaMs: 1000 * 60 * 60 * 24 * 4,
  numberFields: ["date", "sgv", "mbg", "filtered", "unfiltered", "rssi", "noise"],
  useEpochDates: true,
  defaultLimit: 10
} as const;

function toTimestamp(value?: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return Date.now();
}

function normalizeEntry(input: EntryDocument): EntryDocument {
  const timestamp = toTimestamp(
    input.dateString ?? input.sysTime ?? input.date ?? input.mills
  );
  const iso = new Date(timestamp).toISOString();
  const utcOffset = new Date(timestamp).getTimezoneOffset();
  const type = input.type ?? DEFAULT_ENTRY_TYPE;

  const objectId = ensureObjectId(input._id);

  return {
    ...input,
    _id: objectId,
    type,
    date: timestamp,
    mills: input.mills ?? timestamp,
    dateString: iso,
    sysTime: iso,
    utcOffset
  };
}

async function upsertEntry(entry: EntryDocument) {
  const collection = await getEntriesCollection();
  const normalized = normalizeEntry(entry);
  const { _id, ...rest } = normalized;

  const filter =
    _id !== undefined
      ? { _id: _id instanceof ObjectId ? _id : new ObjectId(_id as string) }
      : {
          sysTime: rest.sysTime,
          type: rest.type
        };

  const result = await collection.findOneAndUpdate(
    filter,
    { $set: rest },
    {
      upsert: true,
      returnDocument: "after"
    }
  );

  return result ? serializeDocument(result) : serializeDocument({ ...normalized, _id });
}

export async function findEntries(searchParams: URLSearchParams) {
  const query: QuerySpec = parseQuery(searchParams, queryConfig);
  const collection = await getEntriesCollection();

  // Minimal projection - only fields needed for dashboard display
  // normalizeGlucoseEntry uses: glucose/sgv/mgdl/value, date/dateString/sysTime, direction
  // Also need device for filtering out "nightscout-connect"
  // date (number) can be converted to ISO string, so dateString/sysTime not needed
  const projection = {
    _id: 1,
    glucose: 1, // Primary glucose value (normalizeGlucoseEntry will use this)
    direction: 1, // Arrow direction
    date: 1, // Timestamp (number, can be converted to ISO string)
    device: 1 // For filtering out "nightscout-connect"
    // Removed: type, utcOffset, sysTime, dateString, sgv, unfiltered, filtered, mbg, rssi, noise, mills
    // type is only used for API filtering, not dashboard display
    // date (number) is sufficient - toIsoString() can convert it
  };

  const cursor = collection
    .find(query.filter)
    .sort(query.sort)
    .limit(query.limit ?? queryConfig.defaultLimit)
    .project(projection);

  const docs = await cursor.toArray();
  return serializeDocuments(docs);
}

export async function deleteEntries(searchParams: URLSearchParams) {
  const query: QuerySpec = parseQuery(searchParams, queryConfig);
  const collection = await getEntriesCollection();
  const result = await collection.deleteMany(query.filter);
  return { deletedCount: result.deletedCount ?? 0 };
}

export async function saveEntries(payload: unknown) {
  const entries = Array.isArray(payload) ? payload : [payload];
  const normalized = entries.filter(Boolean) as EntryDocument[];

  const persisted = [];
  for (const entry of normalized) {
     
    const doc = await upsertEntry(entry);
    persisted.push(doc);
  }

  return serializeDocuments(persisted);
}
