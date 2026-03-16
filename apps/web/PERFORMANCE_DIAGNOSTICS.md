# Performance Diagnostics

## Issues Identified

### 1. `/api/v1/devicestatus` Taking ~30 seconds

**Root Causes:**
- **Auth Resolution**: `resolveAuth()` calls `getDefaultPermissions()` which queries MongoDB for roles. If MongoDB is slow or timing out, this causes delays.
- **MongoDB Query**: The query requests 500 documents with a default 2-day window (`defaultDeltaMs: 2 days`). Without an index on `created_at`, this can be very slow.
- **No Query Optimization**: The query doesn't use indexes efficiently.

**Fixes Applied:**
1. Added performance logging to identify slow operations
2. Optimized auth resolution to skip DB queries when API_SECRET is valid
3. Added query logging in development mode

**Next Steps:**
1. Ensure MongoDB has an index on `devicestatus.created_at`:
   ```javascript
   db.devicestatus.createIndex({ created_at: -1 })
   ```
2. Consider reducing the default limit or adding a date filter to the client request
3. Monitor the performance logs to identify which operation is slow

### 2. `/_next/webpack-hmr` Request

**Status:** This is actually working correctly. The WebSocket connection shows status 101 (Switching Protocols), which means it's successfully connected. The user may be seeing a different request or misunderstanding the network tab.

**Note:** WebSocket connections appear as "pending" in some browser devtools because they're long-lived connections, not HTTP requests.

## Performance Monitoring

The following logs will appear in the console when operations take > 1 second:

- `[auth] Slow getDefaultPermissions: Xms` - Auth role lookup is slow
- `[devicestatus] Slow auth resolution: Xms` - Auth check is slow
- `[devicestatus] Slow query: Xms, total: Xms` - MongoDB query is slow

## Recommended MongoDB Indexes

To improve query performance, ensure these indexes exist:

```javascript
// Devicestatus collection
// IMPORTANT: The index direction should match the sort direction for optimal performance
// Since queries sort by { created_at: -1 }, use a descending index
db.devicestatus.createIndex({ created_at: -1 })
db.devicestatus.createIndex({ device: 1, created_at: -1 })
```

**Why index direction matters:**
- Queries sort by `{ created_at: -1 }` (descending - newest first)
- An ascending index (`1`) can be used but requires reverse scanning
- A descending index (`-1`) allows forward scanning from the end, which is more efficient
- For range queries with `$gte` + descending sort, a descending index is optimal

// Auth collections (if using)
db.auth_roles.createIndex({ name: 1 })
db.auth_subjects.createIndex({ name: 1 })
```

## Testing

To test the performance improvements:

1. Check server console for performance warnings
2. Monitor network tab for request timing
3. Verify MongoDB indexes exist:
   ```bash
   mongosh <your-connection-string>
   db.devicestatus.getIndexes()
   ```

