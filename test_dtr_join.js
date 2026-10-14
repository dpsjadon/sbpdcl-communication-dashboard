const path = require('path');
const duckdb = require('duckdb');

const db = new duckdb.Database(':memory:');
const con = db.connect();
const dataDir = path.join(__dirname, 'data');

async function testDtr() {
  const dtrMaster = path.join(dataDir, 'DTR Master Information_310798_batch1.csv').replace(/\\/g, '/');
  const dtrNonComm = path.join(dataDir, 'DTR Non Communicating REPORT_310799_batch1.csv').replace(/\\/g, '/');
  const dtrNeverComm = path.join(dataDir, 'DTR Never Communicating REPORT_310800_batch1.csv').replace(/\\/g, '/');

  const q = sql => new Promise((res, rej) => con.all(sql, (err, rows) => err ? rej(err) : res(rows)));

  await q(`CREATE TABLE dtr_m AS SELECT * FROM read_csv_auto('${dtrMaster}')`);
  await q(`CREATE TABLE dtr_nc AS SELECT * FROM read_csv_auto('${dtrNonComm}')`);
  await q(`CREATE TABLE dtr_never AS SELECT * FROM read_csv_auto('${dtrNeverComm}')`);

  const ncJoin = await q(`
    SELECT count(*) as total, count(m.MSN) as matched
    FROM dtr_nc nc
    LEFT JOIN dtr_m m ON TRIM(nc."Meter Serial Number") = TRIM(m.MSN)
  `);
  console.log('DTR Non-Comm match:', ncJoin);

  const neverJoin = await q(`
    SELECT count(*) as total, count(m.MSN) as matched
    FROM dtr_never nev
    LEFT JOIN dtr_m m ON TRIM(nev."Meter Serial Number") = TRIM(m.MSN)
  `);
  console.log('DTR Never-Comm match:', neverJoin);

  const agingBuckets = await q(`
    SELECT 
      CASE 
        WHEN CAST(Aging AS INT) <= 3 THEN '<= 3 Days'
        WHEN CAST(Aging AS INT) BETWEEN 4 AND 7 THEN '4 - 7 Days'
        WHEN CAST(Aging AS INT) BETWEEN 8 AND 15 THEN '8 - 15 Days'
        WHEN CAST(Aging AS INT) BETWEEN 16 AND 30 THEN '16 - 30 Days'
        WHEN CAST(Aging AS INT) BETWEEN 31 AND 60 THEN '31 - 60 Days'
        WHEN CAST(Aging AS INT) BETWEEN 61 AND 90 THEN '61 - 90 Days'
        WHEN CAST(Aging AS INT) BETWEEN 91 AND 180 THEN '91 - 180 Days'
        ELSE '> 180 Days'
      END as bucket,
      count(*) as count
    FROM dtr_nc
    GROUP BY 1
    ORDER BY count DESC
  `);
  console.log('DTR Aging Buckets:', agingBuckets);
}

testDtr().then(() => db.close());
