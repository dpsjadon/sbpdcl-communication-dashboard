const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');
const con = db.connect();

con.all(`SELECT Department, Communication, count(*) as cnt 
         FROM read_csv_auto('data/Last Communication Information*.csv') 
         GROUP BY Department, Communication`, (err, rows) => {
  if (err) console.error(err);
  else console.table(rows);
  process.exit(0);
});
