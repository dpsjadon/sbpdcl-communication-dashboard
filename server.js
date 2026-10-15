const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const duckdb = require('duckdb');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8098;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dataDir = path.join(__dirname, 'data');
const downloadDir = path.join(__dirname, 'downloads');
const dbPath = path.join(dataDir, 'sbpdcl_analytics.duckdb');
const cachePath = path.join(dataDir, 'precomputed_analytics.json');

function getActiveDbPath() {
  const activeCfgPath = path.join(dataDir, 'active_db.json');
  if (fs.existsSync(activeCfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(activeCfgPath, 'utf8'));
      if (cfg.activeDb) {
        const fullPath = path.join(dataDir, cfg.activeDb);
        if (fs.existsSync(fullPath)) return fullPath;
      }
    } catch (e) {}
  }
  return dbPath;
}

// Auto-initialize DuckDB from compressed seed on cloud environments (e.g. Render.com)
function ensureDatabase() {
  const targetPath = getActiveDbPath();
  if (!fs.existsSync(targetPath)) {
    const gzPath = path.join(dataDir, 'sbpdcl_analytics.duckdb.gz');
    if (fs.existsSync(gzPath)) {
      console.log(`[Cloud Init] Decompressing seed database ${gzPath} to ${dbPath}...`);
      const zlib = require('zlib');
      const compressed = fs.readFileSync(gzPath);
      const decompressed = zlib.gunzipSync(compressed);
      fs.writeFileSync(dbPath, decompressed);
      console.log(`[Cloud Init] Database decompressed successfully (${(decompressed.length / 1024 / 1024).toFixed(2)} MB).`);
    }
  }
}
ensureDatabase();

let db = null;
let con = null;
let currentConnectedPath = null;
let isDbLocked = false;
let idleTimer = null;

function touchDbActivity() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    closeDbConnection();
  }, 30000);
}

function getDbConnection() {
  return new Promise((resolve, reject) => {
    if (isDbLocked) {
      return reject(new Error('Database is updating from MDMS. Please try again in a few moments.'));
    }
    const targetPath = getActiveDbPath();
    if (con && currentConnectedPath === targetPath) return resolve(con);
    if (!fs.existsSync(targetPath)) return reject(new Error('Database not initialized'));

    closeDbConnection();

    db = new duckdb.Database(targetPath, duckdb.OPEN_READONLY, (err) => {
      if (err) {
        db = null;
        con = null;
        currentConnectedPath = null;
        return reject(err);
      }
      con = db.connect();
      currentConnectedPath = targetPath;
      
      // Initialize in-memory latest complaints table if complaint_analytics exists
      con.run(`
        CREATE TEMP TABLE IF NOT EXISTS temp_latest_complaint AS
        WITH ranked AS (
          SELECT 
            msn,
            ticket_no,
            ticket_status,
            status_group,
            main_remarks,
            sub_remarks,
            detail_remark,
            aging_days,
            aging_bucket,
            create_date,
            created_at,
            resolved_at,
            ROW_NUMBER() OVER (PARTITION BY msn ORDER BY created_at DESC NULLS LAST, ticket_no DESC) as rn
          FROM complaint_analytics
          WHERE msn IS NOT NULL AND msn != ''
        )
        SELECT * FROM ranked WHERE rn = 1;
      `, () => {
        resolve(con);
      });
    });
  });
}

function closeDbConnection() {
  clearTimeout(idleTimer);
  currentConnectedPath = null;
  if (con) {
    try { con.close(); } catch (e) {}
    con = null;
  }
  if (db) {
    try { db.close(); } catch (e) {}
    db = null;
  }
}

// Helper for DuckDB query
async function queryDuck(sql) {
  const connection = await getDbConnection();
  touchDbActivity();
  return new Promise((resolve, reject) => {
    connection.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => {
        const obj = {};
        for (let k in r) {
          obj[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k];
        }
        return obj;
      }));
    });
  });
}

function getTableName(category) {
  if (category === 'dt') return 'dt_meter_analytics';
  if (category === 'feeder') return 'feeder_meter_analytics';
  if (category === 'complaint' || category === 'onm') return 'complaint_analytics';
  return 'smart_meter_analytics';
}

function buildWhereClause(query) {
  const {
    category = 'consumer',
    voltage = 'ALL',
    circle = 'ALL',
    division = 'ALL',
    section = 'ALL',
    phase = 'ALL',
    make = 'ALL',
    communication = 'ALL',
    status = 'ALL',
    aging_bucket = 'ALL',
    dtr_rating = 'ALL',
    feeder_type = 'ALL',
    main_remarks = 'ALL',
    sub_remarks = 'ALL',
    ticket_status = 'ALL',
    date_from = 'ALL',
    date_to = 'ALL',
    search = ''
  } = query;

  const conditions = ['1=1'];

  // Circle / Division / Section hierarchy
  if (circle && circle !== 'ALL') {
    conditions.push(`circle = '${circle.toUpperCase().replace(/'/g, "''")}'`);
  }
  if (division && division !== 'ALL') {
    conditions.push(`division = '${division.toUpperCase().replace(/'/g, "''")}'`);
  }
  if (section && section !== 'ALL') {
    conditions.push(`section = '${section.toUpperCase().replace(/'/g, "''")}'`);
  }

  // Complaint specific filters
  if (category === 'complaint' || category === 'onm') {
    if (main_remarks && main_remarks !== 'ALL') {
      conditions.push(`main_remarks = '${main_remarks.replace(/'/g, "''")}'`);
    }
    if (sub_remarks && sub_remarks !== 'ALL') {
      conditions.push(`sub_remarks = '${sub_remarks.replace(/'/g, "''")}'`);
    }
    if (ticket_status && ticket_status !== 'ALL') {
      conditions.push(`ticket_status = '${ticket_status.replace(/'/g, "''")}'`);
    }
    if (status && status !== 'ALL' && status !== 'ALL_METERS') {
      if (status === 'OPEN' || status === 'PENDING') {
        conditions.push('is_open = 1');
      } else if (status === 'CLOSED' || status === 'RESOLVED') {
        conditions.push('is_closed = 1');
      } else if (status === 'IN_PROGRESS' || status === 'ATTENDED') {
        conditions.push("ticket_status = 'Attended'");
      } else if (status === 'NOTIFY_DISCOM') {
        conditions.push("ticket_status = 'Notify to Discom'");
      } else {
        conditions.push(`ticket_status = '${status.replace(/'/g, "''")}'`);
      }
    }
    if (aging_bucket && aging_bucket !== 'ALL') {
      conditions.push(`aging_bucket = '${aging_bucket.replace(/'/g, "''")}'`);
    }
    if (date_from && date_from !== 'ALL') {
      conditions.push(`create_date >= '${date_from.replace(/'/g, "''")}'`);
    }
    if (date_to && date_to !== 'ALL') {
      conditions.push(`create_date <= '${date_to.replace(/'/g, "''")}'`);
    }
    if (search) {
      const s = search.trim().toUpperCase().replace(/'/g, "''");
      conditions.push(`(
        ticket_no LIKE '%${s}%' OR 
        consumer_id LIKE '%${s}%' OR 
        consumer_name LIKE '%${s}%' OR 
        msn LIKE '%${s}%' OR 
        feeder LIKE '%${s}%' OR 
        dtr LIKE '%${s}%' OR 
        sub_station LIKE '%${s}%' OR 
        main_remarks LIKE '%${s}%' OR 
        sub_remarks LIKE '%${s}%'
      )`);
    }
    return conditions.join(' AND ');
  }

  // Meter Categories: Feeder Voltage Filter (11 KV vs 33 KV)
  if (category === 'feeder' && voltage && voltage !== 'ALL') {
    if (voltage.includes('33')) {
      conditions.push("voltage_level = '33 KV'");
    } else if (voltage.includes('11')) {
      conditions.push("voltage_level = '11 KV'");
    }
  }

  if (make && make !== 'ALL') {
    conditions.push(`make = '${make.toUpperCase().replace(/'/g, "''")}'`);
  }

  // Consumer specific filters
  if (category === 'consumer') {
    if (phase && phase !== 'ALL') {
      if (phase.includes('3')) conditions.push(`phase = '3 PH'`);
      else if (phase.includes('1')) conditions.push(`phase = '1 PH'`);
      else conditions.push(`phase = '${phase.replace(/'/g, "''")}'`);
    }
    if (communication && communication !== 'ALL') {
      conditions.push(`communication_type = '${communication.toUpperCase().replace(/'/g, "''")}'`);
    }
    const ticketStatusFilter = query.ticket_status_filter || query.ticket_filter;
    if (ticketStatusFilter && ticketStatusFilter !== 'ALL') {
      if (ticketStatusFilter === 'RAISED') {
        conditions.push('c.ticket_no IS NOT NULL');
      } else if (ticketStatusFilter === 'NOT_RAISED' || ticketStatusFilter === 'NO_TICKET') {
        conditions.push('c.ticket_no IS NULL');
      } else if (ticketStatusFilter === 'PENDING') {
        conditions.push("c.ticket_status = 'Pending'");
      } else if (ticketStatusFilter === 'NOTIFY_DISCOM') {
        conditions.push("c.ticket_status = 'Notify to Discom'");
      } else if (ticketStatusFilter === 'ATTENDED') {
        conditions.push("c.ticket_status = 'Attended'");
      } else if (ticketStatusFilter === 'CLOSED') {
        conditions.push("c.ticket_status = 'Closed'");
      } else if (ticketStatusFilter === 'MR_REQUIRED') {
        conditions.push("c.ticket_status = 'MR Required'");
      }
    }
  }

  // DT specific filters
  if (category === 'dt') {
    if (dtr_rating && dtr_rating !== 'ALL') {
      conditions.push(`dtr_rating = '${dtr_rating.replace(/'/g, "''")}'`);
    }

    const inactiveFilter = query.inactive || query.exclude_inactive;
    if (inactiveFilter === 'include' || inactiveFilter === 'all' || inactiveFilter === 'false') {
      // Include all (both active and inactive)
    } else if (inactiveFilter === 'only' || inactiveFilter === 'inactive_only') {
      conditions.push('is_inactive = 1');
    } else {
      // Default: Exclude inactive DTRs (Active Only)
      conditions.push('is_inactive = 0');
    }
  }

  // Feeder specific filters
  if (category === 'feeder') {
    if (feeder_type && feeder_type !== 'ALL') {
      conditions.push(`feeder_type = '${feeder_type.replace(/'/g, "''")}'`);
    }

    const inactiveFilter = query.inactive || query.exclude_inactive;
    if (inactiveFilter === 'include' || inactiveFilter === 'all' || inactiveFilter === 'false') {
      // Include all (both active and inactive)
    } else if (inactiveFilter === 'only' || inactiveFilter === 'inactive_only') {
      conditions.push('is_inactive = 1');
    } else {
      // Default: Exclude inactive feeders (Active Only)
      conditions.push('is_inactive = 0');
    }
  }

  // Common Status filter
  if (status && status !== 'ALL' && status !== 'ALL_METERS') {
    if (status === 'ALL_NON_COMM') {
      conditions.push('is_non_comm = 1');
    } else if (status === '3-7D') {
      conditions.push("comm_category = 'Non-Comm (4-7D)'");
    } else if (status === '>7D') {
      conditions.push("comm_category = 'Non-Comm (>7D)'");
    } else if (status === 'COMM_LTE_3D') {
      conditions.push('is_non_comm = 0');
    } else if (status === 'NEVER') {
      conditions.push('is_never_comm = 1');
    }
  }

  // Aging Bucket filter
  if (aging_bucket && aging_bucket !== 'ALL') {
    conditions.push(`aging_bucket = '${aging_bucket.replace(/'/g, "''")}'`);
  }

  // Search filter
  if (search) {
    const s = search.trim().toUpperCase().replace(/'/g, "''");
    if (category === 'dt') {
      conditions.push(`(
        msn LIKE '%${s}%' OR 
        dtr_code LIKE '%${s}%' OR 
        dtr_name LIKE '%${s}%' OR 
        feeder LIKE '%${s}%' OR 
        sub_station LIKE '%${s}%'
      )`);
    } else if (category === 'feeder') {
      conditions.push(`(
        msn LIKE '%${s}%' OR 
        feeder_code LIKE '%${s}%' OR 
        feeder_name LIKE '%${s}%' OR 
        substation_name LIKE '%${s}%'
      )`);
    } else {
      conditions.push(`(
        msn LIKE '%${s}%' OR 
        consumer_id LIKE '%${s}%' OR 
        name LIKE '%${s}%' OR 
        feeder LIKE '%${s}%' OR 
        dt_name LIKE '%${s}%'
      )`);
    }
  }

  return conditions.join(' AND ');
}

// 1. Report Status API (Scans disk and returns download/update status of all reports)
app.get('/api/reports/status', (req, res) => {
  try {
    const formatBytes = (bytes) => {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (mtimeMs) => {
      if (!mtimeMs) return 'Not available';
      const d = new Date(mtimeMs);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + 
        ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const getFileInfo = (pattern) => {
      let found = [];
      if (fs.existsSync(dataDir)) {
        const dFiles = fs.readdirSync(dataDir).filter(f => f.toLowerCase().includes(pattern.toLowerCase()));
        for (const f of dFiles) {
          const st = fs.statSync(path.join(dataDir, f));
          found.push({ name: f, path: path.join(dataDir, f), size: st.size, mtime: st.mtimeMs });
        }
      }
      if (fs.existsSync(downloadDir)) {
        const dlFiles = fs.readdirSync(downloadDir).filter(f => f.toLowerCase().includes(pattern.toLowerCase()));
        for (const f of dlFiles) {
          const st = fs.statSync(path.join(downloadDir, f));
          found.push({ name: f, path: path.join(downloadDir, f), size: st.size, mtime: st.mtimeMs });
        }
      }

      if (found.length === 0) {
        return { exists: false, status: 'Not Downloaded', lastUpdated: 'Never', sizeFormatted: '0 MB', rawSize: 0 };
      }

      found.sort((a, b) => b.mtime - a.mtime);
      const top = found[0];
      return {
        exists: true,
        status: 'Downloaded',
        filename: top.name,
        lastUpdated: formatDate(top.mtime),
        sizeFormatted: formatBytes(top.size),
        rawSize: top.size
      };
    };

    const reports = {
      consumer: {
        title: "Consumer Meters",
        category: "consumer",
        items: [
          {
            id: "consumer_master",
            name: "Prepaid Total Consumers (Master)",
            source: "MDMS Main Dashboard (lblTC)",
            ...getFileInfo("Prepaid Total Consumers")
          },
          {
            id: "consumer_last_comm",
            name: "Last Communication Information (Cyan & Airtel)",
            source: "ConsumerReport?pn=2 (Report 10)",
            ...getFileInfo("Last Communication")
          }
        ]
      },
      dt: {
        title: "Distribution Transformer (DT) Meters",
        category: "dt",
        items: [
          {
            id: "dt_master",
            name: "DT Meter Master",
            source: "/MIS/DTRReport?pn=1 (Report 1)",
            ...getFileInfo("DTR Master Information")
          },
          {
            id: "dt_non_comm",
            name: "DT Non Communicating Report",
            source: "/MIS/DTRReport?pn=2 (Report 11)",
            ...getFileInfo("DTR Non Communicating")
          },
          {
            id: "dt_never_comm",
            name: "DT Never Communicating Report",
            source: "/MIS/DTRReport?pn=2 (Report 12)",
            ...getFileInfo("DTR Never Communicating")
          }
        ]
      },
      feeder: {
        title: "Feeder Meters (11kV & 33kV)",
        category: "feeder",
        items: [
          {
            id: "feeder_master",
            name: "Feeder Meter Master",
            source: "/MIS/FeederReport?pn=1 (Report 1)",
            ...getFileInfo("Feeder Master Information")
          },
          {
            id: "feeder_non_comm",
            name: "Feeder Non Communicating Report",
            source: "/MIS/FeederReport?pn=2 (Report 11)",
            ...getFileInfo("Feeder Non Communicating")
          },
          {
            id: "feeder_never_comm",
            name: "Feeder Never Communicating Report",
            source: "/MIS/FeederReport?pn=2 (Report 12)",
            ...getFileInfo("Feeder Never Communica")
          }
        ]
      },
      complaint: {
        title: "O&M Complaint & Tickets",
        category: "complaint",
        items: [
          {
            id: "complaint_report",
            name: "OnM Complaint Report",
            source: "/MDMS/Complaint/Reports/ComplaintReport",
            ...getFileInfo("Complaint")
          }
        ]
      }
    };

    let totalCount = 0;
    let downloadedCount = 0;
    Object.values(reports).forEach(cat => {
      cat.items.forEach(item => {
        totalCount++;
        if (item.exists) downloadedCount++;
      });
    });

    res.json({
      success: true,
      totalCount,
      downloadedCount,
      checkedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
      reports
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Filter Options API
app.get('/api/filters', async (req, res) => {
  try {
    const { category = 'consumer' } = req.query;
    const table = getTableName(category);

    const [circles, makes] = await Promise.all([
      queryDuck(`SELECT DISTINCT circle FROM ${table} WHERE circle IS NOT NULL AND circle != '' ORDER BY 1`),
      queryDuck(`SELECT DISTINCT make FROM ${table} WHERE make IS NOT NULL AND make != '' ORDER BY 1`)
    ]);

    let extra = {};
    if (category === 'consumer') {
      const phases = await queryDuck(`SELECT DISTINCT phase FROM ${table} WHERE phase IS NOT NULL AND phase != '' ORDER BY 1`);
      extra.phases = phases.map(p => p.phase);
    } else if (category === 'dt') {
      const ratings = await queryDuck(`SELECT DISTINCT dtr_rating FROM ${table} WHERE dtr_rating IS NOT NULL AND dtr_rating != '' ORDER BY TRY_CAST(dtr_rating AS INT) ASC`);
      extra.dtr_ratings = ratings.map(r => r.dtr_rating);
    } else if (category === 'feeder') {
      const voltages = await queryDuck(`SELECT DISTINCT voltage_level FROM ${table} WHERE voltage_level IS NOT NULL AND voltage_level != '' ORDER BY 1`);
      const types = await queryDuck(`SELECT DISTINCT feeder_type FROM ${table} WHERE feeder_type IS NOT NULL AND feeder_type != '' ORDER BY 1`);
      extra.voltages = voltages.map(v => v.voltage_level);
      extra.feeder_types = types.map(t => t.feeder_type);
    } else if (category === 'complaint' || category === 'onm') {
      const [mainRems, statuses, dates] = await Promise.all([
        queryDuck(`SELECT DISTINCT main_remarks FROM ${table} WHERE main_remarks IS NOT NULL AND main_remarks != '' ORDER BY 1`),
        queryDuck(`SELECT DISTINCT ticket_status FROM ${table} WHERE ticket_status IS NOT NULL AND ticket_status != '' ORDER BY 1`),
        queryDuck(`SELECT min(create_date) as min_d, max(create_date) as max_d FROM ${table} WHERE create_date != 'Unknown'`)
      ]);
      extra.main_remarks = mainRems.map(m => m.main_remarks);
      extra.statuses = statuses.map(s => s.ticket_status);
      extra.date_range = dates[0] || {};
      extra.aging_buckets = ['<= 2 Days', '3 - 7 Days', '8 - 15 Days', '16 - 30 Days', '> 30 Days'];
    }

    res.json({
      success: true,
      category,
      circles: circles.map(c => c.circle),
      makes: makes.map(m => m.make),
      ...extra
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Dynamic Slicing & Filtered Analytics API
app.get('/api/analytics/filtered', async (req, res) => {
  try {
    const category = req.query.category || 'consumer';
    const table = getTableName(category);
    const whereClause = buildWhereClause(req.query);

    // Dynamic queries depending on category
    if (category === 'complaint' || category === 'onm') {
      const [kpiRows, circles, divisions, sections, mainRemarks, subRemarks, dateTrend, agingRaw, statusRows] = await Promise.all([
        queryDuck(`
          SELECT 
            count(*) as total_installed,
            count(*) as total_tickets,
            count(*) FILTER (WHERE is_closed = 1) as total_communicating,
            count(*) FILTER (WHERE is_closed = 1) as closed_tickets,
            count(*) FILTER (WHERE is_open = 1) as total_non_comm,
            count(*) FILTER (WHERE is_open = 1) as open_tickets,
            count(*) FILTER (WHERE ticket_status = 'Pending') as pending_tickets,
            count(*) FILTER (WHERE ticket_status = 'Notify to Discom') as notify_discom_tickets,
            count(*) FILTER (WHERE ticket_status = 'Attended') as attended_tickets,
            count(*) FILTER (WHERE ticket_status = 'MR Required') as mr_required_tickets,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as comm_percentage,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as resolution_pct,
            ROUND(count(*) FILTER (WHERE is_open = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_percentage,
            ROUND(avg(aging_days), 1) as avg_aging_days,
            ROUND(avg(aging_days) FILTER (WHERE is_closed = 1), 1) as avg_resolution_time,
            ROUND(avg(aging_days) FILTER (WHERE is_open = 1), 1) as avg_open_aging,
            count(*) FILTER (WHERE create_date = (SELECT max(create_date) FROM ${table})) as today_tickets,
            count(*) FILTER (WHERE aging_bucket = '<= 2 Days') as age_lte_2d,
            count(*) FILTER (WHERE aging_bucket = '3 - 7 Days') as age_3_7d,
            count(*) FILTER (WHERE aging_bucket = '8 - 15 Days') as age_8_15d,
            count(*) FILTER (WHERE aging_bucket = '16 - 30 Days') as age_16_30d,
            count(*) FILTER (WHERE aging_bucket = '> 30 Days') as age_gt_30d,
            0 as non_comm_4_7d,
            0 as non_comm_gt_7d,
            0 as never_communicated
          FROM ${table}
          WHERE ${whereClause}
        `),
        queryDuck(`
          SELECT 
            circle,
            count(*) as total_installed,
            count(*) as total_tickets,
            count(*) FILTER (WHERE is_closed = 1) as communicating,
            count(*) FILTER (WHERE is_closed = 1) as closed_tickets,
            count(*) FILTER (WHERE is_open = 1) as total_non_comm,
            count(*) FILTER (WHERE is_open = 1) as open_tickets,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as resolution_pct,
            ROUND(count(*) FILTER (WHERE is_open = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
            ROUND(avg(aging_days), 1) as avg_ageing,
            count(*) FILTER (WHERE aging_bucket = '<= 2 Days') as age_lte_2d,
            count(*) FILTER (WHERE aging_bucket = '3 - 7 Days') as age_3_7d,
            count(*) FILTER (WHERE aging_bucket = '8 - 15 Days') as age_8_15d,
            count(*) FILTER (WHERE aging_bucket = '16 - 30 Days') as age_16_30d,
            count(*) FILTER (WHERE aging_bucket = '> 30 Days') as age_gt_30d
          FROM ${table}
          WHERE ${whereClause} AND circle IS NOT NULL AND circle != ''
          GROUP BY circle
          ORDER BY total_tickets DESC
        `),
        queryDuck(`
          SELECT 
            circle, division,
            count(*) as total_installed,
            count(*) as total_tickets,
            count(*) FILTER (WHERE is_closed = 1) as communicating,
            count(*) FILTER (WHERE is_closed = 1) as closed_tickets,
            count(*) FILTER (WHERE is_open = 1) as total_non_comm,
            count(*) FILTER (WHERE is_open = 1) as open_tickets,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as resolution_pct,
            ROUND(count(*) FILTER (WHERE is_open = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
            ROUND(avg(aging_days), 1) as avg_ageing,
            count(*) FILTER (WHERE aging_bucket = '<= 2 Days') as age_lte_2d,
            count(*) FILTER (WHERE aging_bucket = '3 - 7 Days') as age_3_7d,
            count(*) FILTER (WHERE aging_bucket = '8 - 15 Days') as age_8_15d,
            count(*) FILTER (WHERE aging_bucket = '16 - 30 Days') as age_16_30d,
            count(*) FILTER (WHERE aging_bucket = '> 30 Days') as age_gt_30d
          FROM ${table}
          WHERE ${whereClause} AND division IS NOT NULL AND division != ''
          GROUP BY circle, division
          ORDER BY total_tickets DESC
        `),
        queryDuck(`
          SELECT 
            circle, division, section,
            count(*) as total_installed,
            count(*) as total_tickets,
            count(*) FILTER (WHERE is_closed = 1) as communicating,
            count(*) FILTER (WHERE is_closed = 1) as closed_tickets,
            count(*) FILTER (WHERE is_open = 1) as total_non_comm,
            count(*) FILTER (WHERE is_open = 1) as open_tickets,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as resolution_pct,
            ROUND(count(*) FILTER (WHERE is_open = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
            ROUND(avg(aging_days), 1) as avg_ageing
          FROM ${table}
          WHERE ${whereClause} AND section IS NOT NULL AND section != ''
          GROUP BY circle, division, section
          ORDER BY total_tickets DESC
          LIMIT 300
        `),
        queryDuck(`
          SELECT 
            main_remarks as make,
            main_remarks as dimension_name,
            main_remarks,
            count(*) as total_installed,
            count(*) as total_tickets,
            count(*) FILTER (WHERE is_closed = 1) as communicating,
            count(*) FILTER (WHERE is_closed = 1) as closed_tickets,
            count(*) FILTER (WHERE is_open = 1) as total_non_comm,
            count(*) FILTER (WHERE is_open = 1) as open_tickets,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as resolution_pct,
            ROUND(count(*) FILTER (WHERE is_open = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
            ROUND(avg(aging_days), 1) as avg_ageing
          FROM ${table}
          WHERE ${whereClause}
          GROUP BY main_remarks
          ORDER BY total_tickets DESC
        `),
        queryDuck(`
          SELECT 
            main_remarks as hes_source,
            sub_remarks as communication_type,
            main_remarks,
            sub_remarks,
            count(*) as total_installed,
            count(*) as total_tickets,
            count(*) FILTER (WHERE is_closed = 1) as communicating,
            count(*) FILTER (WHERE is_closed = 1) as closed_tickets,
            count(*) FILTER (WHERE is_open = 1) as total_non_comm,
            count(*) FILTER (WHERE is_open = 1) as open_tickets,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as resolution_pct,
            ROUND(count(*) FILTER (WHERE is_open = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
            ROUND(avg(aging_days), 1) as avg_ageing
          FROM ${table}
          WHERE ${whereClause}
          GROUP BY main_remarks, sub_remarks
          ORDER BY total_tickets DESC
          LIMIT 35
        `),
        queryDuck(`
          SELECT 
            create_date as day,
            count(*) as total_tickets,
            count(*) FILTER (WHERE is_closed = 1) as closed_tickets,
            count(*) FILTER (WHERE is_open = 1) as open_tickets,
            ROUND(count(*) FILTER (WHERE is_closed = 1) * 100.0 / NULLIF(count(*), 0), 2) as resolution_pct
          FROM ${table}
          WHERE ${whereClause} AND create_date != 'Unknown'
          GROUP BY create_date
          ORDER BY create_date ASC
        `),
        queryDuck(`
          SELECT 
            aging_bucket as bucket,
            count(*) as total_count,
            count(*) FILTER (WHERE is_open = 1) as open_count,
            count(*) FILTER (WHERE is_closed = 1) as closed_count
          FROM ${table}
          WHERE ${whereClause}
          GROUP BY aging_bucket
        `),
        queryDuck(`
          SELECT 
            ticket_status as status,
            count(*) as total_count,
            ROUND(count(*) * 100.0 / NULLIF((SELECT count(*) FROM ${table} WHERE ${whereClause}), 0), 2) as pct
          FROM ${table}
          WHERE ${whereClause}
          GROUP BY ticket_status
          ORDER BY total_count DESC
        `)
      ]);

      const agingOrderMap = {
        '<= 2 Days': 1,
        '3 - 7 Days': 2,
        '8 - 15 Days': 3,
        '16 - 30 Days': 4,
        '> 30 Days': 5
      };
      const aging = agingRaw.sort((a, b) => (agingOrderMap[a.bucket] || 99) - (agingOrderMap[b.bucket] || 99));
      const kpi = kpiRows[0] || {};

      return res.json({
        success: true,
        category,
        isFiltered: true,
        kpi,
        overview: kpi,
        kpis: kpi,
        circles,
        divisions,
        sections,
        dimensions: mainRemarks,
        phases: mainRemarks,
        phase: mainRemarks,
        makes: mainRemarks,
        make: mainRemarks,
        main_remarks: mainRemarks,
        technology: subRemarks,
        communication: subRemarks,
        sub_remarks: subRemarks,
        date_trend: dateTrend,
        aging,
        aging_buckets: aging,
        statuses: statusRows
      });
    }

    let kpiSql = '';
    let dimSql = '';
    let techSql = '';

    if (category === 'consumer') {
      kpiSql = `
        SELECT 
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as total_communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE duration_days BETWEEN 4 AND 7) as non_comm_4_7d,
          count(*) FILTER (WHERE duration_days > 7 OR duration_days IS NULL) as non_comm_gt_7d,
          count(*) FILTER (WHERE is_never_comm = 1) as never_communicated,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_percentage,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_percentage,
          count(*) FILTER (WHERE is_non_comm = 1 AND department = 'HES-Airtel') as non_comm_airtel,
          count(*) FILTER (WHERE is_non_comm = 1 AND department = 'HES-Cyan') as non_comm_cyan
        FROM ${table}
        WHERE ${whereClause}
      `;
      dimSql = `
        SELECT 
          phase,
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE duration_days BETWEEN 4 AND 7) as non_comm_4_7d,
          count(*) FILTER (WHERE duration_days > 7 OR duration_days IS NULL) as non_comm_gt_7d,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct
        FROM ${table}
        WHERE ${whereClause}
        GROUP BY phase
        ORDER BY phase ASC
      `;
      techSql = `
        SELECT 
          department as hes_source,
          communication_type,
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE duration_days BETWEEN 4 AND 7) as non_comm_4_7d,
          count(*) FILTER (WHERE duration_days > 7 OR duration_days IS NULL) as non_comm_gt_7d,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
          ROUND(avg(COALESCE(duration_days, 60)) FILTER (WHERE is_non_comm = 1), 1) as avg_ageing
        FROM ${table}
        WHERE ${whereClause}
        GROUP BY department, communication_type
        ORDER BY total_installed DESC
      `;
    } else if (category === 'dt') {
      kpiSql = `
        SELECT 
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as total_communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_4_7d,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
          count(*) FILTER (WHERE is_never_comm = 1) as never_communicated,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_percentage,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_percentage,
          0 as non_comm_airtel,
          0 as non_comm_cyan
        FROM ${table}
        WHERE ${whereClause}
      `;
      dimSql = `
        SELECT 
          COALESCE(dtr_rating, 'Other') as dimension_name,
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_4_7d,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct
        FROM ${table}
        WHERE ${whereClause}
        GROUP BY dtr_rating
        ORDER BY total_installed DESC
        LIMIT 15
      `;
      techSql = `
        SELECT 
          COALESCE(dtr_type, 'General') as hes_source,
          COALESCE(modem_installation, 'Yes') as communication_type,
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_4_7d,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
          ROUND(avg(COALESCE(duration_days, 60)) FILTER (WHERE is_non_comm = 1), 1) as avg_ageing
        FROM ${table}
        WHERE ${whereClause}
        GROUP BY dtr_type, modem_installation
        ORDER BY total_installed DESC
      `;
    } else if (category === 'feeder') {
      kpiSql = `
        SELECT 
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as total_communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_4_7d,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
          count(*) FILTER (WHERE is_never_comm = 1) as never_communicated,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_percentage,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_percentage,
          count(*) FILTER (WHERE voltage_level = '11 KV' AND is_non_comm = 1) as non_comm_11kv,
          count(*) FILTER (WHERE voltage_level = '33 KV' AND is_non_comm = 1) as non_comm_33kv
        FROM ${table}
        WHERE ${whereClause}
      `;
      dimSql = `
        SELECT 
          voltage_level as dimension_name,
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_4_7d,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct
        FROM ${table}
        WHERE ${whereClause}
        GROUP BY voltage_level
        ORDER BY voltage_level ASC
      `;
      techSql = `
        SELECT 
          voltage_level as hes_source,
          COALESCE(feeder_type, 'Standard') as communication_type,
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_4_7d,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
          ROUND(avg(COALESCE(duration_days, 60)) FILTER (WHERE is_non_comm = 1), 1) as avg_ageing
        FROM ${table}
        WHERE ${whereClause}
        GROUP BY voltage_level, feeder_type
        ORDER BY total_installed DESC
      `;
    }

    // Parallel multi-dimensional aggregation in DuckDB
    const [kpiRows, circles, divisions, sections, dims, makes, technology, agingRaw] = await Promise.all([
      // A. KPI Cards
      queryDuck(kpiSql),

      // B. Circle Table
      queryDuck(`
        SELECT 
          circle,
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_4_7d,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
          count(*) FILTER (WHERE is_never_comm = 1) as never_communicated
        FROM ${table}
        WHERE ${whereClause} AND circle IS NOT NULL AND circle != ''
        GROUP BY circle
        ORDER BY total_non_comm DESC
      `),

      // C. Division Table
      queryDuck(`
        SELECT 
          circle, division,
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_4_7d,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
          count(*) FILTER (WHERE is_never_comm = 1) as never_communicated
        FROM ${table}
        WHERE ${whereClause} AND division IS NOT NULL AND division != ''
        GROUP BY circle, division
        ORDER BY total_non_comm DESC
      `),

      // D. Section Table
      queryDuck(`
        SELECT 
          circle, division, section,
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_4_7d,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
          count(*) FILTER (WHERE is_never_comm = 1) as never_communicated
        FROM ${table}
        WHERE ${whereClause} AND section IS NOT NULL AND section != ''
        GROUP BY circle, division, section
        ORDER BY total_non_comm DESC
        LIMIT 250
      `),

      // E. Dimensions (Phase for Consumer, Rating for DT, Voltage for Feeder)
      queryDuck(dimSql),

      // F. Make Table
      queryDuck(`
        SELECT 
          make,
          count(*) as total_installed,
          count(*) FILTER (WHERE is_non_comm = 0) as communicating,
          count(*) FILTER (WHERE is_non_comm = 1) as total_non_comm,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (4-7D)') as non_comm_4_7d,
          count(*) FILTER (WHERE comm_category = 'Non-Comm (>7D)') as non_comm_gt_7d,
          ROUND(count(*) FILTER (WHERE is_non_comm = 0) * 100.0 / NULLIF(count(*), 0), 2) as comm_pct,
          ROUND(count(*) FILTER (WHERE is_non_comm = 1) * 100.0 / NULLIF(count(*), 0), 2) as non_comm_pct,
          ROUND(avg(COALESCE(duration_days, 60)) FILTER (WHERE is_non_comm = 1), 1) as avg_ageing,
          count(*) FILTER (WHERE is_never_comm = 1) as never_communicated
        FROM ${table}
        WHERE ${whereClause}
        GROUP BY make
        ORDER BY total_installed DESC
      `),

      // G. Technology / Source
      queryDuck(techSql),

      // H. Aging Buckets Table
      queryDuck(`
        SELECT 
          aging_bucket as bucket,
          count(*) as total_count
        FROM ${table}
        WHERE ${whereClause}
        GROUP BY aging_bucket
      `)
    ]);

    const orderMap = {
      '<= 3 Days': 1,
      '4 - 7 Days': 2,
      '8 - 15 Days': 3,
      '16 - 30 Days': 4,
      '31 - 60 Days': 5,
      '61 - 90 Days': 6,
      '91 - 180 Days': 7,
      '> 180 Days': 8,
      'Never Communicated': 9
    };
    const aging = agingRaw.sort((a, b) => (orderMap[a.bucket] || 99) - (orderMap[b.bucket] || 99));

    const kpi = kpiRows[0] || {
      total_installed: 0,
      total_communicating: 0,
      total_non_comm: 0,
      non_comm_4_7d: 0,
      non_comm_gt_7d: 0,
      never_communicated: 0,
      comm_percentage: 0,
      non_comm_percentage: 0
    };

    res.json({
      success: true,
      category,
      isFiltered: true,
      kpi,
      overview: kpi,
      kpis: kpi,
      circles,
      divisions,
      sections,
      dimensions: dims,
      phases: dims,
      phase: dims,
      makes,
      make: makes,
      technology,
      communication: technology,
      aging,
      aging_buckets: aging
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3B. Dedicated Non-Communication & Ticket Correlation Analytics API
app.get('/api/analytics/ticket-correlation', async (req, res) => {
  try {
    const {
      circle = 'ALL',
      division = 'ALL',
      section = 'ALL',
      comm_status = 'ALL_NON_COMM',
      ticket_filter = 'ALL',
      search = ''
    } = req.query;

    const conditions = ['1=1'];
    // Filter communication status (default: All Non-Communicating)
    if (comm_status === 'ALL_NON_COMM') {
      conditions.push('s.is_non_comm = 1');
    } else if (comm_status === '3-7D') {
      conditions.push("s.comm_category = 'Non-Comm (4-7D)'");
    } else if (comm_status === '>7D') {
      conditions.push("s.comm_category = 'Non-Comm (>7D)'");
    } else if (comm_status === 'NEVER') {
      conditions.push('s.is_never_comm = 1');
    } else if (comm_status === 'COMM_LTE_3D') {
      conditions.push('s.is_non_comm = 0');
    }

    if (circle && circle !== 'ALL') {
      conditions.push(`s.circle = '${circle.toUpperCase().replace(/'/g, "''")}'`);
    }
    if (division && division !== 'ALL') {
      conditions.push(`s.division = '${division.toUpperCase().replace(/'/g, "''")}'`);
    }
    if (section && section !== 'ALL') {
      conditions.push(`s.section = '${section.toUpperCase().replace(/'/g, "''")}'`);
    }

    if (ticket_filter && ticket_filter !== 'ALL') {
      if (ticket_filter === 'RAISED') {
        conditions.push('c.ticket_no IS NOT NULL');
      } else if (ticket_filter === 'NOT_RAISED' || ticket_filter === 'NO_TICKET') {
        conditions.push('c.ticket_no IS NULL');
      } else if (ticket_filter === 'PENDING') {
        conditions.push("c.ticket_status = 'Pending'");
      } else if (ticket_filter === 'NOTIFY_DISCOM') {
        conditions.push("c.ticket_status = 'Notify to Discom'");
      } else if (ticket_filter === 'ATTENDED') {
        conditions.push("c.ticket_status = 'Attended'");
      } else if (ticket_filter === 'CLOSED') {
        conditions.push("c.ticket_status = 'Closed'");
      } else if (ticket_filter === 'MR_REQUIRED') {
        conditions.push("c.ticket_status = 'MR Required'");
      }
    }

    if (search) {
      const s = search.trim().toUpperCase().replace(/'/g, "''");
      conditions.push(`(
        s.msn LIKE '%${s}%' OR 
        s.consumer_id LIKE '%${s}%' OR 
        s.name LIKE '%${s}%' OR 
        s.circle LIKE '%${s}%' OR 
        s.division LIKE '%${s}%' OR 
        s.section LIKE '%${s}%' OR 
        c.ticket_no LIKE '%${s}%' OR 
        c.main_remarks LIKE '%${s}%' OR 
        c.sub_remarks LIKE '%${s}%'
      )`);
    }

    const where = conditions.join(' AND ');

    const [kpiRows, circles, divisions, sections, commCategories, remarks] = await Promise.all([
      // 1. Executive Correlation KPIs
      queryDuck(`
        SELECT 
          count(*) as total_non_comm,
          count(c.ticket_no) as tickets_raised,
          count(*) - count(c.ticket_no) as no_ticket_raised,
          ROUND(count(c.ticket_no) * 100.0 / NULLIF(count(*), 0), 2) as coverage_pct,
          count(*) FILTER (WHERE c.ticket_status = 'Pending') as pending_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Notify to Discom') as notify_discom_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Attended') as attended_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Closed') as closed_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'MR Required') as mr_required_tickets
        FROM smart_meter_analytics s
        LEFT JOIN temp_latest_complaint c ON s.msn = c.msn
        WHERE ${where}
      `),

      // 2. Circle Breakdown
      queryDuck(`
        SELECT 
          s.circle,
          count(*) as total_non_comm,
          count(c.ticket_no) as tickets_raised,
          count(*) - count(c.ticket_no) as no_ticket_raised,
          ROUND(count(c.ticket_no) * 100.0 / NULLIF(count(*), 0), 2) as coverage_pct,
          count(*) FILTER (WHERE c.ticket_status = 'Pending') as pending_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Notify to Discom') as notify_discom_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Attended') as attended_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Closed') as closed_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'MR Required') as mr_required_tickets
        FROM smart_meter_analytics s
        LEFT JOIN temp_latest_complaint c ON s.msn = c.msn
        WHERE ${where} AND s.circle IS NOT NULL AND s.circle != ''
        GROUP BY s.circle
        ORDER BY total_non_comm DESC
      `),

      // 3. Division Breakdown
      queryDuck(`
        SELECT 
          s.circle, s.division,
          count(*) as total_non_comm,
          count(c.ticket_no) as tickets_raised,
          count(*) - count(c.ticket_no) as no_ticket_raised,
          ROUND(count(c.ticket_no) * 100.0 / NULLIF(count(*), 0), 2) as coverage_pct,
          count(*) FILTER (WHERE c.ticket_status = 'Pending') as pending_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Notify to Discom') as notify_discom_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Attended') as attended_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Closed') as closed_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'MR Required') as mr_required_tickets
        FROM smart_meter_analytics s
        LEFT JOIN temp_latest_complaint c ON s.msn = c.msn
        WHERE ${where} AND s.division IS NOT NULL AND s.division != ''
        GROUP BY s.circle, s.division
        ORDER BY total_non_comm DESC
      `),

      // 4. Section Drilldown
      queryDuck(`
        SELECT 
          s.circle, s.division, s.section,
          count(*) as total_non_comm,
          count(c.ticket_no) as tickets_raised,
          count(*) - count(c.ticket_no) as no_ticket_raised,
          ROUND(count(c.ticket_no) * 100.0 / NULLIF(count(*), 0), 2) as coverage_pct,
          count(*) FILTER (WHERE c.ticket_status = 'Pending') as pending_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Notify to Discom') as notify_discom_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Attended') as attended_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Closed') as closed_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'MR Required') as mr_required_tickets
        FROM smart_meter_analytics s
        LEFT JOIN temp_latest_complaint c ON s.msn = c.msn
        WHERE ${where} AND s.section IS NOT NULL AND s.section != ''
        GROUP BY s.circle, s.division, s.section
        ORDER BY total_non_comm DESC
        LIMIT 250
      `),

      // 5. Non-Comm Category vs Ticket Status Matrix
      queryDuck(`
        SELECT 
          s.comm_category,
          count(*) as total_meters,
          count(c.ticket_no) as tickets_raised,
          count(*) - count(c.ticket_no) as no_ticket_raised,
          ROUND(count(c.ticket_no) * 100.0 / NULLIF(count(*), 0), 2) as coverage_pct,
          count(*) FILTER (WHERE c.ticket_status = 'Pending') as pending_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Notify to Discom') as notify_discom_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Attended') as attended_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'Closed') as closed_tickets,
          count(*) FILTER (WHERE c.ticket_status = 'MR Required') as mr_required_tickets
        FROM smart_meter_analytics s
        LEFT JOIN temp_latest_complaint c ON s.msn = c.msn
        WHERE ${where}
        GROUP BY s.comm_category
        ORDER BY total_meters DESC
      `),

      // 6. Remarks / Issue Categories for Non-Comm meters
      queryDuck(`
        SELECT 
          COALESCE(c.main_remarks, 'No Ticket Raised') as main_remarks,
          COALESCE(c.sub_remarks, '-') as sub_remarks,
          count(*) as count,
          count(*) FILTER (WHERE c.ticket_status = 'Pending') as pending,
          count(*) FILTER (WHERE c.ticket_status = 'Notify to Discom') as notify_discom,
          count(*) FILTER (WHERE c.ticket_status = 'Attended') as attended,
          count(*) FILTER (WHERE c.ticket_status = 'Closed') as closed
        FROM smart_meter_analytics s
        JOIN temp_latest_complaint c ON s.msn = c.msn
        WHERE ${where}
        GROUP BY c.main_remarks, c.sub_remarks
        ORDER BY count DESC
        LIMIT 50
      `)
    ]);

    res.json({
      success: true,
      kpis: kpiRows[0] || {},
      circles,
      divisions,
      sections,
      commCategories,
      remarks
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Meter Search & Explorer API
app.get('/api/meters', async (req, res) => {
  try {
    const { category = 'consumer', page = 1, limit = 50 } = req.query;
    const table = getTableName(category);
    const whereClause = buildWhereClause(req.query);

    let countSql = `SELECT count(*) as total FROM ${table} WHERE ${whereClause}`;
    if (category === 'consumer') {
      countSql = `SELECT count(*) as total FROM ${table} s LEFT JOIN temp_latest_complaint c ON s.msn = c.msn WHERE ${whereClause}`;
    }
    const countRows = await queryDuck(countSql);
    const total = countRows[0] ? countRows[0].total : 0;

    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    let sql = '';

    if (category === 'consumer') {
      sql = `
        SELECT 
          s.msn, s.consumer_id, s.name, s.circle, s.division, s.subdivision, s.section,
          s.feeder, s.dt_name, s.category, s.phase, s.make, s.communication_type,
          s.department as hes_source, s.installed_date,
          s.last_comm_timestamp as last_reading_time,
          COALESCE(s.duration_days, 999) as ageing,
          s.comm_category, s.tariff,
          CASE WHEN c.ticket_no IS NOT NULL THEN 'YES' ELSE 'NO' END as ticket_raised,
          COALESCE(c.ticket_status, 'No Ticket') as ticket_status,
          COALESCE(c.ticket_no, '-') as ticket_no,
          COALESCE(c.main_remarks, '-') as main_remarks,
          COALESCE(c.sub_remarks, '-') as sub_remarks,
          COALESCE(c.create_date, '-') as ticket_date,
          COALESCE(c.aging_days, 0) as ticket_aging
        FROM ${table} s
        LEFT JOIN temp_latest_complaint c ON s.msn = c.msn
        WHERE ${whereClause}
        ORDER BY s.duration_days DESC, s.circle ASC
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `;
    } else if (category === 'dt') {
      sql = `
        SELECT 
          msn, dtr_code, dtr_name as name, circle, division, subdivision, section,
          sub_station as feeder, dtr_rating as phase, make, dtr_type as category,
          modem_installation as communication_type,
          installed_date,
          last_comm_timestamp as last_reading_time,
          COALESCE(duration_days, 999) as ageing,
          comm_category,
          is_inactive
        FROM ${table}
        WHERE ${whereClause}
        ORDER BY ageing DESC, circle ASC
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `;
    } else if (category === 'feeder') {
      sql = `
        SELECT 
          msn, feeder_code as consumer_id, feeder_name as name, circle, division, subdivision, section,
          substation_name as feeder, voltage_level as phase, make, feeder_type as category,
          mode as communication_type,
          installed_date,
          last_comm_timestamp as last_reading_time,
          COALESCE(duration_days, 999) as ageing,
          comm_category,
          is_inactive
        FROM ${table}
        WHERE ${whereClause}
        ORDER BY ageing DESC, circle ASC
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `;
    } else if (category === 'complaint' || category === 'onm') {
      sql = `
        SELECT 
          ticket_no as msn,
          consumer_id,
          consumer_name as name,
          circle, division, subdivision, section,
          feeder,
          dtr as dt_name,
          msn as meter_no,
          ticket_status as comm_category,
          aging_days as ageing,
          create_date as installed_date,
          COALESCE(strftime(created_at, '%d-%b-%Y %H:%M'), create_date) as last_reading_time,
          main_remarks as phase,
          sub_remarks as make,
          complaint_type as category,
          priority as communication_type,
          agency as hes_source,
          technician as tariff
        FROM ${table}
        WHERE ${whereClause}
        ORDER BY aging_days DESC, ticket_no DESC
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `;
    }

    const meters = await queryDuck(sql);
    res.json({
      success: true,
      category,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      meters
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Export CSV API
app.get('/api/export', async (req, res) => {
  try {
    const { category = 'consumer' } = req.query;
    const table = getTableName(category);
    const whereClause = buildWhereClause(req.query);

    let sql = '';
    if (category === 'consumer') {
      sql = `
        SELECT 
          s.msn as "Meter No (MSN)",
          s.consumer_id as "Consumer ID",
          s.name as "Consumer Name",
          s.circle as "Circle",
          s.division as "Division",
          s.section as "Section",
          s.feeder as "Feeder",
          s.dt_name as "DT Name",
          s.phase as "Phase",
          s.make as "Make",
          s.communication_type as "Comm Type",
          s.last_comm_timestamp as "Last Reading Timestamp",
          COALESCE(s.duration_days, 999) as "Ageing (Days)",
          s.comm_category as "Communication Status",
          CASE WHEN c.ticket_no IS NOT NULL THEN 'YES' ELSE 'NO' END as "Ticket Raised?",
          COALESCE(c.ticket_status, 'No Ticket Raised') as "Ticket Status",
          COALESCE(c.ticket_no, '-') as "Ticket No",
          COALESCE(c.main_remarks, 'No Ticket Raised') as "Ticket Main Remarks",
          COALESCE(c.sub_remarks, '-') as "Ticket Sub Remarks",
          COALESCE(c.create_date, '-') as "Ticket Creation Date",
          COALESCE(c.aging_days, 0) as "Ticket Aging (Days)"
        FROM ${table} s
        LEFT JOIN temp_latest_complaint c ON s.msn = c.msn
        WHERE ${whereClause}
        ORDER BY 13 DESC
        LIMIT 50000
      `;
    } else if (category === 'correlation') {
      sql = `
        SELECT 
          s.circle as "Circle",
          s.division as "Division",
          s.section as "Section",
          s.msn as "Meter No (MSN)",
          s.consumer_id as "Consumer ID",
          s.name as "Consumer Name",
          s.feeder as "Feeder",
          s.dt_name as "DT Name",
          s.comm_category as "Communication Status",
          COALESCE(s.duration_days, 999) as "Silent Ageing (Days)",
          CASE WHEN c.ticket_no IS NOT NULL THEN 'YES' ELSE 'NO' END as "Ticket Raised?",
          COALESCE(c.ticket_status, 'No Ticket Raised') as "Ticket Status",
          COALESCE(c.ticket_no, '-') as "Ticket No",
          COALESCE(c.main_remarks, 'No Ticket Raised') as "Ticket Main Remarks",
          COALESCE(c.sub_remarks, '-') as "Ticket Sub Remarks",
          COALESCE(c.create_date, '-') as "Ticket Creation Date",
          COALESCE(c.aging_days, 0) as "Ticket Aging (Days)"
        FROM smart_meter_analytics s
        LEFT JOIN temp_latest_complaint c ON s.msn = c.msn
        WHERE s.is_non_comm = 1
        ORDER BY s.circle, s.division, s.duration_days DESC
        LIMIT 50000
      `;
    } else if (category === 'dt') {
      sql = `
        SELECT 
          msn as "DT Meter Serial No (MSN)",
          dtr_code as "DTR Code",
          dtr_name as "DTR Name",
          CASE WHEN is_inactive = 1 THEN 'Inactive DTR' ELSE 'Active DTR' END as "DTR Status",
          circle as "Circle",
          division as "Division",
          section as "Section",
          sub_station as "Sub Station",
          feeder as "Feeder",
          dtr_rating as "Rating (kVA)",
          make as "Make",
          dtr_type as "DTR Type",
          modem_installation as "Modem Installed",
          installed_date as "Installation Date",
          last_comm_timestamp as "Last Communication Timestamp",
          COALESCE(duration_days, 999) as "Ageing (Days)",
          comm_category as "Communication Status"
        FROM ${table}
        WHERE ${whereClause}
        ORDER BY 15 DESC
        LIMIT 50000
      `;
    } else if (category === 'feeder') {
      sql = `
        SELECT 
          msn as "Feeder Meter MSN",
          feeder_code as "Feeder Code",
          feeder_name as "Feeder Name",
          voltage_level as "Voltage Level (11KV/33KV)",
          CASE WHEN is_inactive = 1 THEN 'Inactive Feeder' ELSE 'Active Feeder' END as "Feeder Status",
          circle as "Circle",
          division as "Division",
          section as "Section",
          substation_name as "Sub Station Name",
          feeder_type as "Feeder Type",
          make as "Make",
          installed_date as "Installation Date",
          last_comm_timestamp as "Last Communication Timestamp",
          COALESCE(duration_days, 999) as "Ageing (Days)",
          comm_category as "Communication Status"
        FROM ${table}
        WHERE ${whereClause}
        ORDER BY 14 DESC
        LIMIT 50000
      `;
    } else if (category === 'complaint' || category === 'onm') {
      sql = `
        SELECT 
          ticket_no as "Ticket No",
          create_date as "Ticket Date",
          circle as "Circle",
          division as "Division",
          subdivision as "Sub Division",
          section as "Section",
          sub_station as "Sub Station",
          feeder as "Feeder",
          dtr as "DTR",
          consumer_id as "Consumer ID",
          consumer_name as "Consumer Name",
          mobile_no as "Mobile No",
          msn as "Meter No (MSN)",
          ticket_status as "Ticket Status",
          status_group as "Status Group",
          aging_days as "Aging (Days)",
          aging_bucket as "Aging Bucket",
          main_remarks as "Main Remarks",
          sub_remarks as "Sub Remarks",
          detail_remark as "Detail Remark",
          complaint_type as "Complaint Type",
          priority as "Priority",
          agency as "Agency",
          technician as "Technician",
          COALESCE(strftime(created_at, '%d-%m-%Y %H:%M:%S'), create_date) as "Creation Timestamp",
          COALESCE(strftime(resolved_at, '%d-%m-%Y %H:%M:%S'), '') as "Resolution Timestamp"
        FROM ${table}
        WHERE ${whereClause}
        ORDER BY aging_days DESC, ticket_no DESC
        LIMIT 50000
      `;
    }

    const rows = await queryDuck(sql);
    if (rows.length === 0) {
      return res.status(404).send('No records match criteria');
    }

    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sbpdcl_${category}_meter_report_${Date.now()}.csv"`);
    res.send(csvContent);

  } catch (err) {
    res.status(500).send('Error generating export: ' + err.message);
  }
});

// 6. Live Portal Sync API (Modular: Consumer, DT, Feeder, or All)
let syncState = {
  running: false,
  target: 'all',
  step: 'IDLE',
  progress: 0,
  message: 'System is ready',
  lastSync: null
};

app.get('/api/sync/status', (req, res) => {
  res.json({ success: true, ...syncState });
});

app.post('/api/sync', (req, res) => {
  if (syncState.running) {
    return res.status(409).json({ success: false, message: 'Sync is already running' });
  }

  const target = req.body.target || 'all'; // 'consumer', 'dt', 'feeder', 'all'

  syncState = {
    running: true,
    target,
    step: 'STARTING',
    progress: 5,
    message: `Initiating crawler engine for ${target.toUpperCase()}...`,
    lastSync: null
  };

  res.json({ success: true, message: `Sync job for ${target} started in background` });

  // Release DuckDB connection before sync runs to avoid file locks
  isDbLocked = true;
  closeDbConnection();

  const runner = spawn('node', ['sync_pipeline.js', target], { cwd: __dirname });
  
  runner.stdout.on('data', data => {
    const txt = data.toString();
    console.log('[Sync Output]:', txt);

    // If rebuild step arrives, make sure database connection is closed and locked
    if (txt.includes('REBUILD') || txt.includes('build_database')) {
      isDbLocked = true;
      closeDbConnection();
    }

    const regex = /\[SYNC_STEP:([^:]+):(\d+)\]\s*([^\r\n]+)/g;
    let match;
    while ((match = regex.exec(txt)) !== null) {
      syncState = {
        ...syncState,
        step: match[1],
        progress: parseInt(match[2]),
        message: match[3].trim()
      };
    }
  });

  runner.stderr.on('data', data => {
    console.error('[Sync Error]:', data.toString());
  });

  runner.on('close', code => {
    isDbLocked = false;
    closeDbConnection();

    if (code === 0) {
      syncState = {
        running: false,
        target,
        step: 'COMPLETE',
        progress: 100,
        message: `Sync for ${target.toUpperCase()} completed successfully! Fresh portal data is active.`,
        lastSync: new Date().toISOString()
      };
    } else {
      syncState = {
        running: false,
        target,
        step: 'FAILED',
        progress: 100,
        message: `Sync process failed (Exit code: ${code}). Check logs for details.`,
        lastSync: null
      };
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SBPDCL Unified Meter Analytics Dashboard running at http://localhost:${PORT}`);
});
