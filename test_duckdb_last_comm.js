const duckdb = require('duckdb');
const path = require('path');
const db = new duckdb.Database(':memory:');
const con = db.connect();

const f1 = path.join(__dirname, 'data', 'Last Communication Information_310196_batch1.csv').replace(/\\/g, '/');
const f2 = path.join(__dirname, 'data', 'Last Communication Information_310196_batch2.csv').replace(/\\/g, '/');

console.log('Querying batch files with DuckDB...');
const t0 = Date.now();

con.all(`
  SELECT 
    count(*) as total_rows,
    count(DISTINCT MSN) as distinct_msn,
    min(TRY_CAST("Last communication Duration(Days)" AS BIGINT)) as min_dur,
    max(TRY_CAST("Last communication Duration(Days)" AS BIGINT)) as max_dur,
    count(CASE WHEN TRY_CAST("Last communication Duration(Days)" AS BIGINT) <= 3 THEN 1 END) as comm_lte_3d,
    count(CASE WHEN TRY_CAST("Last communication Duration(Days)" AS BIGINT) BETWEEN 4 AND 7 THEN 1 END) as non_comm_4_7d,
    count(CASE WHEN TRY_CAST("Last communication Duration(Days)" AS BIGINT) > 7 THEN 1 END) as non_comm_gt_7d,
    count(CASE WHEN "Last communication Duration(Days)" IS NULL THEN 1 END) as null_comm
  FROM read_csv_auto(['${f1}', '${f2}'], ignore_errors=true)
`, (err, rows) => {
  console.log(`Execution time: ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  if (err) console.error(err);
  else console.log('Results:', rows);
  db.close();
});
