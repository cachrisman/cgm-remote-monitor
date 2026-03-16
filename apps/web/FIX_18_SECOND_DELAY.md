# Fix: 18-Second Query Delay

## Problem

- MongoDB query takes **1ms** when run directly in MongoDB
- Same query takes **~18 seconds** when run from Next.js app
- This suggests a **connection/network issue**, not a query performance issue

## Root Cause Analysis

From the logs:
```
[devicestatus] Slow query: 17975ms
[devicestatus] Slow total: 18246ms (auth: 259ms, query: 17975ms, serialize: 12ms)
```

The query itself is taking 18 seconds, which suggests:
1. **Connection pooling issues** - connection might be created on each request
2. **Network latency** - MongoDB Atlas cluster might be slow to respond
3. **Socket timeouts** - connections might be hanging and retrying
4. **Connection establishment** - getting a connection from the pool might be slow

## Fixes Applied

### 1. Added Connection Timeouts
```typescript
const options: MongoClientOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 30000, // 30 seconds - prevent hanging connections
  connectTimeoutMS: 10000, // 10 seconds - connection timeout
  retryWrites: true,
  retryReads: true
};
```

### 2. Added Detailed Query Timing
Now logs:
- Collection access time
- `toArray()` execution time
- Total query time

This will show if the delay is:
- Getting the collection (connection pool issue)
- Executing the query (network/MongoDB issue)
- Fetching results (data transfer issue)

### 3. Fixed `defaultPermissions` Error
Added try-catch around `getDefaultPermissions()` to prevent undefined errors.

## Next Steps

1. **Check the new logs** - Look for:
   ```
   [devicestatus] Slow collection access: Xms
   [devicestatus] Slow toArray: Xms
   ```

2. **If collection access is slow** - Connection pool issue:
   - Check if connections are being reused
   - Verify `global._mongoClientPromise` is working
   - Consider increasing `maxPoolSize`

3. **If toArray is slow** - Network/MongoDB issue:
   - Check MongoDB Atlas connection string
   - Verify network connectivity
   - Check MongoDB Atlas metrics for slow queries
   - Consider using a MongoDB connection string with read preferences

4. **Test connection reuse**:
   ```typescript
   // Add this to see if connection is reused
   console.log('Connection reused:', !!global._mongoClientPromise);
   ```

## Potential Solutions

### Option 1: Connection Pooling
Ensure connections are being reused:
- Check `global._mongoClientPromise` is set correctly
- Verify connection is not being closed between requests

### Option 2: MongoDB Atlas Optimization
- Use connection string with `retryWrites=true&retryReads=true`
- Check MongoDB Atlas cluster performance
- Verify network latency to cluster

### Option 3: Query Optimization
- Add `maxTimeMS` to queries to prevent hanging
- Use read preferences for better performance
- Consider using aggregation pipeline for complex queries

## Testing

After these changes, check logs for:
```
[devicestatus] Slow collection access: Xms  // Should be < 100ms
[devicestatus] Slow toArray: Xms            // Should be < 1000ms
```

If collection access is slow, it's a connection pool issue.
If toArray is slow, it's a network/MongoDB issue.

