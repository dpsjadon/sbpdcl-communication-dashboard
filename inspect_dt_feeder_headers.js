const fs = require('fs');
const path = require('path');
const readline = require('readline');

const files = [
  'DTR Master Information_310798_batch1.csv',
  'DTR Non Communicating REPORT_310799_batch1.csv',
  'DTR Never Communicating REPORT_310800_batch1.csv',
  'Feeder Master Information_310801_batch1.csv',
  'Feeder Non Communicating Report_310802_batch1.csv',
  'Feeder Never Communicaing Report_310803_batch1.csv'
];

async function inspectFiles() {
  for (const f of files) {
    const fullPath = path.join(__dirname, 'data', f);
    if (!fs.existsSync(fullPath)) {
      console.log(`File not found: ${f}`);
      continue;
    }
    console.log(`\n============================ ${f} ============================`);
    const rl = readline.createInterface({
      input: fs.createReadStream(fullPath),
      crlfDelay: Infinity
    });

    let count = 0;
    for await (const line of rl) {
      console.log(`Line ${count}: ${line.slice(0, 300)}`);
      count++;
      if (count > 3) break;
    }
  }
}

inspectFiles();
