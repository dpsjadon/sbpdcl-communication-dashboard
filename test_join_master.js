const duckdb = require('duckdb');
const path = require('path');
const db = new duckdb.Database(':memory:');
const con = db.connect();

const masterFiles = [
  path.join(__dirname, 'data', 'Prepaid Total Consumers_309678_batch1.csv').replace(/\\/g, '/'),
  path.join(__dirname, 'data', 'Prepaid Total Consumers_309678_batch2.csv').replace(/\\/g, '/')
];

const lastCommFiles = [
  path.join(__dirname, 'data', 'Last Communication Information_310196_batch1.csv').replace(/\\/g, '/'),
  path.join(__dirname, 'data', 'Last Communication Information_310196_batch2.csv').replace(/\\/g, '/')
];

console.log('Testing join between Master Consumers and Last Communication...');
const t0 = Date.now();

const sql = `
  WITH last_comm AS (
    SELECT 
      UPPER(TRIM(MSN)) as msn,
      Department as department,
      Communication as communication_type,
      "Last Communication Timestamp" as last_comm_timestamp,
      TRY_CAST("Last communication Duration(Days)" AS BIGINT) as duration_days
    FROM read_csv_auto(['${lastCommFiles.join("','")}'], ignore_errors=true)
  ),
  master AS (
    SELECT 
      UPPER(TRIM("MSN")) as msn,
      CAST("Consumer Id" AS VARCHAR) as consumer_id,
      TRIM("Name") as name,
      UPPER(TRIM("Circle")) as circle,
      UPPER(TRIM("Division")) as division,
      UPPER(TRIM("SubDivision")) as subdivision,
      UPPER(TRIM("Section")) as section,
      TRIM("Feeder") as feeder,
      TRIM("DTName") as dt_name,
      TRIM("Category") as category,
      CASE 
        WHEN UPPER(TRIM("Phase")) LIKE '3PH%' OR UPPER(TRIM("Phase")) LIKE '3 PH%' THEN '3 PH'
        ELSE '1 PH'
      END as phase,
      CASE 
        WHEN UPPER(TRIM("MSN")) LIKE 'F%' THEN 'SCHNEIDER'
        WHEN UPPER(TRIM("MSN")) LIKE 'S%' THEN 'GENUS'
        WHEN UPPER(TRIM("MSN")) LIKE 'H%' THEN 'HPL'
        ELSE 'OTHER'
      END as make,
      CAST("Installed Date" AS VARCHAR) as installed_date
    FROM read_csv_auto(['${masterFiles.join("','")}'], ignore_errors=true)
  )
  SELECT 
    count(m.msn) as total_master,
    count(lc.msn) as matched_last_comm,
    count(CASE WHEN lc.duration_days <= 3 THEN 1 END) as comm_lte_3d,
    count(CASE WHEN lc.duration_days BETWEEN 4 AND 7 THEN 1 END) as non_comm_4_7d,
    count(CASE WHEN lc.duration_days > 7 THEN 1 END) as non_comm_gt_7d,
    count(CASE WHEN lc.msn IS NULL OR lc.duration_days IS NULL THEN 1 END) as never_communicated,
    count(CASE WHEN lc.duration_days > 3 OR lc.msn IS NULL OR lc.duration_days IS NULL THEN 1 END) as total_non_comm_gt_3d
  FROM master m
  LEFT JOIN last_comm lc ON m.msn = lc.msn
`;

con.all(sql, (err, rows) => {
  console.log(`Execution time: ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  if (err) console.error(err);
  else console.log('Results:', rows);
  db.close();
});
