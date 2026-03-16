import { type Document } from "mongodb";

import { getMongoConfig, type MongoCollections } from "./config";
import { getDb } from "../mongodb";

let cachedCollections: MongoCollections | null = null;

function getCollectionsConfig() {
  if (!cachedCollections) {
    cachedCollections = getMongoConfig().collections;
  }
  return cachedCollections;
}

async function getCollection<T extends Document>(key: keyof MongoCollections) {
  const db = await getDb();
  const collections = getCollectionsConfig();
  const name = collections[key];
  return db.collection<T>(name);
}

export async function getEntriesCollection() {
  return getCollection("entries");
}

export async function getTreatmentsCollection() {
  return getCollection("treatments");
}

export async function getDeviceStatusCollection() {
  return getCollection("devicestatus");
}

export async function getProfileCollection() {
  return getCollection("profile");
}

export async function getFoodCollection() {
  return getCollection("food");
}

export async function getSettingsCollection() {
  return getCollection("settings");
}
