import { ObjectId } from "mongodb";

import { getTreatmentsCollection } from "./collections";
import { parseQuery, type QuerySpec } from "./query";
import { ensureObjectId, serializeDocument, serializeDocuments } from "./serialization";

export type TreatmentDocument = {
  _id?: ObjectId | string;
  eventType?: string;
  created_at?: string;
  glucose?: number;
  glucoseType?: string;
  carbs?: number;
  insulin?: number;
  duration?: number;
  notes?: string;
  utcOffset?: number;
  [key: string]: unknown;
};

const queryConfig = {
  dateField: "created_at",
  defaultSort: { created_at: -1 },
  defaultDeltaMs: 1000 * 60 * 60 * 24 * 4,
  numberFields: ["glucose", "carbs", "insulin", "duration"],
  useEpochDates: false,
  defaultLimit: 50
} as const;

function normalizeTreatment(input: TreatmentDocument): TreatmentDocument {
  const createdAt = input.created_at ?? new Date().toISOString();
  const utcOffset = new Date(createdAt).getTimezoneOffset();

  return {
    ...input,
    _id: ensureObjectId(input._id),
    created_at: new Date(createdAt).toISOString(),
    utcOffset,
    glucose: input.glucose !== undefined ? Number(input.glucose) : input.glucose,
    carbs: input.carbs !== undefined ? Number(input.carbs) : input.carbs,
    insulin: input.insulin !== undefined ? Number(input.insulin) : input.insulin,
    duration:
      input.duration !== undefined ? Number(input.duration) : input.duration
  };
}

async function upsertTreatment(treatment: TreatmentDocument) {
  const collection = await getTreatmentsCollection();
  const normalized = normalizeTreatment(treatment);
  const { _id, ...rest } = normalized;

  const filter =
    _id !== undefined
      ? { _id: _id instanceof ObjectId ? _id : new ObjectId(_id as string) }
      : { created_at: rest.created_at, eventType: rest.eventType };

  const result = await collection.findOneAndUpdate(
    filter,
    { $set: rest },
    { upsert: true, returnDocument: "after" }
  );

  return result ? serializeDocument(result) : serializeDocument({ ...normalized, _id });
}

export async function findTreatments(searchParams: URLSearchParams) {
  const query: QuerySpec = parseQuery(searchParams, queryConfig);
  const collection = await getTreatmentsCollection();

  const cursor = collection
    .find(query.filter)
    .sort(query.sort)
    .limit(query.limit ?? queryConfig.defaultLimit);

  const docs = await cursor.toArray();
  return serializeDocuments(docs);
}

export async function deleteTreatments(searchParams: URLSearchParams) {
  const query: QuerySpec = parseQuery(searchParams, queryConfig);
  const collection = await getTreatmentsCollection();
  const result = await collection.deleteMany(query.filter);
  return { deletedCount: result.deletedCount ?? 0 };
}

export async function saveTreatments(payload: unknown) {
  const treatments = Array.isArray(payload) ? payload : [payload];
  const normalized = treatments.filter(Boolean) as TreatmentDocument[];

  const persisted = [];
  for (const treatment of normalized) {
     
    const doc = await upsertTreatment(treatment);
    persisted.push(doc);
  }

  return serializeDocuments(persisted);
}
