const path = require('path');
const duckdb = require('duckdb');

const db = new duckdb.Database(':memory:');
const con = db.connect();
const dataDir = path.join(__dirname, 'data');

async function testFeederAging() {
  const fdrNonComm = path.join(dataDir, 'Feeder Non Communicating Report_310802_batch1.csv').replace(/\\/g, '/');
  const q = sql => new Promise((res, rej) => con.all(sql, (err, rows) => err ? rej(err) : res(rows)));

  await q(`CREATE TABLE fdr_nc AS SELECT * FROM read_csv_auto('${fdrNonComm}')`);
  const buckets = await q(`
    SELECT 
      CASE 
        WHEN TRY_CAST(Aging AS INT) <= 3 THEN '<= 3 Days'
        WHEN TRY_CAST(Aging AS INT) BETWEEN 4 AND 7 THEN '4 - 7 Days'
        WHEN TRY_CAST(Aging AS INT) BETWEEN 8 AND 15 THEN '8 - 15 Days'
        WHEN TRY_CAST(Aging AS INT) BETWEEN 16 AND 30 THEN '16 - 30 Days'
        WHEN TRY_CAST(Aging AS INT) BETWEEN 31 AND 60 THEN '31 - 60 Days'
        WHEN TRY_CAST(Aging AS INT) BETWEEN 61 AND 90 THEN '61 - 90 Days'
        WHEN TRY_CAST(Aging AS INT) BETWEEN 91 AND 180 THEN '91 - 180 Days'
        ELSE '> 180 Days'
      END as bucket,
      count(*) as count
    FROM fdr_nc
    GROUP BY 1
    ORDER BY count DESC
  `);
  console.log('Feeder Aging Buckets:', buckets);
}

testFeederAging().then(() => db.close());
