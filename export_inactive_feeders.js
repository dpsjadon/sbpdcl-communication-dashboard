const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const src = 'C:/Users/Dharmendra Pal Singh/OneDrive - INTELLI SMART/Desktop/MY Dashboard/Unified Master Dashboard/references/Inactive Feeder.xlsx';
const dest = path.join(__dirname, 'data', 'inactive_feeders.csv');

if (!fs.existsSync(src)) {
  console.error('Source file does not exist:', src);
  process.exit(1);
}

const wb = XLSX.readFile(src);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

const lines = ['msn,feeder_code'];
for (const r of rows) {
  const m = String(r.MSN || '').trim().toUpperCase();
  const f = String(r['Feeder Code'] || '').trim().toUpperCase();
  if (m) lines.push(`${m},${f}`);
}

fs.writeFileSync(dest, lines.join('\n'));
console.log('Successfully written', lines.length - 1, 'inactive feeders to:', dest);
