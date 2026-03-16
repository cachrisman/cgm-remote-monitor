# Devicestatus Query Optimization

## Issues Found

1. **Two queries being made:**
   - `/api/status` → `count: 5` (fast, for status summary)
   - `/api/v1/devicestatus` → `count: 500` (slow, for basal chart)

2. **The 500-document query was slow because:**
   - No explicit date filter, using default 2-day window
   - Scanning potentially thousands of documents
   - Fetching all fields (large documents)

## Optimizations Applied

### 1. Added Date Filter to Client Query
The dashboard now explicitly filters to last 24 hours instead of relying on default 2-day window:
```typescript
const deviceStatusCutoff = Date.now() - (24 * 60 * 60 * 1000);
const deviceStatusParams = new URLSearchParams({
  "find[created_at][$gte]": new Date(deviceStatusCutoff).toISOString(),
  "count": "500"
});
```

### 2. Query Optimization
- Explicit date filter reduces scan range
- Index on `created_at: -1` is now used efficiently
- Reduced default time window from 2 days to 1 day

### 3. Reduced Default Time Window
Changed default from 2 days to 1 day for queries without explicit date filters.

## Additional Recommendations

### Compound Index for Device Filtering
If you frequently filter by device, create a compound index:
```javascript
db.devicestatus.createIndex({ device: 1, created_at: -1 })
```

### Verify Index Usage
Check if queries are using the index:
```javascript
db.devicestatus.find({ 
  created_at: { $gte: new Date(Date.now() - 24*60*60*1000) } 
})
  .sort({ created_at: -1 })
  .limit(500)
  .explain("executionStats")
```

Look for:
- `"stage": "IXSCAN"` (using index)
- `"direction": "backward"` (scanning backward)
- Low `executionTimeMillis`

### Monitor Query Performance
The performance logging will show:
- `[devicestatus] Slow query: Xms` - if query takes > 1 second
- `[devicestatus] Slow auth resolution: Xms` - if auth takes > 1 second

## Expected Improvements

- **Reduced scan range**: 24 hours instead of 2 days (fewer documents to scan)
- **Better index usage**: Explicit date filter helps MongoDB use `created_at: -1` index efficiently
- **Faster query execution**: MongoDB can use index to quickly find and sort documents

## Testing

After these changes, the `/api/v1/devicestatus?count=500` query should:
1. Use the `created_at: -1` index efficiently
2. Scan fewer documents (only last 24 hours)
3. Transfer less data (projection)
4. Complete in < 1 second for typical datasets

