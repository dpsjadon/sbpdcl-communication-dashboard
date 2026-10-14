const path = require('path');
const duckdb = require('duckdb');

const db = new duckdb.Database(':memory:');
const con = db.connect();
const dataDir = path.join(__dirname, 'data');

async function testJoin() {
  const fdrMaster = path.join(dataDir, 'Feeder Master Information_310801_batch1.csv').replace(/\\/g, '/');
  const fdrNonComm = path.join(dataDir, 'Feeder Non Communicating Report_310802_batch1.csv').replace(/\\/g, '/');
  const fdrNeverComm = path.join(dataDir, 'Feeder Never Communicaing Report_310803_batch1.csv').replace(/\\/g, '/');

  const q = sql => new Promise((res, rej) => con.all(sql, (err, rows) => err ? rej(err) : res(rows)));

  await q(`CREATE TABLE fdr_m AS SELECT * FROM read_csv_auto('${fdrMaster}')`);
  await q(`CREATE TABLE fdr_nc AS SELECT * FROM read_csv_auto('${fdrNonComm}')`);
  await q(`CREATE TABLE fdr_never AS SELECT * FROM read_csv_auto('${fdrNeverComm}')`);

  const ncJoined = await q(`
    SELECT m."Voltage Level", count(*) as c
    FROM fdr_nc nc
    LEFT JOIN fdr_m m ON TRIM(nc."Meter Serial Number") = TRIM(m.MSN)
    GROUP BY 1
  `);
  console.log('Feeder Non-Comm by Voltage Level:', ncJoined);

  const neverJoined = await q(`
    SELECT m."Voltage Level", count(*) as c
    FROM fdr_never nev
    LEFT JOIN fdr_m m ON TRIM(nev."Meter Serial Number") = TRIM(m.MSN)
    GROUP BY 1
  `);
  console.log('Feeder Never-Comm by Voltage Level:', neverJoined);
}

testJoin().then(() => db.close());
