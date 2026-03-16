#!/usr/bin/env node

/**
 * Standalone test script to diagnose devicestatus query performance
 * 
 * Usage:
 *   node apps/web/test-devicestatus-query.js
 * 
 * Or with custom connection string:
 *   MONGODB_URI="mongodb+srv://..." node apps/web/test-devicestatus-query.js
 */

import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple .env parser (no dependency on dotenv)
function loadEnv() {
  try {
    const envPath = `${__dirname}/../../my.env`;
    const envContent = readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
  } catch {
    // .env might not exist, that's ok - use environment variables directly
  }
}

loadEnv();

// Get MongoDB connection string
function getMongoUri() {
  return process.env.MONGODB_URI || 
         process.env.NIGHTSCOUT_MONGODB_URI || 
         process.env.STORAGE_URI ||
         process.env.MONGO_CONNECTION ||
         process.env.MONGO ||
         process.env.MONGOLAB_URI;
}

// Get database name
function getDbName() {
  return process.env.NIGHTSCOUT_DB_NAME || 
         process.env.MONGODB_DB_NAME;
}

// Get collection name
function getCollectionName() {
  return process.env.MONGO_DEVICESTATUS_COLLECTION ||
         process.env.DEVICESTATUS_COLLECTION ||
         'devicestatus';
}

async function testQuery() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('❌ Error: No MongoDB connection string found.');
    console.error('Set MONGODB_URI or NIGHTSCOUT_MONGODB_URI environment variable.');
    process.exit(1);
  }

  const dbName = getDbName();
  const collectionName = getCollectionName();

  console.log('🔍 MongoDB Query Diagnostic Test\n');
  console.log(`Connection: ${uri.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Database: ${dbName || '(default)'}`);
  console.log(`Collection: ${collectionName}\n`);

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 8000,
    connectTimeoutMS: 10000,
    retryWrites: true,
    retryReads: true
  });

  try {
    // Connect
    console.log('📡 Connecting to MongoDB...');
    const connectStart = Date.now();
    await client.connect();
    const connectTime = Date.now() - connectStart;
    console.log(`✅ Connected in ${connectTime}ms\n`);

    const db = dbName ? client.db(dbName) : client.db();
    const collection = db.collection(collectionName);

    // Test 1: Simple connection test
    console.log('🧪 Test 1: Simple findOne()');
    const test1Start = Date.now();
    const test1Result = await collection.findOne({}, { projection: { _id: 1 } });
    const test1Time = Date.now() - test1Start;
    console.log(`   Result: ${test1Result ? 'SUCCESS' : 'NO RESULTS'}`);
    console.log(`   Time: ${test1Time}ms\n`);

    // Test 2: Count documents
    console.log('🧪 Test 2: Count documents');
    const test2Start = Date.now();
    const count = await collection.countDocuments({});
    const test2Time = Date.now() - test2Start;
    console.log(`   Total documents: ${count}`);
    console.log(`   Time: ${test2Time}ms\n`);

    // Test 3: Count with date filter (last 24 hours)
    const dateFilter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    console.log(`🧪 Test 3: Count with date filter (>= ${dateFilter})`);
    const test3Start = Date.now();
    const count24h = await collection.countDocuments({
      created_at: { $gte: dateFilter }
    });
    const test3Time = Date.now() - test3Start;
    console.log(`   Documents in last 24h: ${count24h}`);
    console.log(`   Time: ${test3Time}ms\n`);

    // Test 4: Simple find with limit 5
    console.log('🧪 Test 4: find() with limit 5 (no filter)');
    const test4Start = Date.now();
    const test4Results = await collection
      .find({})
      .sort({ created_at: -1 })
      .limit(5)
      .maxTimeMS(5000)
      .toArray();
    const test4Time = Date.now() - test4Start;
    console.log(`   Results: ${test4Results.length}`);
    console.log(`   Time: ${test4Time}ms\n`);

    // Test 5: find() with date filter and limit 5
    console.log(`🧪 Test 5: find() with date filter and limit 5`);
    const test5Start = Date.now();
    const test5Results = await collection
      .find({ created_at: { $gte: dateFilter } })
      .sort({ created_at: -1 })
      .limit(5)
      .maxTimeMS(5000)
      .toArray();
    const test5Time = Date.now() - test5Start;
    console.log(`   Results: ${test5Results.length}`);
    console.log(`   Time: ${test5Time}ms\n`);

    // Test 6: find() with date filter and limit 500 (THE PROBLEMATIC QUERY)
    // This matches the OLD implementation (no projection) - kept for comparison
    console.log(`🧪 Test 6: find() with date filter and limit 500 (NO PROJECTION - OLD)`);
    const test6Start = Date.now();
    let test6Results;
    let test6Time;
    try {
      test6Results = await Promise.race([
        collection
          .find({ created_at: { $gte: dateFilter } })
          .sort({ created_at: -1 })
          .limit(500)
          .maxTimeMS(3000)
          .toArray(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout after 10 seconds')), 10000)
        )
      ]);
      test6Time = Date.now() - test6Start;
      console.log(`   ✅ Results: ${test6Results.length}`);
      console.log(`   Time: ${test6Time}ms\n`);
    } catch (error) {
      test6Time = Date.now() - test6Start;
      console.log(`   ❌ ERROR after ${test6Time}ms: ${error.message}\n`);
    }

    // Test 7: Find breaking point - try different limits (WITH PROJECTION)
    console.log(`🧪 Test 7: Find breaking point with projection (different limits)`);
    const projection = {
      _id: 1,
      created_at: 1,
      mills: 1,
      device: 1,
      uploader: 1,
      pump: 1,
      openaps: 1,
      loop: 1,
      status: 1,
      iob: 1,
      cob: 1,
      basal: 1
    };
    const limits = [10, 50, 100, 200, 300, 400, 500];
    for (const limit of limits) {
      const testStart = Date.now();
      try {
        const results = await Promise.race([
          collection
            .find({ created_at: { $gte: dateFilter } })
            .sort({ created_at: -1 })
            .limit(limit)
            .project(projection)
            .maxTimeMS(3000)
            .toArray(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 10000)
          )
        ]);
        const testTime = Date.now() - testStart;
        console.log(`   Limit ${limit}: ✅ ${results.length} docs in ${testTime}ms`);
      } catch {
        const testTime = Date.now() - testStart;
        console.log(`   Limit ${limit}: ❌ TIMEOUT after ${testTime}ms`);
        break; // Stop testing larger limits if this one failed
      }
    }
    console.log('');

    // Test 8: Check document size
    console.log(`🧪 Test 8: Check document size`);
    const sampleDoc = await collection.findOne({ created_at: { $gte: dateFilter } });
    if (sampleDoc) {
      const docSize = JSON.stringify(sampleDoc).length;
      const docSizeKB = (docSize / 1024).toFixed(2);
      console.log(`   Sample document size: ${docSize} bytes (${docSizeKB} KB)`);
      console.log(`   Estimated 292 docs: ${(docSize * 292 / 1024).toFixed(2)} KB`);
      console.log(`   Estimated 500 docs: ${(docSize * 500 / 1024).toFixed(2)} KB`);
    }
    console.log('');

    // Test 9: find() with projection (PRODUCTION IMPLEMENTATION)
    // This matches the current implementation in devicestatus.ts
    console.log(`🧪 Test 9: find() with projection (PRODUCTION - matches devicestatus.ts)`);
    const test9Start = Date.now();
    let test9Results;
    let test9Time;
    try {
      const projection = {
        _id: 1,
        created_at: 1,
        mills: 1,
        device: 1,
        uploader: 1,
        pump: 1,
        openaps: 1,
        loop: 1,
        status: 1,
        iob: 1,
        cob: 1,
        basal: 1
      };
      
      test9Results = await Promise.race([
        collection
          .find({ created_at: { $gte: dateFilter } })
          .sort({ created_at: -1 })
          .limit(500)
          .project(projection)
          .maxTimeMS(3000) // 3 second MongoDB timeout
          .toArray(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000)
        )
      ]);
      test9Time = Date.now() - test9Start;
      console.log(`   ✅ Results: ${test9Results.length} (with production projection)`);
      console.log(`   Time: ${test9Time}ms\n`);
    } catch (error) {
      test9Time = Date.now() - test9Start;
      console.log(`   ❌ ERROR after ${test9Time}ms: ${error.message}\n`);
    }

    // Test 10: Try cursor iteration instead of toArray()
    console.log(`🧪 Test 10: Cursor iteration (streaming) limit 500`);
    const test10Start = Date.now();
    let test10Count = 0;
    let test10Time;
    try {
      const cursor = collection
        .find({ created_at: { $gte: dateFilter } })
        .sort({ created_at: -1 })
        .limit(500)
        .maxTimeMS(5000);
      
      await Promise.race([
        (async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _doc of cursor) {
            test10Count++;
          }
        })(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout after 6 seconds')), 6000)
        )
      ]);
      test10Time = Date.now() - test10Start;
      console.log(`   ✅ Results: ${test10Count} (via cursor)`);
      console.log(`   Time: ${test10Time}ms\n`);
    } catch (error) {
      test10Time = Date.now() - test10Start;
      console.log(`   ❌ ERROR after ${test10Time}ms: ${error.message}\n`);
    }

    // Test 11: Aggregation pipeline with projection (for comparison)
    console.log(`🧪 Test 11: Aggregation pipeline with projection limit 500`);
    const test11Start = Date.now();
    let test11Results;
    let test11Time;
    try {
      const projection = {
        _id: 1,
        created_at: 1,
        mills: 1,
        device: 1,
        uploader: 1,
        pump: 1,
        openaps: 1,
        loop: 1,
        status: 1,
        iob: 1,
        cob: 1,
        basal: 1
      };
      test11Results = await Promise.race([
        collection.aggregate([
          { $match: { created_at: { $gte: dateFilter } } },
          { $sort: { created_at: -1 } },
          { $limit: 500 },
          { $project: projection }
        ], {
          maxTimeMS: 3000,
          allowDiskUse: false
        }).toArray(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000)
        )
      ]);
      test11Time = Date.now() - test11Start;
      console.log(`   ✅ Results: ${test11Results.length}`);
      console.log(`   Time: ${test11Time}ms\n`);
    } catch (error) {
      test11Time = Date.now() - test11Start;
      console.log(`   ❌ ERROR after ${test11Time}ms: ${error.message}\n`);
    }

    // Test 12: Check indexes
    console.log('🧪 Test 12: Check indexes');
    const indexes = await collection.indexes();
    console.log(`   Indexes found: ${indexes.length}`);
    indexes.forEach(idx => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    console.log('');

    // Test 13: Explain the query
    console.log(`🧪 Test 13: Explain query (executionStats)`);
    try {
      const explain = await collection
        .find({ created_at: { $gte: dateFilter } })
        .sort({ created_at: -1 })
        .limit(500)
        .explain('executionStats');
      
      const stats = explain.executionStats;
      console.log(`   Execution time: ${stats.executionTimeMillis}ms`);
      console.log(`   Docs examined: ${stats.totalDocsExamined}`);
      console.log(`   Docs returned: ${stats.nReturned}`);
      console.log(`   Keys examined: ${stats.totalKeysExamined}`);
      console.log(`   Stage: ${stats.executionStages.stage}`);
      if (stats.executionStages.inputStage) {
        console.log(`   Index used: ${stats.executionStages.inputStage.indexName || 'NONE'}`);
      }
      console.log('');
    } catch (error) {
      console.log(`   ❌ Explain failed: ${error.message}\n`);
    }

    // Summary
    console.log('📊 Summary:');
    console.log(`   Connection: ${connectTime}ms`);
    console.log(`   Simple findOne: ${test1Time}ms`);
    console.log(`   Count all: ${test2Time}ms`);
    console.log(`   Count filtered: ${test3Time}ms`);
    console.log(`   Find limit 5 (no filter): ${test4Time}ms`);
    console.log(`   Find limit 5 (with filter): ${test5Time}ms`);
    if (test6Time) {
      console.log(`   Find limit 500 (NO PROJECTION - old): ${test6Time}ms ${test6Results ? '✅' : '❌'}`);
    }
    if (test9Time) {
      console.log(`   Find limit 500 (WITH PROJECTION - production): ${test9Time}ms ${test9Results ? '✅' : '❌'}`);
    }
    if (test10Time) {
      console.log(`   Cursor iteration limit 500: ${test10Time}ms ${test10Count > 0 ? '✅' : '❌'}`);
    }
    if (test11Time) {
      console.log(`   Aggregation with projection limit 500: ${test11Time}ms ${test11Results ? '✅' : '❌'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ Connection closed');
  }
}

// Run the test
testQuery().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

