
import { MongoClient, type MongoClientOptions } from "mongodb";

import { getMongoConfig } from "./api/config";

declare global {
   
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const options: MongoClientOptions = {
  maxPoolSize: 10,
  minPoolSize: 2, // Keep at least 2 connections ready
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 8000, // 8 seconds - reduced to catch hanging connections earlier
  connectTimeoutMS: 10000, // 10 seconds - connection timeout
  retryWrites: true,
  retryReads: true,
  // Add monitoring to detect connection issues
  monitorCommands: process.env.NODE_ENV === 'development',
  // Force immediate connection check
  directConnection: false, // Use connection string's connection mode
  // Reduce heartbeat to detect dead connections faster
  heartbeatFrequencyMS: 10000
};

let cachedClientPromise: Promise<MongoClient> | undefined;
let cachedDbName: string | undefined;

function getClientPromise() {
  if (cachedClientPromise) {
    return cachedClientPromise;
  }

  if (global._mongoClientPromise) {
    cachedClientPromise = global._mongoClientPromise;
    return cachedClientPromise;
  }

  const config = getMongoConfig();
  cachedDbName = config.dbName;

  const client = new MongoClient(config.uri, options);
  cachedClientPromise = client.connect().catch((error) => {
    console.error("Failed to connect to MongoDB", error);
    throw error;
  });

  if (process.env.NODE_ENV !== "production") {
    global._mongoClientPromise = cachedClientPromise;
  }

  return cachedClientPromise;
}

export async function getDb() {
  const connectStart = Date.now();
  const connectedClient = await (global._mongoClientPromise ?? getClientPromise());
  const connectTime = Date.now() - connectStart;
  
  if (connectTime > 1000 && process.env.NODE_ENV === 'development') {
    console.warn(`[mongodb] Slow client connection: ${connectTime}ms`);
  }
  
  // Test the connection with a ping
  try {
    await connectedClient.db('admin').command({ ping: 1 });
  } catch (error) {
    console.error('[mongodb] Connection ping failed:', error);
    // Don't throw - might be a permissions issue
  }
  
  return cachedDbName ? connectedClient.db(cachedDbName) : connectedClient.db();
}

export { getClientPromise as clientPromise };
