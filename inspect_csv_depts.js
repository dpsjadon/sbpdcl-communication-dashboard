const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function checkDepartments() {
  const file1 = path.join(__dirname, 'data', 'Last Communication Information_310196_batch1.csv');
  const file2 = path.join(__dirname, 'data', 'Last Communication Information_310196_batch2.csv');

  const deptCounts = {};
  const commCounts = {};

  for (const file of [file1, file2]) {
    if (!fs.existsSync(file)) continue;
    console.log('Reading', path.basename(file));
    const rl = readline.createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity
    });

    let isHeader = true;
    let deptIdx = -1;
    let commIdx = -1;
    let msnIdx = -1;
    let lastCommIdx = -1;
    let durIdx = -1;

    for await (const line of rl) {
      const cols = line.split(',');
      if (isHeader) {
        cols.forEach((c, i) => {
          const clean = c.replace(/\"/g, '').trim();
          if (clean === 'Department') deptIdx = i;
          if (clean === 'Communication') commIdx = i;
          if (clean === 'MSN') msnIdx = i;
          if (clean.includes('Last Communication Timestamp')) lastCommIdx = i;
          if (clean.includes('Duration')) durIdx = i;
        });
        console.log({ deptIdx, commIdx, msnIdx, lastCommIdx, durIdx });
        isHeader = false;
        continue;
      }
      const dept = cols[deptIdx] ? cols[deptIdx].replace(/\"/g, '').trim() : 'Unknown';
      const comm = cols[commIdx] ? cols[commIdx].replace(/\"/g, '').trim() : 'Unknown';
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
      commCounts[comm] = (commCounts[comm] || 0) + 1;
    }
  }

  console.log('Department counts:', deptCounts);
  console.log('Communication counts:', commCounts);
}

checkDepartments().catch(console.error);
