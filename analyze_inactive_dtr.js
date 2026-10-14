const XLSX = require('xlsx');
const duckdb = require('duckdb');
const fs = require('fs');
const path = require('path');

const filePath = 'C:/Users/Dharmendra Pal Singh/OneDrive - INTELLI SMART/Desktop/MY Dashboard/Unified Master Dashboard/references/Inactive DTR.xlsx';
const wb = XLSX.readFile(filePath);
const data = XLSX.utils.sheet_to_json(wb.Sheets['Dump']);
console.log('Total Dump rows in Inactive DTR.xlsx:', data.length);

// Export to data/inactive_dtrs.csv for DuckDB joining
const csvHeader = 'msn,dtr_code,main_remarks,sub_remarks\n';
const csvRows = data.map(r => {
  const msn = String(r.MSN || '').trim().toUpperCase().replace(/"/g, '""');
  const dtrCode = String(r['DTR Code'] || '').trim().toUpperCase().replace(/"/g, '""');
  const mainRemarks = String(r.Main_Remarks || '').trim().replace(/"/g, '""');
  const subRemarks = String(r.Sub_Remarks || '').trim().replace(/"/g, '""');
  return `"${msn}","${dtrCode}","${mainRemarks}","${subRemarks}"`;
}).join('\n');

const csvPath = path.join(__dirname, 'data', 'inactive_dtrs.csv');
fs.writeFileSync(csvPath, csvHeader + csvRows, 'utf8');
console.log('Exported inactive_dtrs.csv with', data.length, 'records to', csvPath);

const db = new duckdb.Database('data/sbpdcl_analytics.duckdb', duckdb.OPEN_READONLY, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const con = db.connect();

  con.all(`
    CREATE TEMPORARY TABLE inactive_dtr_ref AS 
    SELECT DISTINCT msn, dtr_code, main_remarks, sub_remarks
    FROM read_csv_auto('data/inactive_dtrs.csv')
  `, (e) => {
    if (e) {
      console.error('Error creating temp table:', e);
      return db.close();
    }

    // 1. Overall DT Meters Before Exclusion
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
      FROM dt_meter_analytics
    `, (e, rAll) => {
      console.log('\n--- 1. OVERALL DT METERS (Before Exclusion) ---');
      console.table(rAll);

      // 2. Inactive DT meters matched in DB
      con.all(`
        SELECT
          count(*) as total_inactive_matched,
          count(*) FILTER (WHERE d.is_non_comm = 0) as comm_inactive,
          count(*) FILTER (WHERE d.is_non_comm = 1) as non_comm_inactive,
          count(*) FILTER (WHERE d.comm_category = 'Non-Comm (4-7D)') as nc_4_7d_inactive,
          count(*) FILTER (WHERE d.comm_category = 'Non-Comm (>7D)') as nc_gt_7d_inactive,
          count(*) FILTER (WHERE d.is_never_comm = 1) as never_inactive,
          ROUND(count(*) FILTER (WHERE d.is_non_comm = 0) * 100.0 / count(*), 2) as comm_pct_inactive,
          ROUND(count(*) FILTER (WHERE d.is_non_comm = 1) * 100.0 / count(*), 2) as non_comm_pct_inactive
        FROM dt_meter_analytics d
        INNER JOIN inactive_dtr_ref r ON d.msn = r.msn OR d.dtr_code = r.dtr_code
      `, (e, rInactive) => {
        console.log('\n--- 2. INACTIVE DT METERS MATCHED IN DB ---');
        console.table(rInactive);

        // 3. Active DT Meters (After Excluding Inactive)
        con.all(`
          SELECT
            count(*) as total_active,
            count(*) FILTER (WHERE d.is_non_comm = 0) as comm_active,
            count(*) FILTER (WHERE d.is_non_comm = 1) as non_comm_active,
            count(*) FILTER (WHERE d.comm_category = 'Non-Comm (4-7D)') as nc_4_7d_active,
            count(*) FILTER (WHERE d.comm_category = 'Non-Comm (>7D)') as nc_gt_7d_active,
            count(*) FILTER (WHERE d.is_never_comm = 1) as never_active,
            ROUND(count(*) FILTER (WHERE d.is_non_comm = 0) * 100.0 / count(*), 2) as comm_pct_active,
            ROUND(count(*) FILTER (WHERE d.is_non_comm = 1) * 100.0 / count(*), 2) as non_comm_pct_active
          FROM dt_meter_analytics d
          WHERE NOT EXISTS (
            SELECT 1 FROM inactive_dtr_ref r WHERE d.msn = r.msn OR d.dtr_code = r.dtr_code
          )
        `, (e, rActive) => {
          console.log('\n--- 3. ACTIVE DT METERS (After Excluding Inactive) ---');
          console.table(rActive);

          // 4. Match comparison: MSN vs DTR Code
          con.all(`
            SELECT
              count(DISTINCT r.msn) as unique_msn_in_ref,
              count(DISTINCT r.dtr_code) as unique_dtr_in_ref,
              count(*) FILTER (WHERE d.msn IS NOT NULL) as matched_by_msn,
              count(*) FILTER (WHERE d2.dtr_code IS NOT NULL) as matched_by_dtr_code,
              count(*) FILTER (WHERE d.msn IS NOT NULL OR d2.dtr_code IS NOT NULL) as matched_either
            FROM inactive_dtr_ref r
            LEFT JOIN dt_meter_analytics d ON r.msn = d.msn
            LEFT JOIN dt_meter_analytics d2 ON r.dtr_code = d2.dtr_code
          `, (e, rMatch) => {
            console.log('\n--- 4. MATCHING BREAKDOWN ---');
            console.table(rMatch);

            // 5. Circle-wise Breakdown of Inactive vs Active
            con.all(`
              SELECT
                d.circle,
                count(*) as total_installed,
                count(*) FILTER (WHERE r.msn IS NOT NULL OR r2.dtr_code IS NOT NULL) as inactive_count,
                count(*) FILTER (WHERE r.msn IS NULL AND r2.dtr_code IS NULL) as active_installed,
                count(*) FILTER (WHERE (r.msn IS NULL AND r2.dtr_code IS NULL) AND d.is_non_comm = 0) as active_comm,
                count(*) FILTER (WHERE (r.msn IS NULL AND r2.dtr_code IS NULL) AND d.is_non_comm = 1) as active_non_comm,
                ROUND(count(*) FILTER (WHERE (r.msn IS NULL AND r2.dtr_code IS NULL) AND d.is_non_comm = 0) * 100.0 / 
                      NULLIF(count(*) FILTER (WHERE r.msn IS NULL AND r2.dtr_code IS NULL), 0), 2) as active_comm_pct,
                ROUND(count(*) FILTER (WHERE (r.msn IS NULL AND r2.dtr_code IS NULL) AND d.is_non_comm = 1) * 100.0 / 
                      NULLIF(count(*) FILTER (WHERE r.msn IS NULL AND r2.dtr_code IS NULL), 0), 2) as active_non_comm_pct
              FROM dt_meter_analytics d
              LEFT JOIN inactive_dtr_ref r ON d.msn = r.msn
              LEFT JOIN inactive_dtr_ref r2 ON d.dtr_code = r2.dtr_code
              GROUP BY d.circle
              ORDER BY d.circle
            `, (e, rCircle) => {
              console.log('\n--- 5. CIRCLE-WISE BREAKDOWN (Active vs Inactive) ---');
              console.table(rCircle);

              // 6. Main Remarks Breakdown
              con.all(`
                SELECT
                  r.main_remarks,
                  count(*) as count
                FROM inactive_dtr_ref r
                GROUP BY r.main_remarks
                ORDER BY count DESC
              `, (e, rRemarks) => {
                console.log('\n--- 6. MAIN REMARKS IN INACTIVE DTR LIST ---');
                console.table(rRemarks);
                db.close();
              });
            });
          });
        });
      });
    });
  });
});
