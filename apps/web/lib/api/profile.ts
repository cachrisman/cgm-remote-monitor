import { ObjectId } from "mongodb";

import { getProfileCollection } from "./collections";
import { parseQuery, type QuerySpec } from "./query";
import { ensureObjectId, serializeDocument, serializeDocuments } from "./serialization";

export type ProfileDocument = {
  _id?: ObjectId | string;
  created_at?: string;
  startDate?: string;
  defaultProfile?: string;
  store?: Record<string, ProfileStore>;
  units?: string;
  [key: string]: unknown;
};

export type ProfileStore = {
  dia?: number;
  carbratio?: Array<{ time: string; value: number }>;
  carbs_hr?: number;
  delay?: number;
  sens?: Array<{ time: string; value: number }>;
  timezone?: string;
  basal?: Array<{ time: string; value: number }>;
  target_low?: Array<{ time: string; value: number }>;
  target_high?: Array<{ time: string; value: number }>;
  [key: string]: unknown;
};

const queryConfig = {
  dateField: "created_at",
  defaultSort: { created_at: -1 },
  defaultDeltaMs: 1000 * 60 * 60 * 24 * 30, // 30 days
  numberFields: [],
  useEpochDates: false,
  defaultLimit: 10
} as const;

function normalizeProfile(input: ProfileDocument): ProfileDocument {
  const createdAt = input.created_at ?? new Date().toISOString();

  return {
    ...input,
    _id: ensureObjectId(input._id),
    created_at: new Date(createdAt).toISOString()
  };
}

async function upsertProfile(profile: ProfileDocument) {
  const collection = await getProfileCollection();
  const normalized = normalizeProfile(profile);
  const { _id, ...rest } = normalized;

  const filter = _id
    ? { _id: _id instanceof ObjectId ? _id : new ObjectId(_id as string) }
    : { created_at: rest.created_at, defaultProfile: rest.defaultProfile };

  const result = await collection.findOneAndUpdate(
    filter,
    { $set: rest },
    { upsert: true, returnDocument: "after" }
  );

  return result ? serializeDocument(result) : serializeDocument({ ...normalized, _id });
}

export async function findProfiles(searchParams: URLSearchParams) {
  const query: QuerySpec = parseQuery(searchParams, queryConfig);
  const collection = await getProfileCollection();

  const cursor = collection
    .find(query.filter)
    .sort(query.sort)
    .limit(query.limit ?? queryConfig.defaultLimit);

  const docs = await cursor.toArray();
  return serializeDocuments(docs);
}

export async function findProfileById(id: string) {
  const collection = await getProfileCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  return doc ? serializeDocument(doc) : null;
}

export async function deleteProfiles(searchParams: URLSearchParams) {
  const query: QuerySpec = parseQuery(searchParams, queryConfig);
  const collection = await getProfileCollection();
  const result = await collection.deleteMany(query.filter);
  return { deletedCount: result.deletedCount ?? 0 };
}

export async function deleteProfileById(id: string) {
  const collection = await getProfileCollection();
  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  return { deletedCount: result.deletedCount ?? 0 };
}

export async function saveProfiles(payload: unknown) {
  const profiles = Array.isArray(payload) ? payload : [payload];
  const normalized = profiles.filter(Boolean) as ProfileDocument[];

  const persisted = [];
  for (const profile of normalized) {
     
    const doc = await upsertProfile(profile);
    persisted.push(doc);
  }

  return serializeDocuments(persisted);
}

/**
 * Get the current active profile
 * Returns the most recent profile document
 */
export async function getCurrentProfile() {
  const collection = await getProfileCollection();
  const doc = await collection.findOne({}, { sort: { created_at: -1 } });
  return doc ? serializeDocument(doc) : null;
}

