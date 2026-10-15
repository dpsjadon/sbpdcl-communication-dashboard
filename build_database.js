const duckdb = require('duckdb');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'sbpdcl_analytics.duckdb');
const cachePath = path.join(dataDir, 'precomputed_analytics.json');

async function buildDatabase(options = {}) {
  const target = options.target || 'all';
  console.log(`=== STARTING SBPDCL ANALYTICS BUILD PIPELINE (Target: ${target.toUpperCase()}) ===`);
  const startTime = Date.now();

  const timestamp = Date.now();
  const versionedFileName = `sbpdcl_analytics_v${timestamp}.duckdb`;
  const targetDbPath = path.join(dataDir, versionedFileName);

  // Check what the current active DB is
  let currentActiveDbPath = path.join(dataDir, 'sbpdcl_analytics.duckdb');
  const activeCfgPath = path.join(dataDir, 'active_db.json');
  if (fs.existsSync(activeCfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(activeCfgPath, 'utf8'));
      if (cfg.activeDb && fs.existsSync(path.join(dataDir, cfg.activeDb))) {
        currentActiveDbPath = path.join(dataDir, cfg.activeDb);
      }
    } catch (e) {}
  }

  // Open brand-new versioned DB file in write mode with zero locking conflicts
  const db = new duckdb.Database(targetDbPath);
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

  // If not rebuilding all tables, attach current active DB and reuse other tables
  if (target !== 'all' && fs.existsSync(currentActiveDbPath)) {
    try {
      await runQuery(`ATTACH '${currentActiveDbPath.replace(/\\/g, '/')}' AS old_db (READ_ONLY)`);
      if (target !== 'consumer' && target !== 'consumer_master' && target !== 'consumer_comm') {
        await runQuery(`CREATE TABLE smart_meter_analytics AS SELECT * FROM old_db.smart_meter_analytics`).catch(() => {});
      }
      if (target !== 'dt' && target !== 'dt_master' && target !== 'dt_non_comm' && target !== 'dt_never_comm') {
        await runQuery(`CREATE TABLE dt_meter_analytics AS SELECT * FROM old_db.dt_meter_analytics`).catch(() => {});
      }
      if (target !== 'feeder' && target !== 'feeder_master' && target !== 'feeder_non_comm' && target !== 'feeder_never_comm') {
        await runQuery(`CREATE TABLE feeder_meter_analytics AS SELECT * FROM old_db.feeder_meter_analytics`).catch(() => {});
      }
      if (target !== 'complaint' && target !== 'onm') {
        await runQuery(`CREATE TABLE complaint_analytics AS SELECT * FROM old_db.complaint_analytics`).catch(() => {});
      }
      await runQuery(`DETACH old_db`).catch(() => {});
    } catch (attachErr) {
      console.warn('Notice attaching previous db for table reuse:', attachErr.message);
    }
  }

  const findLatestCsv = (pattern) => {
    const files = fs.readdirSync(dataDir)
      .filter(f => f.toLowerCase().includes(pattern.toLowerCase()) && f.endsWith('.csv'))
      .map(f => ({
        name: f,
        path: path.join(dataDir, f).replace(/\\/g, '/'),
        mtime: fs.statSync(path.join(dataDir, f)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? files[0].path : null;
  };

  try {
    // -------------------------------------------------------------
    // 1. CONSUMER METERS TABLE
    // -------------------------------------------------------------
    if (target === 'all' || target === 'consumer' || target.startsWith('consumer')) {
      console.log('\n--- Building Consumer Meter Analytics ---');
      const masterFiles = fs.readdirSync(dataDir)
        .filter(f => f.includes('Prepaid') && f.endsWith('.csv'))
        .map(f => {
          const match = f.match(/(\d{6,})/);
          return {
            name: f,
            path: path.join(dataDir, f),
            reqId: match ? match[1] : '',
            mtime: fs.statSync(path.join(dataDir, f)).mtimeMs
          };
        })
        .sort((a, b) => b.mtime - a.mtime);

      const lastCommFiles = fs.readdirSync(dataDir)
        .filter(f => f.includes('Last Communication') && f.endsWith('.csv'))
        .map(f => {
          const match = f.match(/(\d{6,})/);
          return {
            name: f,
            path: path.join(dataDir, f),
            reqId: match ? match[1] : '',
            mtime: fs.statSync(path.join(dataDir, f)).mtimeMs
          };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (masterFiles.length > 0 && lastCommFiles.length > 0) {
        const latestMasterReqId = masterFiles[0].reqId;
        const activeMasterFiles = masterFiles
          .filter(f => (latestMasterReqId ? f.reqId === latestMasterReqId : true))
          .map(f => f.path.replace(/\\/g, '/'));

        const latestLastCommReqId = lastCommFiles[0].reqId;
        const activeLastCommFiles = lastCommFiles
          .filter(f => (latestLastCommReqId ? f.reqId === latestLastCommReqId : true))
          .map(f => f.path.replace(/\\/g, '/'));

        await runQuery('DROP TABLE IF EXISTS smart_meter_analytics');
        await runQuery('DROP TABLE IF EXISTS non_communicating_meters');
        await runQuery('DROP TABLE IF EXISTS master_meters');
        await runQuery('DROP TABLE IF EXISTS last_comm_info');

        const lastCommFilesArr = activeLastCommFiles.map(f => `'${f}'`).join(',');
        await runQuery(`
          CREATE TABLE last_comm_info AS
          SELECT 
            UPPER(TRIM(MSN)) as msn,
            Department as department,
            Communication as communication_type,
            "Last Communication Timestamp" as last_comm_timestamp,
            TRY_CAST("Last communication Duration(Days)" AS BIGINT) as duration_days,
            Tariff as tariff
          FROM read_csv_auto([${lastCommFilesArr}], ignore_errors=true)
          WHERE MSN IS NOT NULL AND TRIM(MSN) != ''
        `);

        const masterFilesArr = activeMasterFiles.map(f => `'${f}'`).join(',');
        await runQuery(`
          CREATE TABLE master_meters AS
          SELECT 
            UPPER(TRIM("MSN")) as msn,
            CAST("Consumer Id" AS VARCHAR) as consumer_id,
            TRIM("Name") as name,
            TRIM("Address") as address,
            UPPER(TRIM("Circle")) as circle,
            UPPER(TRIM("Division")) as division,
            UPPER(TRIM("SubDivision")) as subdivision,
            UPPER(TRIM("Section")) as section,
            TRIM("Feeder") as feeder,
            TRIM("DTName") as dt_name,
            TRIM("Category") as category,
            CASE 
              WHEN UPPER(TRIM("Phase")) LIKE '3PH%' OR UPPER(TRIM("Phase")) LIKE '3 PH%' OR UPPER(TRIM("Phase")) LIKE '%3P%' THEN '3 PH'
              ELSE '1 PH'
            END as phase,
            CASE 
              WHEN UPPER(TRIM("MSN")) LIKE 'F%' THEN 'SCHNEIDER'
              WHEN UPPER(TRIM("MSN")) LIKE 'S%' THEN 'GENUS'
              WHEN UPPER(TRIM("MSN")) LIKE 'H%' THEN 'HPL'
              ELSE 'OTHER'
            END as make,
            CAST("Installed Date" AS VARCHAR) as installed_date
          FROM read_csv_auto([${masterFilesArr}], ignore_errors=true)
          WHERE "MSN" IS NOT NULL AND TRIM("MSN") != ''
        `);

        await runQuery(`
          CREATE TABLE smart_meter_analytics AS
          SELECT 
            m.msn,
            m.consumer_id,
            m.name,
            m.address,
            m.circle,
            m.division,
            m.subdivision,
            m.section,
            m.feeder,
            m.dt_name,
            m.category,
            COALESCE(lc.tariff, 'Domestic') as tariff,
            m.phase,
            m.make,
            COALESCE(lc.department, 'HES-Airtel') as department,
            COALESCE(lc.communication_type, 'GPRS') as communication_type,
            m.installed_date,
            lc.last_comm_timestamp,
            lc.duration_days,
            CASE 
              WHEN lc.duration_days IS NOT NULL AND lc.duration_days <= 3 THEN 'Communicating'
              WHEN lc.duration_days BETWEEN 4 AND 7 THEN 'Non-Comm (4-7D)'
              WHEN lc.duration_days > 7 THEN 'Non-Comm (>7D)'
              ELSE 'Never Communicated'
            END as comm_category,
            CASE 
              WHEN lc.duration_days IS NOT NULL AND lc.duration_days <= 3 THEN 0
              ELSE 1
            END as is_non_comm,
            CASE 
              WHEN lc.duration_days IS NULL THEN 1
              ELSE 0
            END as is_never_comm,
            CASE 
              WHEN lc.duration_days IS NULL THEN 'Never Communicated'
              WHEN lc.duration_days <= 3 THEN '<= 3 Days'
              WHEN lc.duration_days BETWEEN 4 AND 7 THEN '4 - 7 Days'
              WHEN lc.duration_days BETWEEN 8 AND 15 THEN '8 - 15 Days'
              WHEN lc.duration_days BETWEEN 16 AND 30 THEN '16 - 30 Days'
              WHEN lc.duration_days BETWEEN 31 AND 60 THEN '31 - 60 Days'
              WHEN lc.duration_days BETWEEN 61 AND 90 THEN '61 - 90 Days'
              WHEN lc.duration_days BETWEEN 91 AND 180 THEN '91 - 180 Days'
              ELSE '> 180 Days'
            END as aging_bucket
          FROM master_meters m
          LEFT JOIN last_comm_info lc ON m.msn = lc.msn
        `);

        await runQuery(`
          CREATE TABLE non_communicating_meters AS
          SELECT 
            msn, consumer_id, name, address, circle, division, subdivision, section,
            feeder, dt_name, category, tariff, phase, make, department, communication_type,
            installed_date, last_comm_timestamp, duration_days, comm_category, aging_bucket
          FROM smart_meter_analytics
          WHERE is_non_comm = 1
        `);
        console.log('Consumer smart_meter_analytics created successfully.');
      } else {
        console.log('Skipping consumer rebuild (CSVs not present).');
      }
    }

    // -------------------------------------------------------------
    // 2. DT METERS TABLE
    // -------------------------------------------------------------
    if (target === 'all' || target === 'dt' || target.startsWith('dt')) {
      console.log('\n--- Building DT Meter Analytics ---');
      const dtrMaster = findLatestCsv('DTR Master Information');
      const dtrNonComm = findLatestCsv('DTR Non Communicating');
      const dtrNeverComm = findLatestCsv('DTR Never Communicating');

      if (dtrMaster && dtrNonComm && dtrNeverComm) {
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
          ),
          inact AS (
            ${fs.existsSync(path.join(dataDir, 'inactive_dtrs.csv')) ? `
              SELECT DISTINCT UPPER(TRIM(msn)) as msn, UPPER(TRIM(dtr_code)) as dtr_code
              FROM read_csv_auto('${path.join(dataDir, 'inactive_dtrs.csv').replace(/\\/g, '/')}', ignore_errors=true)
            ` : `
              SELECT '' as msn, '' as dtr_code WHERE 1=0
            `}
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
              WHEN inact.msn IS NOT NULL OR inact_dtr.dtr_code IS NOT NULL THEN 1 
              ELSE 0 
            END as is_inactive,
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
          LEFT JOIN inact ON m.msn = inact.msn
          LEFT JOIN inact inact_dtr ON m.dtr_code = inact_dtr.dtr_code
        `);
        console.log('dt_meter_analytics created successfully.');
      } else {
        console.log('Skipping DT rebuild (CSVs not present).');
      }
    }

    // -------------------------------------------------------------
    // 3. FEEDER METERS TABLE
    // -------------------------------------------------------------
    if (target === 'all' || target === 'feeder' || target.startsWith('feeder')) {
      console.log('\n--- Building Feeder Meter Analytics ---');
      const fdrMaster = findLatestCsv('Feeder Master Information');
      const fdrNonComm = findLatestCsv('Feeder Non Communicating');
      const fdrNeverComm = findLatestCsv('Feeder Never Communica');

      if (fdrMaster && fdrNonComm && fdrNeverComm) {
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
          ),
          inact AS (
            ${fs.existsSync(path.join(dataDir, 'inactive_feeders.csv')) ? `
              SELECT DISTINCT UPPER(TRIM(msn)) as msn, UPPER(TRIM(feeder_code)) as feeder_code
              FROM read_csv_auto('${path.join(dataDir, 'inactive_feeders.csv').replace(/\\/g, '/')}', ignore_errors=true)
            ` : `
              SELECT '' as msn, '' as feeder_code WHERE 1=0
            `}
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
              WHEN inact.msn IS NOT NULL OR inact_fc.feeder_code IS NOT NULL THEN 1 
              ELSE 0 
            END as is_inactive,
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
          LEFT JOIN inact ON m.msn = inact.msn
          LEFT JOIN inact inact_fc ON m.feeder_code = inact_fc.feeder_code
        `);
        console.log('feeder_meter_analytics created successfully.');
      } else {
        console.log('Skipping Feeder rebuild (CSVs not present).');
      }
    }

    // -------------------------------------------------------------
    // 4. ONM COMPLAINT & TICKET ANALYTICS TABLE (Combined with Notify to Discom)
    // -------------------------------------------------------------
    if (target === 'all' || target === 'complaint' || target === 'onm') {
      console.log('\n--- Building OnM Complaint & Notify Status Analytics ---');
      const complaintCsv = findLatestCsv('Complaint');
      const notifyCsvs = fs.readdirSync(dataDir)
        .filter(f => f.toLowerCase().includes('notify') && f.endsWith('.csv'))
        .map(f => path.join(dataDir, f).replace(/\\/g, '/'));

      if (complaintCsv || notifyCsvs.length > 0) {
        console.log(`Using OnM complaint file: ${complaintCsv || 'None'}`);
        console.log(`Using Notify files (${notifyCsvs.length}): ${notifyCsvs.join(', ') || 'None'}`);

        let unionParts = [];
        if (complaintCsv) {
          unionParts.push(`
            SELECT 
              TRIM("TicketNo") as ticket_no,
              TRIM("Discom") as discom,
              UPPER(TRIM("Circle")) as circle,
              UPPER(TRIM("Division")) as division,
              UPPER(TRIM("Subdivision")) as subdivision,
              UPPER(TRIM("Section")) as section,
              TRIM("Sub Station") as sub_station,
              TRIM("Feeder") as feeder,
              TRIM("DTR") as dtr,
              TRIM("Consumer ID") as consumer_id,
              TRIM("Consumer Name") as consumer_name,
              TRIM("Consumer Address") as consumer_address,
              TRIM("Mobile Number") as mobile_no,
              TRIM("Ticket Status") as ticket_status,
              "Ticket Creation Date" as raw_created_at,
              "Ticket Resolve Date" as raw_resolved_at,
              "Resolution Time(Days)" as raw_res_time,
              TRIM("MSN") as msn,
              COALESCE(NULLIF(TRIM("Complaint Type"), ''), 'General') as complaint_type,
              COALESCE(NULLIF(TRIM("Complaint Description"), ''), 'Not Specified') as complaint_description,
              COALESCE(NULLIF(TRIM("Detail Remark"), ''), 'Not Specified') as detail_remark,
              COALESCE(NULLIF(TRIM("Priority"), ''), 'Normal') as priority,
              COALESCE(NULLIF(TRIM("Onm Main Remarks"), ''), 'Pending Field Action') as main_remarks,
              COALESCE(NULLIF(TRIM("OnM Sub Remarks"), ''), 'Pending Field Action') as sub_remarks,
              COALESCE(NULLIF(TRIM("Agency Name"), ''), 'IntelliSmart') as agency,
              COALESCE(NULLIF(TRIM("Technician Name"), ''), 'Unassigned') as technician,
              COALESCE(NULLIF(TRIM("Source"), ''), 'MDMS') as source,
              1 as priority_source
            FROM read_csv_auto('${complaintCsv}', all_varchar=true)
            WHERE "TicketNo" IS NOT NULL AND TRIM("TicketNo") != ''
          `);
        }

        if (notifyCsvs.length > 0) {
          const notifySources = notifyCsvs.map(f => `'${f}'`).join(', ');
          unionParts.push(`
            SELECT 
              TRIM("Ticket Number") as ticket_no,
              TRIM("Discom") as discom,
              UPPER(TRIM("Circle")) as circle,
              UPPER(TRIM("Division")) as division,
              UPPER(TRIM("Subdivision")) as subdivision,
              UPPER(TRIM("Section")) as section,
              TRIM("Sub Station") as sub_station,
              TRIM("Feeder") as feeder,
              TRIM("DTR") as dtr,
              TRIM("Consumer ID") as consumer_id,
              TRIM("Consumer Name") as consumer_name,
              TRIM("Consumer Address") as consumer_address,
              TRIM("Mobile Number") as mobile_no,
              TRIM("Ticket Status") as ticket_status,
              "Ticket Creation Date" as raw_created_at,
              "Ticket Resolve Date" as raw_resolved_at,
              "Resolution Time(Days)" as raw_res_time,
              TRIM("MSN") as msn,
              COALESCE(NULLIF(TRIM("Complaint Type"), ''), 'General') as complaint_type,
              COALESCE(NULLIF(TRIM("Complaint Description"), ''), 'Not Specified') as complaint_description,
              COALESCE(NULLIF(TRIM("Detail Remark"), ''), 'Not Specified') as detail_remark,
              COALESCE(NULLIF(TRIM("Priority"), ''), 'Normal') as priority,
              COALESCE(NULLIF(TRIM("Onm Main Remarks"), ''), 'Pending Field Action') as main_remarks,
              COALESCE(NULLIF(TRIM("OnM Sub Remarks"), ''), 'Pending Field Action') as sub_remarks,
              COALESCE(NULLIF(TRIM("Agency Name"), ''), 'IntelliSmart') as agency,
              COALESCE(NULLIF(TRIM("Technician Name"), ''), 'Unassigned') as technician,
              COALESCE(NULLIF(TRIM("Source"), ''), 'MDMS') as source,
              2 as priority_source
            FROM read_csv_auto([${notifySources}], all_varchar=true)
            WHERE "Ticket Number" IS NOT NULL AND TRIM("Ticket Number") != ''
          `);
        }

        const fullUnionSql = unionParts.join('\n UNION ALL \n');

        await runQuery('DROP TABLE IF EXISTS complaint_analytics');
        await runQuery(`
          CREATE TABLE complaint_analytics AS
          WITH raw_all AS (
            ${fullUnionSql}
          ),
          deduped AS (
            SELECT *,
              ROW_NUMBER() OVER (
                PARTITION BY ticket_no 
                ORDER BY priority_source ASC, raw_created_at DESC
              ) as rn
            FROM raw_all
          ),
          cleaned AS (
            SELECT 
              ticket_no,
              discom,
              circle,
              division,
              subdivision,
              section,
              sub_station,
              feeder,
              dtr,
              consumer_id,
              consumer_name,
              consumer_address,
              mobile_no,
              ticket_status,
              CASE 
                WHEN ticket_status = 'Closed' THEN 'Closed'
                WHEN ticket_status IN ('Pending', 'Notify to Discom', 'MR Required', 'Notify to SI') THEN 'Open/Pending'
                WHEN ticket_status = 'Attended' THEN 'In Progress'
                ELSE ticket_status
              END as status_group,
              CASE WHEN ticket_status = 'Closed' THEN 1 ELSE 0 END as is_closed,
              CASE WHEN ticket_status != 'Closed' THEN 1 ELSE 0 END as is_open,
              
              CASE 
                WHEN raw_created_at IS NOT NULL AND raw_created_at != '' 
                THEN TRY_STRPTIME(raw_created_at, '%d-%m-%Y %H:%M:%S')
                ELSE NULL
              END as created_at,
              
              CASE 
                WHEN raw_created_at IS NOT NULL AND raw_created_at != '' AND TRY_STRPTIME(raw_created_at, '%d-%m-%Y %H:%M:%S') IS NOT NULL
                THEN STRFTIME(TRY_STRPTIME(raw_created_at, '%d-%m-%Y %H:%M:%S'), '%Y-%m-%d')
                ELSE 'Unknown'
              END as create_date,

              CASE 
                WHEN raw_resolved_at IS NOT NULL AND raw_resolved_at != '' 
                THEN TRY_STRPTIME(raw_resolved_at, '%d-%m-%Y %H:%M:%S')
                ELSE NULL
              END as resolved_at,

              CASE 
                WHEN raw_res_time IS NOT NULL AND raw_res_time != '' AND TRY_CAST(raw_res_time AS INT) IS NOT NULL
                  THEN TRY_CAST(raw_res_time AS INT)
                WHEN raw_resolved_at IS NOT NULL AND raw_resolved_at != '' AND raw_created_at IS NOT NULL AND raw_created_at != ''
                     AND TRY_STRPTIME(raw_created_at, '%d-%m-%Y %H:%M:%S') IS NOT NULL AND TRY_STRPTIME(raw_resolved_at, '%d-%m-%Y %H:%M:%S') IS NOT NULL
                  THEN GREATEST(0, date_diff('day', TRY_STRPTIME(raw_created_at, '%d-%m-%Y %H:%M:%S'), TRY_STRPTIME(raw_resolved_at, '%d-%m-%Y %H:%M:%S')))
                WHEN raw_created_at IS NOT NULL AND raw_created_at != '' AND TRY_STRPTIME(raw_created_at, '%d-%m-%Y %H:%M:%S') IS NOT NULL
                  THEN GREATEST(0, date_diff('day', TRY_STRPTIME(raw_created_at, '%d-%m-%Y %H:%M:%S'), CURRENT_DATE))
                ELSE 0
              END as aging_days,

              msn,
              complaint_type,
              complaint_description,
              detail_remark,
              priority,
              main_remarks,
              sub_remarks,
              agency,
              technician,
              source
            FROM deduped
            WHERE rn = 1
          )
          SELECT 
            c.*,
            CASE 
              WHEN c.aging_days <= 2 THEN '<= 2 Days'
              WHEN c.aging_days <= 7 THEN '3 - 7 Days'
              WHEN c.aging_days <= 15 THEN '8 - 15 Days'
              WHEN c.aging_days <= 30 THEN '16 - 30 Days'
              ELSE '> 30 Days'
            END as aging_bucket,

            -- Consumer Repeat & Chronic Intelligence
            COUNT(*) OVER (PARTITION BY NULLIF(c.consumer_id, '')) as consumer_total_tickets,
            SUM(c.is_open) OVER (PARTITION BY NULLIF(c.consumer_id, '')) as consumer_open_tickets,
            CASE WHEN (COUNT(*) OVER (PARTITION BY NULLIF(c.consumer_id, ''))) > 1 THEN 1 ELSE 0 END as is_repeat_consumer,
            CASE 
              WHEN (COUNT(*) OVER (PARTITION BY NULLIF(c.consumer_id, ''))) = 1 THEN '1 Ticket (Single)'
              WHEN (COUNT(*) OVER (PARTITION BY NULLIF(c.consumer_id, ''))) = 2 THEN '2 Tickets (Repeat)'
              WHEN (COUNT(*) OVER (PARTITION BY NULLIF(c.consumer_id, ''))) BETWEEN 3 AND 4 THEN '3 - 4 Tickets (Chronic)'
              WHEN (COUNT(*) OVER (PARTITION BY NULLIF(c.consumer_id, ''))) >= 5 THEN '>= 5 Tickets (Severe Chronic)'
              ELSE '1 Ticket'
            END as repeat_bucket,
            CASE 
              WHEN (SUM(c.is_open) OVER (PARTITION BY NULLIF(c.consumer_id, ''))) = 0 THEN '0 Open Tickets'
              WHEN (SUM(c.is_open) OVER (PARTITION BY NULLIF(c.consumer_id, ''))) = 1 THEN '1 Open Ticket'
              WHEN (SUM(c.is_open) OVER (PARTITION BY NULLIF(c.consumer_id, ''))) = 2 THEN '2 Open Tickets'
              WHEN (SUM(c.is_open) OVER (PARTITION BY NULLIF(c.consumer_id, ''))) >= 3 THEN '>= 3 Open Tickets'
              ELSE '0 Open Tickets'
            END as open_ticket_bucket
          FROM cleaned c;
        `);
        console.log('complaint_analytics created successfully with full repeat intelligence.');
      } else {
        console.log('Skipping Complaint rebuild (CSVs not present).');
      }
    }

    console.log(`\nPipeline completed successfully in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    return { success: true };
  } finally {
    try { con.close(); } catch (e) {}
    try { db.close(); } catch (e) {}

    if (typeof versionedFileName !== 'undefined' && fs.existsSync(targetDbPath)) {
      try {
        fs.writeFileSync(activeCfgPath, JSON.stringify({
          activeDb: versionedFileName,
          updatedAt: new Date().toISOString()
        }, null, 2), 'utf8');
        console.log(`Updated active database pointer: ${versionedFileName}`);
      } catch (e) {
        console.error('Error writing active_db.json:', e);
      }

      try {
        fs.copyFileSync(targetDbPath, path.join(dataDir, 'sbpdcl_analytics.duckdb'));
      } catch (e) {
        // Non-blocking if locked by another reader process
      }
    }
  }
}

if (require.main === module) {
  const target = process.argv[2] || 'all';
  buildDatabase({ target })
    .then(() => console.log('buildDatabase finished.'))
    .catch(e => console.error('buildDatabase failed:', e));
}

module.exports = { buildDatabase };
