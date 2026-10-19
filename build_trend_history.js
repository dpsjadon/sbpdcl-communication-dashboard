const duckdb = require('duckdb');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');

const snapshots = [
  { date: '2026-10-14', db: 'sbpdcl_analytics_v1791984924965.duckdb' },
  { date: '2026-10-15', db: 'sbpdcl_analytics_v1792071462047.duckdb' },
  { date: '2026-10-16', db: 'sbpdcl_analytics_v1792154647300.duckdb' },
  { date: '2026-10-17', db: 'sbpdcl_analytics_v1792243618932.duckdb' }
];

const memDb = new duckdb.Database(':memory:');

function query(sql) {
  return new Promise((resolve, reject) => {
    memDb.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function run() {
  console.log('Calculating historical multi-day churn...');
  const trendHistory = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];

    const prevPath = path.join(dataDir, prev.db).replace(/\\/g, '/');
    const currPath = path.join(dataDir, curr.db).replace(/\\/g, '/');

    await query(`ATTACH '${prevPath}' AS prev_db (READ_ONLY);`);
    await query(`ATTACH '${currPath}' AS curr_db (READ_ONLY);`);

    // Consumer Churn
    const consRow = await query(`
      WITH p_silent AS (
        SELECT msn, circle, division, aging_bucket 
        FROM prev_db.smart_meter_analytics 
        WHERE comm_category != 'Communicating'
      ),
      c_silent AS (
        SELECT msn, circle, division, aging_bucket 
        FROM curr_db.smart_meter_analytics 
        WHERE comm_category != 'Communicating'
      )
      SELECT 
        '${curr.date}' as date,
        '${prev.date}' as compare_date,
        'consumer' as category,
        (SELECT count(*) FROM p_silent) as yesterday_silent,
        (SELECT count(*) FROM c_silent) as today_silent,
        -- Total Cleared
        (SELECT count(*) FROM p_silent p WHERE NOT EXISTS (SELECT 1 FROM c_silent c WHERE c.msn = p.msn)) as cleared_total,
        -- Cleared Aging Breakdown
        (SELECT count(*) FROM p_silent p WHERE aging_bucket = '4 - 7 Days' AND NOT EXISTS (SELECT 1 FROM c_silent c WHERE c.msn = p.msn)) as cleared_4_7d,
        (SELECT count(*) FROM p_silent p WHERE aging_bucket = '8 - 15 Days' AND NOT EXISTS (SELECT 1 FROM c_silent c WHERE c.msn = p.msn)) as cleared_8_15d,
        (SELECT count(*) FROM p_silent p WHERE aging_bucket = '16 - 30 Days' AND NOT EXISTS (SELECT 1 FROM c_silent c WHERE c.msn = p.msn)) as cleared_16_30d,
        (SELECT count(*) FROM p_silent p WHERE aging_bucket IN ('31 - 60 Days', '61 - 90 Days', '91 - 180 Days', '> 180 Days') AND NOT EXISTS (SELECT 1 FROM c_silent c WHERE c.msn = p.msn)) as cleared_gt30d,
        (SELECT count(*) FROM p_silent p WHERE aging_bucket = 'Never Communicated' AND NOT EXISTS (SELECT 1 FROM c_silent c WHERE c.msn = p.msn)) as cleared_never_comm,
        -- New Additions
        (SELECT count(*) FROM c_silent c WHERE NOT EXISTS (SELECT 1 FROM p_silent p WHERE p.msn = c.msn)) as new_additions_total,
        -- Still Silent
        (SELECT count(*) FROM p_silent p WHERE EXISTS (SELECT 1 FROM c_silent c WHERE c.msn = p.msn)) as still_silent
    `);

    trendHistory.push({
      ...consRow[0],
      net_change: Number(consRow[0].new_additions_total) - Number(consRow[0].cleared_total),
      recovery_rate_pct: ((Number(consRow[0].cleared_total) / Number(consRow[0].yesterday_silent)) * 100).toFixed(2)
    });

    await query(`DETACH prev_db;`);
    await query(`DETACH curr_db;`);
  }

  console.log('Daily Trend History:');
  console.table(trendHistory);
}

run().catch(console.error);
