const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({ input: fs.createReadStream('data/Last Communication Information_310196_batch1.csv') });
rl.on('line', (line) => {
  const cols = line.split(',').map((h, i) => `${i}: ${h.replace(/"/g, '').trim()}`);
  console.log(cols);
  rl.close();
  process.exit(0);
});
