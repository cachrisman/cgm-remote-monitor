export type MongoCollections = {
  entries: string;
  treatments: string;
  devicestatus: string;
  profile: string;
  food: string;
  settings: string;
};

type MongoConfig = {
  uri: string;
  dbName?: string;
  collections: MongoCollections;
};

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

export function getMongoConfig(): MongoConfig {
  const uri =
    readEnv(
      "NIGHTSCOUT_MONGODB_URI",
      "MONGODB_URI",
      "STORAGE_URI",
      "MONGO_CONNECTION",
      "MONGO",
      "MONGOLAB_URI"
    ) ?? "";

  if (!uri) {
    throw new Error(
      "Missing MongoDB connection string. Set MONGODB_URI or NIGHTSCOUT_MONGODB_URI."
    );
  }

  const dbName = readEnv("NIGHTSCOUT_DB_NAME", "MONGODB_DB_NAME");

  const collections: MongoCollections = {
    entries: readEnv("ENTRIES_COLLECTION", "MONGO_COLLECTION") ?? "entries",
    treatments:
      readEnv("MONGO_TREATMENTS_COLLECTION", "TREATMENTS_COLLECTION") ??
      "treatments",
    devicestatus:
      readEnv("MONGO_DEVICESTATUS_COLLECTION", "DEVICESTATUS_COLLECTION") ??
      "devicestatus",
    profile:
      readEnv("MONGO_PROFILE_COLLECTION", "PROFILE_COLLECTION") ?? "profile",
    food: readEnv("MONGO_FOOD_COLLECTION", "FOOD_COLLECTION") ?? "food",
    settings:
      readEnv("MONGO_SETTINGS_COLLECTION", "SETTINGS_COLLECTION") ?? "settings"
  };

  return { uri, dbName, collections };
}
