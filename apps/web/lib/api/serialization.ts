import { ObjectId } from "mongodb";

export function ensureObjectId(value: unknown) {
  if (!value) return undefined;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return undefined;
}

export function serializeDocument<T extends { _id?: unknown }>(doc: T) {
  if (!doc || typeof doc !== "object") return doc;

  const serialized: Record<string, unknown> = { ...doc };

  if ("_id" in serialized && serialized._id instanceof ObjectId) {
    serialized._id = serialized._id.toString();
  }

  return serialized as T;
}

export function serializeDocuments<T extends { _id?: unknown }>(docs: T[]) {
  return docs.map((doc) => serializeDocument(doc));
}
