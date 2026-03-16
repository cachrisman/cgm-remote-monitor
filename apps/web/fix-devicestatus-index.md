# Fix Devicestatus Index Direction

## Current Issue

Your current index is:
```javascript
{ created_at: 1 }  // Ascending
```

But your queries sort by:
```javascript
{ created_at: -1 }  // Descending (newest first)
```

## Why This Matters

When MongoDB executes a query with:
- Filter: `{ created_at: { $gte: "2025-01-01T..." } }`
- Sort: `{ created_at: -1 }`
- Limit: `500`

With an **ascending index** (`1`):
- MongoDB scans forward through the index to find matching documents
- Then must sort them in descending order (either in memory or by reverse scanning)
- Less efficient for "get the most recent N documents"

With a **descending index** (`-1`):
- MongoDB can scan backward from the end of the index
- More efficient for "get the most recent N documents" queries
- Better performance for range queries with descending sorts

## Solution

### Option 1: Drop and Recreate (Recommended)

```javascript
// Drop the old ascending index
db.devicestatus.dropIndex("created_at_1")

// Create the new descending index
db.devicestatus.createIndex({ created_at: -1 }, { name: "created_at_-1" })
```

### Option 2: Create Both (Not Recommended)

You could keep both indexes, but this wastes storage and slows writes:
```javascript
db.devicestatus.createIndex({ created_at: -1 })
```

### Option 3: Use Background Index Creation

If you have a large collection, create the index in the background:
```javascript
db.devicestatus.createIndex({ created_at: -1 }, { background: true })
```

## Verify

After creating the index, verify it exists:
```javascript
db.devicestatus.getIndexes()
```

You should see:
```javascript
{ v: 2, key: { created_at: -1 }, name: 'created_at_-1' }
```

## Performance Impact

After updating the index, you should see:
- Faster query execution (especially for "get recent N" queries)
- Reduced memory usage during sorting
- Better query plan in MongoDB explain output

## Testing

To test the improvement, run:
```javascript
// Explain the query to see if it uses the index
db.devicestatus.find({ created_at: { $gte: new Date(Date.now() - 2*24*60*60*1000) } })
  .sort({ created_at: -1 })
  .limit(500)
  .explain("executionStats")
```

Look for:
- `"stage": "IXSCAN"` (using index)
- `"direction": "backward"` (scanning backward, which is efficient)
- Low `executionTimeMillis`

