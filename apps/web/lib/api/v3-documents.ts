import crypto from "crypto";

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";

/**
 * V3 Document handling module
 * 
 * Handles:
 * - Auto-generation of identifier field
 * - Deduplication using identifier or fallback rules
 * - srvCreated/srvModified timestamps
 * - isReadOnly validation
 * - Soft deletes with isValid field
 */

export type V3Document = {
  _id?: ObjectId | string;
  identifier?: string;
  date?: number;
  created_at?: string;
  srvCreated?: number;
  srvModified?: number;
  isValid?: boolean;
  isReadOnly?: boolean;
  [key: string]: unknown;
};

export type CollectionConfig = {
  name: string;
  dateField: string;
  fallbackDedupFields?: string[];
};

export const COLLECTION_CONFIGS: Record<string, CollectionConfig> = {
  entries: {
    name: "entries",
    dateField: "date",
    fallbackDedupFields: ["date", "type"]
  },
  treatments: {
    name: "treatments",
    dateField: "created_at",
    fallbackDedupFields: ["created_at", "eventType"]
  },
  devicestatus: {
    name: "devicestatus",
    dateField: "created_at",
    fallbackDedupFields: ["created_at", "device"]
  },
  profile: {
    name: "profile",
    dateField: "created_at",
    fallbackDedupFields: ["created_at"]
  },
  food: {
    name: "food",
    dateField: "created_at",
    fallbackDedupFields: ["created_at"]
  },
  settings: {
    name: "settings",
    dateField: "srvModified",
    fallbackDedupFields: ["identifier"]
  }
};

/**
 * Generate a unique identifier for a document
 */
export function generateIdentifier(doc: V3Document, collectionName: string): string {
  // If document already has an identifier, use it
  if (doc.identifier) {
    return doc.identifier;
  }

  const config = COLLECTION_CONFIGS[collectionName];
  if (!config) {
    // Fallback: generate random identifier
    return crypto.randomUUID();
  }

  // Generate identifier from document content
  const parts: string[] = [collectionName];
  
  // Add date/timestamp
  if (doc.date) {
    parts.push(String(doc.date));
  } else if (doc.created_at) {
    parts.push(doc.created_at);
  }
  
  // Add type-specific fields
  if (collectionName === "entries" && doc.type) {
    parts.push(String(doc.type));
  } else if (collectionName === "treatments" && doc.eventType) {
    parts.push(String(doc.eventType));
  } else if (collectionName === "devicestatus" && doc.device) {
    parts.push(String(doc.device));
  }

  // Create hash of parts
  const hash = crypto
    .createHash("sha256")
    .update(parts.join(":"))
    .digest("hex")
    .substring(0, 32);

  return hash;
}

/**
 * Normalize a document for storage
 * Adds server timestamps and identifier
 */
export function normalizeV3Document(
  doc: V3Document,
  collectionName: string,
  isUpdate = false
): V3Document {
  const now = Date.now();
  const normalized: V3Document = { ...doc };

  // Ensure identifier
  if (!normalized.identifier) {
    normalized.identifier = generateIdentifier(doc, collectionName);
  }

  // Set timestamps
  if (!isUpdate) {
    normalized.srvCreated = now;
  }
  normalized.srvModified = now;

  // Ensure isValid flag
  if (normalized.isValid === undefined) {
    normalized.isValid = true;
  }

  // Handle date normalization
  if (normalized.date && typeof normalized.date === "string") {
    const parsed = Date.parse(normalized.date);
    if (!isNaN(parsed)) {
      normalized.date = parsed;
    }
  }

  // Add created_at fallback if API3_CREATED_AT_FALLBACK_ENABLED
  if (
    process.env.API3_CREATED_AT_FALLBACK_ENABLED !== "false" &&
    normalized.date &&
    !normalized.created_at
  ) {
    normalized.created_at = new Date(normalized.date).toISOString();
  }

  return normalized;
}

/**
 * Build deduplication filter for a document
 */
export function buildDedupFilter(
  doc: V3Document,
  collectionName: string
): Document {
  // Primary: match by identifier
  if (doc.identifier) {
    return { identifier: doc.identifier };
  }

  // Fallback deduplication if enabled
  if (process.env.API3_DEDUP_FALLBACK_ENABLED !== "false") {
    const config = COLLECTION_CONFIGS[collectionName];
    if (config?.fallbackDedupFields) {
      const filter: Document = { identifier: { $exists: false } };
      
      for (const field of config.fallbackDedupFields) {
        if (doc[field] !== undefined) {
          filter[field] = doc[field];
        }
      }
      
      // Only use fallback if we have all required fields
      const hasAllFields = config.fallbackDedupFields.every(
        f => doc[f] !== undefined
      );
      
      if (hasAllFields) {
        return filter;
      }
    }
  }

  // No dedup possible - will create new document
  return { _id: new ObjectId() };
}

/**
 * Create or update a document with deduplication
 */
export async function upsertV3Document<T extends Document>(
  collection: Collection<T>,
  doc: V3Document,
  collectionName: string
): Promise<WithId<T>> {
  const normalized = normalizeV3Document(doc, collectionName, false);
  const dedupFilter = buildDedupFilter(normalized, collectionName);

  // Try to find existing document
  const existing = await collection.findOne(dedupFilter as unknown as Parameters<typeof collection.findOne>[0]);
  
  if (existing) {
    // Update existing document
    const updateDoc = normalizeV3Document(
      { ...normalized, srvCreated: existing.srvCreated as number },
      collectionName,
      true
    );
    delete updateDoc._id;

    const result = await collection.findOneAndUpdate(
      { _id: existing._id } as unknown as Parameters<typeof collection.findOneAndUpdate>[0],
      { $set: updateDoc } as unknown as Parameters<typeof collection.findOneAndUpdate>[1],
      { returnDocument: "after" }
    );

    if (!result) {
      throw new Error("Failed to update document");
    }
    return result as WithId<T>;
  }

  // Create new document
  const insertDoc = { ...normalized };
  if (!insertDoc._id) {
    insertDoc._id = new ObjectId();
  }

  await collection.insertOne(insertDoc as unknown as Parameters<typeof collection.insertOne>[0]);
  return insertDoc as WithId<T>;
}

/**
 * Soft delete a document (set isValid = false)
 */
export async function softDeleteV3Document<T extends Document>(
  collection: Collection<T>,
  identifier: string
): Promise<boolean> {
  const now = Date.now();
  
  const result = await collection.updateOne(
    { identifier, isValid: true } as unknown as Parameters<typeof collection.updateOne>[0],
    { $set: { isValid: false, srvModified: now } } as unknown as Parameters<typeof collection.updateOne>[1]
  );

  return result.modifiedCount > 0;
}

/**
 * Permanently delete a document
 */
export async function hardDeleteV3Document<T extends Document>(
  collection: Collection<T>,
  identifier: string
): Promise<boolean> {
  const result = await collection.deleteOne(
    { identifier } as unknown as Parameters<typeof collection.deleteOne>[0]
  );

  return result.deletedCount > 0;
}

/**
 * Find document by identifier
 */
export async function findByIdentifier<T extends Document>(
  collection: Collection<T>,
  identifier: string
): Promise<WithId<T> | null> {
  return collection.findOne(
    { identifier } as unknown as Parameters<typeof collection.findOne>[0]
  );
}

/**
 * Check if a document is read-only
 */
export function isReadOnly(doc: V3Document): boolean {
  return doc.isReadOnly === true;
}

/**
 * Validate that a document can be modified
 */
export function validateModification(
  existing: V3Document | null,
  operation: "update" | "delete"
): { valid: boolean; error?: string } {
  if (!existing) {
    return { valid: false, error: "Document not found" };
  }

  if (existing.isValid === false) {
    return { valid: false, error: "Document has been deleted" };
  }

  if (operation === "delete" && isReadOnly(existing)) {
    return { valid: false, error: "Document is read-only" };
  }

  return { valid: true };
}

