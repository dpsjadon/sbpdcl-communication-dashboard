const duckdb = require('duckdb');
const db = new duckdb.Database('data/sbpdcl_analytics.duckdb', { access_mode: 'READ_ONLY' });
const con = db.connect();

con.all(`
  SELECT 
    count(*) as total,
    count(*) FILTER (WHERE duration_days IS NULL) as null_dur,
    count(*) FILTER (WHERE last_comm_timestamp IS NULL OR TRIM(CAST(last_comm_timestamp AS VARCHAR)) = '') as null_ts,
    count(*) FILTER (WHERE comm_category = 'Never Communicated') as never_cat
  FROM smart_meter_analytics
`, (err, rows) => {
  if (err) {
    console.error('Query error:', err);
  } else {
    console.log('Result:', rows);
  }
  con.close();
  db.close();
});
