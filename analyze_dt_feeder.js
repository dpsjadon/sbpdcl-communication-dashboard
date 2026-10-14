const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');

const db = new duckdb.Database(':memory:');
const con = db.connect();

const dataDir = path.join(__dirname, 'data');

async function testStats() {
  const dtrMaster = path.join(dataDir, 'DTR Master Information_310798_batch1.csv').replace(/\\/g, '/');
  const dtrNonComm = path.join(dataDir, 'DTR Non Communicating REPORT_310799_batch1.csv').replace(/\\/g, '/');
  const dtrNeverComm = path.join(dataDir, 'DTR Never Communicating REPORT_310800_batch1.csv').replace(/\\/g, '/');

  const fdrMaster = path.join(dataDir, 'Feeder Master Information_310801_batch1.csv').replace(/\\/g, '/');
  const fdrNonComm = path.join(dataDir, 'Feeder Non Communicating Report_310802_batch1.csv').replace(/\\/g, '/');
  const fdrNeverComm = path.join(dataDir, 'Feeder Never Communicaing Report_310803_batch1.csv').replace(/\\/g, '/');

  const q = sql => new Promise((res, rej) => con.all(sql, (err, rows) => err ? rej(err) : res(rows)));

  console.log('--- DTR Counts ---');
  const dtrMCount = await q(`SELECT count(*) as c FROM read_csv_auto('${dtrMaster}')`);
  console.log('DTR Master Total:', dtrMCount[0].c);

  const dtrNCCount = await q(`SELECT count(*) as c FROM read_csv_auto('${dtrNonComm}')`);
  console.log('DTR Non-Comm Total:', dtrNCCount[0].c);

  const dtrNeverCount = await q(`SELECT count(*) as c FROM read_csv_auto('${dtrNeverComm}')`);
  console.log('DTR Never-Comm Total:', dtrNeverCount[0].c);

  console.log('\n--- Feeder Counts & Voltage Levels ---');
  const fdrMCount = await q(`SELECT count(*) as c FROM read_csv_auto('${fdrMaster}')`);
  console.log('Feeder Master Total:', fdrMCount[0].c);

  const fdrNCCount = await q(`SELECT count(*) as c FROM read_csv_auto('${fdrNonComm}')`);
  console.log('Feeder Non-Comm Total:', fdrNCCount[0].c);

  const fdrNeverCount = await q(`SELECT count(*) as c FROM read_csv_auto('${fdrNeverComm}')`);
  console.log('Feeder Never-Comm Total:', fdrNeverCount[0].c);

  const voltages = await q(`SELECT "Voltage Level", count(*) as c FROM read_csv_auto('${fdrMaster}') GROUP BY 1`);
  console.log('Feeder Voltage Levels in Master:', voltages);
}

testStats().then(() => db.close());
