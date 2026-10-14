const path = require('path');
const duckdb = require('duckdb');

const db = new duckdb.Database(':memory:');
const con = db.connect();
const dataDir = path.join(__dirname, 'data');

async function checkCols() {
  const dtrMaster = path.join(dataDir, 'DTR Master Information_310798_batch1.csv').replace(/\\/g, '/');
  const fdrMaster = path.join(dataDir, 'Feeder Master Information_310801_batch1.csv').replace(/\\/g, '/');
  const q = sql => new Promise((res, rej) => con.all(sql, (err, rows) => err ? rej(err) : res(rows)));

  console.log('--- DTR Master Columns ---');
  const dtrDesc = await q(`DESCRIBE SELECT * FROM read_csv_auto('${dtrMaster}')`);
  console.log(dtrDesc);

  console.log('--- Feeder Master Columns ---');
  const fdrDesc = await q(`DESCRIBE SELECT * FROM read_csv_auto('${fdrMaster}')`);
  console.log(fdrDesc);
}

checkCols().then(() => db.close());
