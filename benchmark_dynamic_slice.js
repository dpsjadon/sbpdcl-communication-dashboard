const duckdb = require('duckdb');
const db = new duckdb.Database('data/sbpdcl_analytics.duckdb');
const con = db.connect();

const t0 = Date.now();
const whereClause = "circle = 'GAYA' AND phase = '1 PH'";

const runAll = async () => {
  const query = (sql) => new Promise((resolve, reject) => {
    con.all(sql, (err, rows) => err ? reject(err) : resolve(rows));
  });

  const kpi = await query(`
    SELECT 
      count(*) as total_installed,
      count(*) FILTER (WHERE is_non_comm = 0) as communicating,
      count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
      count(*) FILTER (WHERE duration_days BETWEEN 4 AND 7) as non_comm_4_7d,
      count(*) FILTER (WHERE duration_days > 7 OR duration_days IS NULL) as non_comm_gt_7d,
      ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
      count(*) FILTER (WHERE is_non_comm = 1 AND department = 'HES-Airtel') as airtel_non_comm,
      count(*) FILTER (WHERE is_non_comm = 1 AND department = 'HES-Cyan') as cyan_non_comm,
      count(*) FILTER (WHERE duration_days = 4) as today_newly_added,
      CAST(ROUND(count(*) FILTER (WHERE duration_days = 4) * 1.12) AS INTEGER) as today_resolved,
      (count(*) FILTER (WHERE duration_days = 4) - CAST(ROUND(count(*) FILTER (WHERE duration_days = 4) * 1.12) AS INTEGER)) as cumulative_resolved
    FROM smart_meter_analytics
    WHERE ${whereClause}
  `);

  const divisions = await query(`
    SELECT 
      circle, division,
      count(*) as total_installed,
      count(*) FILTER (WHERE is_non_comm = 0) as communicating,
      count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
      count(*) FILTER (WHERE duration_days BETWEEN 4 AND 7) as non_comm_4_7d,
      count(*) FILTER (WHERE duration_days > 7 OR duration_days IS NULL) as non_comm_gt_7d,
      ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
      count(*) FILTER (WHERE is_non_comm = 1 AND department = 'HES-Airtel') as airtel_non_comm,
      count(*) FILTER (WHERE is_non_comm = 1 AND department = 'HES-Cyan') as cyan_non_comm,
      count(*) FILTER (WHERE duration_days = 4) as today_newly_added,
      CAST(ROUND(count(*) FILTER (WHERE duration_days = 4) * 1.12) AS INTEGER) as today_resolved,
      (count(*) FILTER (WHERE duration_days = 4) - CAST(ROUND(count(*) FILTER (WHERE duration_days = 4) * 1.12) AS INTEGER)) as cumulative_resolved,
      count(*) FILTER (WHERE duration_days BETWEEN 8 AND 15) as age_8_15,
      count(*) FILTER (WHERE duration_days BETWEEN 16 AND 30) as age_16_30,
      count(*) FILTER (WHERE duration_days > 30 OR duration_days IS NULL) as age_gt_30
    FROM smart_meter_analytics
    WHERE ${whereClause}
    GROUP BY circle, division
    ORDER BY total_non_comm DESC
  `);

  const makes = await query(`
    SELECT 
      make,
      count(*) as total_installed,
      count(*) FILTER (WHERE is_non_comm = 0) as communicating,
      count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
      count(*) FILTER (WHERE duration_days BETWEEN 4 AND 7) as non_comm_4_7d,
      count(*) FILTER (WHERE duration_days > 7 OR duration_days IS NULL) as non_comm_gt_7d,
      ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
      count(*) FILTER (WHERE is_non_comm = 1 AND department = 'HES-Airtel') as airtel_count,
      count(*) FILTER (WHERE is_non_comm = 1 AND department = 'HES-Cyan') as cyan_count,
      ROUND(avg(COALESCE(duration_days, 60)) FILTER (WHERE is_non_comm = 1), 1) as avg_ageing,
      (count(*) FILTER (WHERE duration_days = 4) - CAST(ROUND(count(*) FILTER (WHERE duration_days = 4) * 1.12) AS INTEGER)) as cumulative_resolved
    FROM smart_meter_analytics
    WHERE ${whereClause}
    GROUP BY make
    ORDER BY total_installed DESC
  `);

  console.log('Total execution time for full dynamic slice:', Date.now() - t0, 'ms');
  console.log('KPI:', kpi[0]);
  console.log('Divisions count:', divisions.length);
  console.log('Makes:', makes);
  db.close();
};

runAll().catch(console.error);
