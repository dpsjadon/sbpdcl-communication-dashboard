const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const dataDir = path.join(__dirname, 'data');
const downloadsDir = path.join(__dirname, 'downloads');

function readFirstLines(filePath, numLines = 5) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).slice(0, numLines);
  return lines;
}

console.log('--- AIRTEL CSV PREVIEW ---');
const airtelFile = fs.readdirSync(dataDir).find(f => f.includes('Airtel') && f.endsWith('.csv'));
if (airtelFile) {
  console.log(`File: ${airtelFile} (${(fs.statSync(path.join(dataDir, airtelFile)).size / (1024*1024)).toFixed(2)} MB)`);
  const lines = readFirstLines(path.join(dataDir, airtelFile), 3);
  lines.forEach((l, i) => console.log(`Line ${i}:`, l));
}

console.log('\n--- CYAN EXCEL PREVIEW ---');
const cyanFile = path.join(downloadsDir, 'HES-Cyan-NonCommunicating_7Day.xlsx');
if (fs.existsSync(cyanFile)) {
  const wb = xlsx.readFile(cyanFile);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 3);
  rows.forEach((r, i) => console.log(`Row ${i}:`, JSON.stringify(r)));
}

console.log('\n--- PREPAID TOTAL CONSUMERS (MASTER) PREVIEW ---');
const prepaidFiles = fs.readdirSync(dataDir).filter(f => f.includes('Prepaid') && f.endsWith('.csv'));
prepaidFiles.forEach(pf => {
  console.log(`File: ${pf} (${(fs.statSync(path.join(dataDir, pf)).size / (1024*1024)).toFixed(2)} MB)`);
  const lines = readFirstLines(path.join(dataDir, pf), 3);
  lines.forEach((l, i) => console.log(`Line ${i}:`, l));
});
