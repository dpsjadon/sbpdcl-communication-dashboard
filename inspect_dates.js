const duckdb = require('duckdb');
const path = require('path');

const db = new duckdb.Database(':memory:');
const con = db.connect();

console.log('Querying date distributions with DuckDB...');

con.all(`
  SELECT 
    min(Ageing) as min_age, 
    max(Ageing) as max_age, 
    avg(Ageing) as avg_age,
    count(*) as total_rows
  FROM read_csv_auto('data/HES-Airtel - Non Communicating  greater than 7 Day_309665_batch1.csv')
`, (err, rows) => {
  if (err) console.error('Airtel age err:', err);
  else console.log('Airtel Aging stats:', rows);
});

con.all(`
  SELECT 
    strftime(try_strptime("Last Communication Date", '%d-%m-%Y'), '%Y-%m-%d') as comm_date,
    count(*) as count
  FROM read_csv_auto(['data/Prepaid Total Consumers_309619_batch1.csv', 'data/Prepaid Total Consumers_309619_batch2.csv'])
  WHERE "Last Communication Date" is not null AND "Last Communication Date" != ''
  GROUP BY comm_date
  ORDER BY count DESC
  LIMIT 10
`, (err, rows) => {
  if (err) console.error('Master comm date err:', err);
  else console.log('Top Last Communication Dates in Master:', rows);
});

con.all(`
  SELECT 
    strftime(try_strptime("Last MeterReading Time Stamp", '%m-%d-%Y'), '%Y-%m-%d') as read_date,
    count(*) as count
  FROM read_csv_auto('data/HES-Airtel - Non Communicating  greater than 7 Day_309665_batch1.csv')
  GROUP BY read_date
  ORDER BY read_date DESC
  LIMIT 10
`, (err, rows) => {
  if (err) console.error('Airtel read date err:', err);
  else console.log('Latest Last MeterReading Time Stamps in Non-Comm:', rows);
});
