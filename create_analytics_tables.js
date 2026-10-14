const duckdb = require('duckdb');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'sbpdcl_analytics.duckdb');

async function buildTables() {
  console.log('Connecting to DuckDB:', dbPath);
  const db = await new Promise((resolve, reject) => {
    const d = new duckdb.Database(dbPath, (err) => {
      if (err) reject(err);
      else resolve(d);
    });
  });
  const con = db.connect();

  const runQuery = (sql) => new Promise((resolve, reject) => {
    con.run(sql, (err) => err ? reject(err) : resolve());
  });

  const allQuery = (sql) => new Promise((resolve, reject) => {
    con.all(sql, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(r => {
        const obj = {};
        for (let k in r) {
          obj[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k];
        }
        return obj;
      }));
    });
  });

  try {
    // 1. Locate latest DTR files
    const dtrMaster = path.join(dataDir, 'DTR Master Information_310798_batch1.csv').replace(/\\/g, '/');
    const dtrNonComm = path.join(dataDir, 'DTR Non Communicating REPORT_310799_batch1.csv').replace(/\\/g, '/');
    const dtrNeverComm = path.join(dataDir, 'DTR Never Communicating REPORT_310800_batch1.csv').replace(/\\/g, '/');

    console.log('Building dt_meter_analytics...');
    await runQuery('DROP TABLE IF EXISTS dt_meter_analytics');
    await runQuery(`
      CREATE TABLE dt_meter_analytics AS
      WITH master AS (
        SELECT
          UPPER(TRIM("MSN")) as msn,
          UPPER(TRIM("Circle")) as circle,
          UPPER(TRIM("Division")) as division,
          UPPER(TRIM("Subdivision")) as subdivision,
          UPPER(TRIM("Section")) as section,
          TRIM("Sub Station") as sub_station,
          TRIM("Feeder") as feeder,
          TRIM("Feeder Code") as feeder_code,
          TRIM("DTR") as dtr_name,
          TRIM("DTR Code") as dtr_code,
          TRIM("Make") as make,
          TRIM("DTR Type") as dtr_type,
          CAST("DTR Rating" AS VARCHAR) as dtr_rating,
          CAST("Installation Date" AS VARCHAR) as installed_date,
          CAST("Moderm Installation" AS VARCHAR) as modem_installation,
          "Latitude" as latitude,
          "Longitude" as longitude
        FROM read_csv_auto('${dtrMaster}', ignore_errors=true)
        WHERE "MSN" IS NOT NULL AND TRIM("MSN") != ''
      ),
      nc AS (
        SELECT 
          UPPER(TRIM("Meter Serial Number")) as msn,
          "Last Communication" as last_comm_timestamp,
          "Last Communication Payload" as last_payload,
          TRY_CAST(Aging AS BIGINT) as duration_days
        FROM read_csv_auto('${dtrNonComm}', ignore_errors=true)
        WHERE "Meter Serial Number" IS NOT NULL
      ),
      nev AS (
        SELECT 
          UPPER(TRIM("Meter Serial Number")) as msn,
          TRY_CAST(Aging AS BIGINT) as duration_days
        FROM read_csv_auto('${dtrNeverComm}', ignore_errors=true)
        WHERE "Meter Serial Number" IS NOT NULL
      )
      SELECT 
        m.msn,
        m.circle,
        m.division,
        m.subdivision,
        m.section,
        m.sub_station,
        m.feeder,
        m.feeder_code,
        m.dtr_name,
        m.dtr_code,
        m.make,
        m.dtr_type,
        m.dtr_rating,
        m.installed_date,
        m.modem_installation,
        m.latitude,
        m.longitude,
        CASE
          WHEN nev.msn IS NOT NULL THEN NULL
          WHEN nc.msn IS NOT NULL THEN CAST(nc.last_comm_timestamp AS VARCHAR)
          ELSE 'Communicating (<=3D)'
        END as last_comm_timestamp,
        CASE
          WHEN nev.msn IS NOT NULL THEN nev.duration_days
          WHEN nc.msn IS NOT NULL THEN nc.duration_days
          ELSE 0
        END as duration_days,
        CASE 
          WHEN nev.msn IS NOT NULL THEN 'Never Communicated'
          WHEN nc.msn IS NOT NULL THEN 
            CASE 
              WHEN nc.duration_days <= 3 THEN 'Communicating'
              WHEN nc.duration_days BETWEEN 4 AND 7 THEN 'Non-Comm (4-7D)'
              ELSE 'Non-Comm (>7D)'
            END
          ELSE 'Communicating'
        END as comm_category,
        CASE 
          WHEN nev.msn IS NOT NULL THEN 1
          WHEN nc.msn IS NOT NULL AND nc.duration_days > 3 THEN 1
          ELSE 0
        END as is_non_comm,
        CASE 
          WHEN nev.msn IS NOT NULL THEN 1
          ELSE 0
        END as is_never_comm,
        CASE 
          WHEN nev.msn IS NOT NULL THEN 'Never Communicated'
          WHEN nc.msn IS NOT NULL THEN
            CASE 
              WHEN nc.duration_days <= 3 THEN '<= 3 Days'
              WHEN nc.duration_days BETWEEN 4 AND 7 THEN '4 - 7 Days'
              WHEN nc.duration_days BETWEEN 8 AND 15 THEN '8 - 15 Days'
              WHEN nc.duration_days BETWEEN 16 AND 30 THEN '16 - 30 Days'
              WHEN nc.duration_days BETWEEN 31 AND 60 THEN '31 - 60 Days'
              WHEN nc.duration_days BETWEEN 61 AND 90 THEN '61 - 90 Days'
              WHEN nc.duration_days BETWEEN 91 AND 180 THEN '91 - 180 Days'
              ELSE '> 180 Days'
            END
          ELSE '<= 3 Days'
        END as aging_bucket
      FROM master m
      LEFT JOIN nc ON m.msn = nc.msn
      LEFT JOIN nev ON m.msn = nev.msn
    `);

    const dtStats = await allQuery(`
      SELECT 
        count(*) as total_installed,
        count(*) FILTER (WHERE is_non_comm = 0) as communicating,
        count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
        count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_3_7d,
        count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
        count(*) FILTER (WHERE is_never_comm = 1) as never_communicated
      FROM dt_meter_analytics
    `);
    console.log('DT Analytics Stats:', dtStats[0]);

    // 2. Locate latest Feeder files
    const fdrMaster = path.join(dataDir, 'Feeder Master Information_310801_batch1.csv').replace(/\\/g, '/');
    const fdrNonComm = path.join(dataDir, 'Feeder Non Communicating Report_310802_batch1.csv').replace(/\\/g, '/');
    const fdrNeverComm = path.join(dataDir, 'Feeder Never Communicaing Report_310803_batch1.csv').replace(/\\/g, '/');

    console.log('Building feeder_meter_analytics...');
    await runQuery('DROP TABLE IF EXISTS feeder_meter_analytics');
    await runQuery(`
      CREATE TABLE feeder_meter_analytics AS
      WITH master AS (
        SELECT
          UPPER(TRIM("MSN")) as msn,
          UPPER(TRIM("Circle")) as circle,
          UPPER(TRIM("Division")) as division,
          UPPER(TRIM("Subdivision")) as subdivision,
          UPPER(TRIM("Section")) as section,
          TRIM("SS Code") as ss_code,
          TRIM("SubStation Name") as substation_name,
          TRIM("Feeder Code") as feeder_code,
          TRIM("Feeder Name") as feeder_name,
          TRIM("Make") as make,
          TRIM("FeederType") as feeder_type,
          TRIM("Mode") as mode,
          UPPER(TRIM("Voltage Level")) as voltage_level,
          CAST("Installation Date" AS VARCHAR) as installed_date,
          "Latitude" as latitude,
          "Longitude" as longitude
        FROM read_csv_auto('${fdrMaster}', ignore_errors=true)
        WHERE "MSN" IS NOT NULL AND TRIM("MSN") != ''
      ),
      nc AS (
        SELECT 
          UPPER(TRIM("Meter Serial Number")) as msn,
          "Last Communication" as last_comm_timestamp,
          "Last Communication Payload" as last_payload,
          TRY_CAST(Aging AS BIGINT) as duration_days
        FROM read_csv_auto('${fdrNonComm}', ignore_errors=true)
        WHERE "Meter Serial Number" IS NOT NULL
      ),
      nev AS (
        SELECT 
          UPPER(TRIM("Meter Serial Number")) as msn,
          TRY_CAST(Aging AS BIGINT) as duration_days
        FROM read_csv_auto('${fdrNeverComm}', ignore_errors=true)
        WHERE "Meter Serial Number" IS NOT NULL
      )
      SELECT 
        m.msn,
        m.circle,
        m.division,
        m.subdivision,
        m.section,
        m.ss_code,
        m.substation_name,
        m.feeder_code,
        m.feeder_name,
        m.make,
        m.feeder_type,
        m.mode,
        m.voltage_level,
        m.installed_date,
        m.latitude,
        m.longitude,
        CASE
          WHEN nev.msn IS NOT NULL THEN NULL
          WHEN nc.msn IS NOT NULL THEN CAST(nc.last_comm_timestamp AS VARCHAR)
          ELSE 'Communicating (<=3D)'
        END as last_comm_timestamp,
        CASE
          WHEN nev.msn IS NOT NULL THEN nev.duration_days
          WHEN nc.msn IS NOT NULL THEN nc.duration_days
          ELSE 0
        END as duration_days,
        CASE 
          WHEN nev.msn IS NOT NULL THEN 'Never Communicated'
          WHEN nc.msn IS NOT NULL THEN 
            CASE 
              WHEN nc.duration_days <= 3 THEN 'Communicating'
              WHEN nc.duration_days BETWEEN 4 AND 7 THEN 'Non-Comm (4-7D)'
              ELSE 'Non-Comm (>7D)'
            END
          ELSE 'Communicating'
        END as comm_category,
        CASE 
          WHEN nev.msn IS NOT NULL THEN 1
          WHEN nc.msn IS NOT NULL AND nc.duration_days > 3 THEN 1
          ELSE 0
        END as is_non_comm,
        CASE 
          WHEN nev.msn IS NOT NULL THEN 1
          ELSE 0
        END as is_never_comm,
        CASE 
          WHEN nev.msn IS NOT NULL THEN 'Never Communicated'
          WHEN nc.msn IS NOT NULL THEN
            CASE 
              WHEN nc.duration_days <= 3 THEN '<= 3 Days'
              WHEN nc.duration_days BETWEEN 4 AND 7 THEN '4 - 7 Days'
              WHEN nc.duration_days BETWEEN 8 AND 15 THEN '8 - 15 Days'
              WHEN nc.duration_days BETWEEN 16 AND 30 THEN '16 - 30 Days'
              WHEN nc.duration_days BETWEEN 31 AND 60 THEN '31 - 60 Days'
              WHEN nc.duration_days BETWEEN 61 AND 90 THEN '61 - 90 Days'
              WHEN nc.duration_days BETWEEN 91 AND 180 THEN '91 - 180 Days'
              ELSE '> 180 Days'
            END
          ELSE '<= 3 Days'
        END as aging_bucket
      FROM master m
      LEFT JOIN nc ON m.msn = nc.msn
      LEFT JOIN nev ON m.msn = nev.msn
    `);

    const fdrStats = await allQuery(`
      SELECT 
        voltage_level,
        count(*) as total_installed,
        count(*) FILTER (WHERE is_non_comm = 0) as communicating,
        count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
        count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_3_7d,
        count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
        count(*) FILTER (WHERE is_never_comm = 1) as never_communicated
      FROM feeder_meter_analytics
      GROUP BY voltage_level
      ORDER BY voltage_level
    `);
    console.log('Feeder Analytics Stats by Voltage:', fdrStats);

    console.log('Both tables created successfully in DuckDB!');

  } finally {
    try { con.close(); } catch (e) {}
    try { db.close(); } catch (e) {}
  }
}

buildTables()
  .then(() => console.log('Done!'))
  .catch(err => console.error('Error:', err));
