const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');
const con = db.connect();

con.all(`
  SELECT "Last MeterReading Time Stamp" as ts, count(*) as cnt 
  FROM read_csv_auto('data/HES-Airtel - Non Communicating  greater than 7 Day_309665_batch1.csv')
  GROUP BY ts
  ORDER BY cnt DESC
  LIMIT 10
`, (e, r) => {
  console.log('Airtel timestamps:', r);
});

con.all(`
  SELECT "Last Communication Date" as lcd, count(*) as cnt
  FROM read_csv_auto('data/Prepaid Total Consumers_309619_batch1.csv')
  GROUP BY lcd
  ORDER BY cnt DESC
  LIMIT 10
`, (e, r) => {
  console.log('Master LCD:', r);
});
