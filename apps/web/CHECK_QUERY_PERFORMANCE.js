// Run this in MongoDB to get full performance stats
// mongosh <connection-string> < database-name

// 1. Check how created_at is stored
print("=== Checking created_at storage format ===");
const sample = db.devicestatus.findOne({}, { created_at: 1 });
print("Sample created_at value:", sample?.created_at);
print("Type:", typeof sample?.created_at);
print("Is Date object:", sample?.created_at instanceof Date);
print("");

// 2. Get full execution stats
print("=== Full Execution Stats ===");
const explainResult = db.devicestatus.find({ 
  created_at: { $gte: new Date(Date.now() - 24*60*60*1000).toISOString() } 
})
  .sort({ created_at: -1 })
  .limit(500)
  .explain("executionStats");

print("Execution Time (ms):", explainResult.executionStats.executionTimeMillis);
print("Total Docs Examined:", explainResult.executionStats.totalDocsExamined);
print("Docs Returned:", explainResult.executionStats.nReturned);
print("");

// 3. Check index usage
const winningPlan = explainResult.queryPlanner.winningPlan;
print("=== Index Usage ===");
print("Stage:", winningPlan.stage);
if (winningPlan.inputStage) {
  print("Input Stage:", winningPlan.inputStage.stage);
  print("Index Name:", winningPlan.inputStage.indexName);
  print("Direction:", winningPlan.inputStage.direction);
  print("Keys Examined:", winningPlan.inputStage.keysExamined);
}
print("");

// 4. Test actual query time
print("=== Actual Query Time Test ===");
const start = Date.now();
const results = db.devicestatus.find({ 
  created_at: { $gte: new Date(Date.now() - 24*60*60*1000).toISOString() } 
})
  .sort({ created_at: -1 })
  .limit(500)
  .toArray();
const queryTime = Date.now() - start;
print(`Query took: ${queryTime}ms`);
print(`Returned: ${results.length} documents`);
print("");

// 5. Check document sizes
print("=== Document Size Analysis ===");
const sizeStats = db.devicestatus.aggregate([
  { $project: { size: { $bsonSize: "$$ROOT" } } },
  { $group: { 
    _id: null, 
    avgSize: { $avg: "$size" }, 
    maxSize: { $max: "$size" },
    minSize: { $min: "$size" }
  } }
]).toArray();
if (sizeStats[0]) {
  print("Average document size:", Math.round(sizeStats[0].avgSize), "bytes");
  print("Max document size:", sizeStats[0].maxSize, "bytes");
  print("Min document size:", sizeStats[0].minSize, "bytes");
  print("Estimated 500 docs size:", Math.round(sizeStats[0].avgSize * 500), "bytes");
}

