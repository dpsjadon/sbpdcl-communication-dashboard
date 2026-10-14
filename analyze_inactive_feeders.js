const XLSX = require('xlsx');
const duckdb = require('duckdb');
const path = require('path');

const filePath = 'C:/Users/Dharmendra Pal Singh/OneDrive - INTELLI SMART/Desktop/MY Dashboard/Unified Master Dashboard/references/Inactive Feeder.xlsx';
const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('Total rows in Inactive Feeder.xlsx:', data.length);
const msns = data.map(r => String(r.MSN || '').trim().toUpperCase()).filter(Boolean);
const fCodes = data.map(r => String(r['Feeder Code'] || '').trim().toUpperCase()).filter(Boolean);

const db = new duckdb.Database('data/sbpdcl_analytics.duckdb', duckdb.OPEN_READONLY, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const con = db.connect();

  const msnList = msns.map(m => `'${m}'`).join(',');
  const fcList = fCodes.map(f => `'${f}'`).join(',');

  // 1. Overall comparison: ALL vs Inactive vs Active
  con.all(`
    SELECT
      count(*) as total_all,
      count(*) FILTER (WHERE is_non_comm = 0) as comm_all,
      count(*) FILTER (WHERE is_non_comm = 1) as non_comm_all,
      count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as nc_4_7d_all,
      count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as nc_gt_7d_all,
      count(*) FILTER (WHERE is_never_comm = 1) as never_all,
      ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / count(*), 2) as comm_pct_all,
      ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / count(*), 2) as non_comm_pct_all
    FROM feeder_meter_analytics
  `, (e, rAll) => {
    console.log('\n--- 1. OVERALL FEEDER METERS (Before Exclusion) ---');
    console.table(rAll);

    // 2. Inactive feeders matching in DB
    con.all(`
      SELECT
        count(*) as total_inactive,
        count(*) FILTER (WHERE is_non_comm = 0) as comm_inactive,
        count(*) FILTER (WHERE is_non_comm = 1) as non_comm_inactive,
        count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as nc_4_7d_inactive,
        count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as nc_gt_7d_inactive,
        count(*) FILTER (WHERE is_never_comm = 1) as never_inactive,
        ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / count(*), 2) as comm_pct_inactive,
        ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / count(*), 2) as non_comm_pct_inactive
      FROM feeder_meter_analytics
      WHERE msn IN (${msnList}) OR feeder_code IN (${fcList})
    `, (e, rInactive) => {
      console.log('\n--- 2. INACTIVE FEEDERS MATCHED IN DB ---');
      console.table(rInactive);

      // 3. Active feeders (EXCLUDING Inactive)
      con.all(`
        SELECT
          count(*) as total_active,
          count(*) FILTER (WHERE is_non_comm = 0) as comm_active,
          count(*) FILTER (WHERE is_non_comm = 1) as non_comm_active,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as nc_4_7d_active,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as nc_gt_7d_active,
          count(*) FILTER (WHERE is_never_comm = 1) as never_active,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / count(*), 2) as comm_pct_active,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / count(*), 2) as non_comm_pct_active
        FROM feeder_meter_analytics
        WHERE msn NOT IN (${msnList}) AND feeder_code NOT IN (${fcList})
      `, (e, rActive) => {
        console.log('\n--- 3. ACTIVE FEEDERS (After Excluding Inactive) ---');
        console.table(rActive);

        // 4. Breakdown by Voltage Level (11 KV vs 33 KV) After Excluding
        con.all(`
          SELECT
            voltage_level,
            count(*) as total_active,
            count(*) FILTER (WHERE is_non_comm = 0) as comm_active,
            count(*) FILTER (WHERE is_non_comm = 1) as non_comm_active,
            count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as nc_4_7d_active,
            count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as nc_gt_7d_active,
            count(*) FILTER (WHERE is_never_comm = 1) as never_active,
            ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / count(*), 2) as comm_pct_active,
            ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / count(*), 2) as non_comm_pct_active
          FROM feeder_meter_analytics
          WHERE msn NOT IN (${msnList}) AND feeder_code NOT IN (${fcList})
          GROUP BY voltage_level
          ORDER BY voltage_level
        `, (e, rVolt) => {
          console.log('\n--- 4. VOLTAGE-WISE BREAKDOWN (After Excluding Inactive) ---');
          console.table(rVolt);

          // 5. Check if any inactive feeders matched by MSN vs Feeder Code
          con.all(`
            SELECT 
              count(*) FILTER (WHERE msn IN (${msnList})) as matched_by_msn,
              count(*) FILTER (WHERE feeder_code IN (${fcList})) as matched_by_fc,
              count(*) FILTER (WHERE msn IN (${msnList}) AND feeder_code IN (${fcList})) as matched_both,
              count(*) FILTER (WHERE msn IN (${msnList}) OR feeder_code IN (${fcList})) as matched_either
            FROM feeder_meter_analytics
          `, (e, rMatch) => {
            console.log('\n--- 5. MATCHING ACCURACY ---');
            console.table(rMatch);
            db.close();
          });
        });
      });
    });
  });
});
