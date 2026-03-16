# Analyzing MongoDB Query Performance

## Current Explain Output Analysis

From your explain output, I can see:

✅ **Good signs:**
- Index is being used: `indexName: 'created_at_-1'`
- Only 1 seek: `seeks: 1` (efficient)
- Direction is 'forward' on descending index (correct for newest-first queries)

⚠️ **Concerning:**
- `keysExamined: 0` - This suggests either:
  - No documents match the query (unlikely with 500 limit)
  - The explain output is incomplete (missing executionStats)
  - The query is so fast it examined 0 keys before hitting the limit

## Get Full Performance Stats

**IMPORTANT:** Your explain output is missing the `executionStats` section. Run this to get complete execution statistics:

```javascript
const result = db.devicestatus.find({ 
  created_at: { $gte: new Date(Date.now() - 24*60*60*1000).toISOString() } 
})
  .sort({ created_at: -1 })
  .limit(500)
  .explain("executionStats");

// Print the key metrics
print("Execution Time (ms):", result.executionStats.executionTimeMillis);
print("Total Docs Examined:", result.executionStats.totalDocsExamined);
print("Docs Returned:", result.executionStats.nReturned);
print("Keys Examined:", result.executionStats.executionStages.inputStage.inputStage.keysExamined);
```

**Note:** Since `created_at` is stored as a **string** (not Date), the query uses string comparison. This works but is less efficient than Date comparison.

Look for these key metrics in the output:

### Key Metrics to Check:

1. **executionTimeMillis** - Total execution time (should be < 100ms)
2. **totalDocsExamined** - How many documents were scanned
3. **nReturned** - How many documents were returned
4. **executionStages.stage** - Should be "IXSCAN" (using index)
5. **executionStages.direction** - Should be "forward" (correct for descending index)

### What to Look For:

**Good performance:**
```javascript
executionTimeMillis: < 100
totalDocsExamined: ~500 (or less)
nReturned: 500 (or actual count)
executionStages: {
  stage: "IXSCAN",
  direction: "forward",
  keysExamined: ~500
}
```

**Poor performance indicators:**
- `executionTimeMillis: > 1000` - Query is slow
- `totalDocsExamined: >> 500` - Scanning too many documents
- `stage: "COLLSCAN"` - Not using index (BAD!)
- `keysExamined: >> 500` - Index not selective enough

## Potential Issues

### 1. Date Type Mismatch
Your query filter shows:
```javascript
created_at: { '$gte': 2025-12-02T10:03:36.498Z }
```

But MongoDB might be comparing strings vs dates. Check if `created_at` is stored as:
- ISO string: `"2025-12-02T10:03:36.498Z"`
- Date object: `ISODate("2025-12-02T10:03:36.498Z")`

If it's stored as strings, the index might not be as effective.

### 2. Auth Resolution Slow
Even if the query is fast, `resolveAuth()` might be slow. Check server logs for:
```
[auth] Slow getDefaultPermissions: Xms
[devicestatus] Slow auth resolution: Xms
```

### 3. Network/Serialization
The query might be fast, but:
- Network transfer of 500 documents could be slow
- Serialization of large documents could be slow
- Response size might be large

## Next Steps

1. **Get full executionStats** (see query above)
2. **Check server logs** for performance warnings
3. **Verify date storage format** in MongoDB:
   ```javascript
   db.devicestatus.findOne({}, { created_at: 1 })
   ```
4. **Check document size**:
   ```javascript
   db.devicestatus.aggregate([
     { $project: { size: { $bsonSize: "$$ROOT" } } },
     { $group: { _id: null, avgSize: { $avg: "$size" }, maxSize: { $max: "$size" } } }
   ])
   ```

## Quick Test

Run this to see actual query time:
```javascript
const start = Date.now();
const results = db.devicestatus.find({ 
  created_at: { $gte: new Date(Date.now() - 24*60*60*1000) } 
})
  .sort({ created_at: -1 })
  .limit(500)
  .toArray();
print(`Query took: ${Date.now() - start}ms`);
print(`Returned: ${results.length} documents`);
```

