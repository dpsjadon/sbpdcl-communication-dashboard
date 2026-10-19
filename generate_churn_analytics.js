/**
 * SBPDCL Daily Churn & 10-Day Trend Accumulator Engine
 * Accurately compares Current Sync (Today) with Yesterday's Last Sync.
 * Supports: Consumer, DT, and Feeder meters.
 * Calculates:
 *  - Cleared Today (with aging breakdown: 4-7D, 8-15D, 16-30D, 31-60D, 61-90D, 91-180D, >180D, Never Comm)
 *  - New Additions Today
 *  - Net Change
 *  - Still Silent
 *  - Circle-wise and Division-wise tables
 *  - 10-Day historical trend accumulation
 */

const duckdb = require('duckdb');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const outputFile = path.join(dataDir, 'daily_churn_analytics.json');
const trendHistoryFile = path.join(dataDir, 'daily_trend_history.json');

function getDbSnapshots() {
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('sbpdcl_analytics_v') && f.endsWith('.duckdb'));
  const snapshots = [];

  files.forEach(f => {
    const tsStr = f.replace('sbpdcl_analytics_v', '').replace('.duckdb', '');
    const ts = parseInt(tsStr, 10);
    if (!isNaN(ts)) {
      const d = new Date(ts);
      // Format as YYYY-MM-DD in IST (Asia/Kolkata)
      const istDateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // '2026-10-17'
      const istTimeStr = d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
      snapshots.push({
        file: f,
        timestamp: ts,
        date: istDateStr,
        time: istTimeStr,
        fullPath: path.join(dataDir, f).replace(/\\/g, '/')
      });
    }
  });

  // Sort chronologically ascending
  snapshots.sort((a, b) => a.timestamp - b.timestamp);
  return snapshots;
}

function runQuery(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function computePairwiseChurn(prevDbPath, currDbPath, prevDate, currDate, prevTime, currTime, category = 'consumer') {
  const memDb = new duckdb.Database(':memory:');
  const q = sql => runQuery(memDb, sql);

  await q(`ATTACH '${prevDbPath}' AS prev_db (READ_ONLY);`);
  await q(`ATTACH '${currDbPath}' AS curr_db (READ_ONLY);`);

  const tableName = category === 'dt' ? 'dt_meter_analytics' : (category === 'feeder' ? 'feeder_meter_analytics' : 'smart_meter_analytics');

  // Check if tables exist in both
  try {
    await q(`SELECT 1 FROM prev_db.${tableName} LIMIT 1;`);
    await q(`SELECT 1 FROM curr_db.${tableName} LIMIT 1;`);
  } catch (err) {
    await q('DETACH prev_db;').catch(() => {});
    await q('DETACH curr_db;').catch(() => {});
    return null;
  }

  // 1. Overall Summary
  const overallRows = await q(`
    WITH p_silent AS (
      SELECT msn, UPPER(TRIM(circle)) as circle, UPPER(TRIM(division)) as division, aging_bucket
      FROM prev_db.${tableName}
      WHERE comm_category != 'Communicating'
    ),
    c_silent AS (
      SELECT msn, UPPER(TRIM(circle)) as circle, UPPER(TRIM(division)) as division, aging_bucket
      FROM curr_db.${tableName}
      WHERE comm_category != 'Communicating'
    )
    SELECT 
      (SELECT count(*) FROM p_silent) as yesterday_silent,
      (SELECT count(*) FROM c_silent) as today_silent,
      (SELECT count(*) FROM p_silent p WHERE NOT EXISTS (SELECT 1 FROM c_silent c WHERE c.msn = p.msn)) as cleared_today,
      (SELECT count(*) FROM c_silent c WHERE NOT EXISTS (SELECT 1 FROM p_silent p WHERE p.msn = c.msn)) as new_additions_today,
      (SELECT count(*) FROM p_silent p WHERE EXISTS (SELECT 1 FROM c_silent c WHERE c.msn = p.msn)) as still_silent
  `);

  const summary = {
    category,
    yesterdayDate: prevDate,
    yesterdayTime: prevTime,
    todayDate: currDate,
    todayTime: currTime,
    yesterdaySilent: Number(overallRows[0].yesterday_silent || 0),
    todaySilent: Number(overallRows[0].today_silent || 0),
    clearedToday: Number(overallRows[0].cleared_today || 0),
    newAdditionsToday: Number(overallRows[0].new_additions_today || 0),
    stillSilent: Number(overallRows[0].still_silent || 0),
    netChange: Number(overallRows[0].new_additions_today || 0) - Number(overallRows[0].cleared_today || 0),
    recoveryRatePct: Number(overallRows[0].yesterday_silent) > 0 
      ? ((Number(overallRows[0].cleared_today) / Number(overallRows[0].yesterday_silent)) * 100).toFixed(2)
      : '0.00'
  };

  // 2. Aging Clearance Matrix
  const agingRows = await q(`
    WITH p_silent AS (
      SELECT msn, aging_bucket FROM prev_db.${tableName} WHERE comm_category != 'Communicating'
    ),
    c_silent AS (
      SELECT msn, aging_bucket FROM curr_db.${tableName} WHERE comm_category != 'Communicating'
    )
    SELECT 
      p.aging_bucket as aging_bucket,
      count(*) as yesterday_silent,
      count(CASE WHEN c.msn IS NULL THEN 1 END) as cleared_today,
      count(CASE WHEN c.msn IS NOT NULL THEN 1 END) as still_silent
    FROM p_silent p
    LEFT JOIN c_silent c ON p.msn = c.msn
    GROUP BY 1
    ORDER BY 
      CASE p.aging_bucket
        WHEN '4 - 7 Days' THEN 1
        WHEN '8 - 15 Days' THEN 2
        WHEN '16 - 30 Days' THEN 3
        WHEN '31 - 60 Days' THEN 4
        WHEN '61 - 90 Days' THEN 5
        WHEN '91 - 180 Days' THEN 6
        WHEN '> 180 Days' THEN 7
        WHEN 'Never Communicated' THEN 8
        ELSE 9
      END
  `);

  const todayNewByAging = await q(`
    WITH p_silent AS (SELECT msn FROM prev_db.${tableName} WHERE comm_category != 'Communicating'),
         c_silent AS (SELECT msn, aging_bucket FROM curr_db.${tableName} WHERE comm_category != 'Communicating')
    SELECT 
      c.aging_bucket as aging_bucket,
      count(*) as new_additions_today,
      (SELECT count(*) FROM c_silent WHERE aging_bucket = c.aging_bucket) as today_silent
    FROM c_silent c
    WHERE NOT EXISTS (SELECT 1 FROM p_silent p WHERE p.msn = c.msn)
    GROUP BY 1
  `);

  const newAgingMap = {};
  todayNewByAging.forEach(r => {
    newAgingMap[r.aging_bucket] = {
      new_additions: Number(r.new_additions_today || 0),
      today_silent: Number(r.today_silent || 0)
    };
  });

  const agingMatrix = agingRows.map(r => {
    const yCnt = Number(r.yesterday_silent || 0);
    const clrCnt = Number(r.cleared_today || 0);
    const stillCnt = Number(r.still_silent || 0);
    const newCnt = newAgingMap[r.aging_bucket]?.new_additions || 0;
    const tCnt = newAgingMap[r.aging_bucket]?.today_silent || stillCnt;
    return {
      agingBucket: r.aging_bucket,
      yesterdaySilent: yCnt,
      clearedToday: clrCnt,
      clearanceRatePct: yCnt > 0 ? ((clrCnt / yCnt) * 100).toFixed(2) : '0.00',
      stillSilent: stillCnt,
      newAdditionsToday: newCnt,
      todaySilent: tCnt,
      netChange: newCnt - clrCnt
    };
  });

  // 3. Circle Breakdown
  const circleRows = await q(`
    WITH p_silent AS (
      SELECT msn, UPPER(TRIM(circle)) as circle, aging_bucket 
      FROM prev_db.${tableName} 
      WHERE comm_category != 'Communicating'
    ),
    c_silent AS (
      SELECT msn, UPPER(TRIM(circle)) as circle, aging_bucket 
      FROM curr_db.${tableName} 
      WHERE comm_category != 'Communicating'
    )
    SELECT 
      COALESCE(c.circle, p.circle) as circle,
      COUNT(DISTINCT p.msn) as yesterday_silent,
      COUNT(DISTINCT c.msn) as today_silent,
      COUNT(DISTINCT CASE WHEN c.msn IS NULL THEN p.msn END) as cleared_today,
      -- Aging sub-breakdowns of cleared meters
      COUNT(DISTINCT CASE WHEN c.msn IS NULL AND p.aging_bucket = '4 - 7 Days' THEN p.msn END) as cleared_4_7d,
      COUNT(DISTINCT CASE WHEN c.msn IS NULL AND p.aging_bucket IN ('8 - 15 Days', '16 - 30 Days') THEN p.msn END) as cleared_8_30d,
      COUNT(DISTINCT CASE WHEN c.msn IS NULL AND p.aging_bucket IN ('31 - 60 Days', '61 - 90 Days', '91 - 180 Days', '> 180 Days') THEN p.msn END) as cleared_gt30d,
      COUNT(DISTINCT CASE WHEN c.msn IS NULL AND p.aging_bucket = 'Never Communicated' THEN p.msn END) as cleared_never,
      -- New Additions
      COUNT(DISTINCT CASE WHEN p.msn IS NULL THEN c.msn END) as new_additions_today,
      (COUNT(DISTINCT CASE WHEN p.msn IS NULL THEN c.msn END) - COUNT(DISTINCT CASE WHEN c.msn IS NULL THEN p.msn END)) as net_change
    FROM p_silent p
    FULL OUTER JOIN c_silent c ON p.msn = c.msn
    WHERE COALESCE(c.circle, p.circle) IS NOT NULL AND COALESCE(c.circle, p.circle) != ''
    GROUP BY 1
    ORDER BY yesterday_silent DESC
  `);

  const circleTable = circleRows.map(r => {
    const yCnt = Number(r.yesterday_silent || 0);
    const clrCnt = Number(r.cleared_today || 0);
    const newCnt = Number(r.new_additions_today || 0);
    const tCnt = Number(r.today_silent || 0);
    return {
      circle: r.circle,
      yesterdaySilent: yCnt,
      cleared_4_7d: Number(r.cleared_4_7d || 0),
      cleared_8_30d: Number(r.cleared_8_30d || 0),
      cleared_gt30d: Number(r.cleared_gt30d || 0),
      cleared_never: Number(r.cleared_never || 0),
      clearedToday: clrCnt,
      newAdditionsToday: newCnt,
      netChange: newCnt - clrCnt,
      todaySilent: tCnt,
      recoveryRatePct: yCnt > 0 ? ((clrCnt / yCnt) * 100).toFixed(2) : '0.00'
    };
  });

  // 4. Division Breakdown
  const divisionRows = await q(`
    WITH p_silent AS (
      SELECT msn, UPPER(TRIM(circle)) as circle, UPPER(TRIM(division)) as division, aging_bucket 
      FROM prev_db.${tableName} 
      WHERE comm_category != 'Communicating'
    ),
    c_silent AS (
      SELECT msn, UPPER(TRIM(circle)) as circle, UPPER(TRIM(division)) as division, aging_bucket 
      FROM curr_db.${tableName} 
      WHERE comm_category != 'Communicating'
    )
    SELECT 
      COALESCE(c.circle, p.circle) as circle,
      COALESCE(c.division, p.division) as division,
      COUNT(DISTINCT p.msn) as yesterday_silent,
      COUNT(DISTINCT c.msn) as today_silent,
      COUNT(DISTINCT CASE WHEN c.msn IS NULL THEN p.msn END) as cleared_today,
      COUNT(DISTINCT CASE WHEN c.msn IS NULL AND p.aging_bucket = '4 - 7 Days' THEN p.msn END) as cleared_4_7d,
      COUNT(DISTINCT CASE WHEN c.msn IS NULL AND p.aging_bucket IN ('8 - 15 Days', '16 - 30 Days') THEN p.msn END) as cleared_8_30d,
      COUNT(DISTINCT CASE WHEN c.msn IS NULL AND p.aging_bucket IN ('31 - 60 Days', '61 - 90 Days', '91 - 180 Days', '> 180 Days') THEN p.msn END) as cleared_gt30d,
      COUNT(DISTINCT CASE WHEN c.msn IS NULL AND p.aging_bucket = 'Never Communicated' THEN p.msn END) as cleared_never,
      COUNT(DISTINCT CASE WHEN p.msn IS NULL THEN c.msn END) as new_additions_today,
      (COUNT(DISTINCT CASE WHEN p.msn IS NULL THEN c.msn END) - COUNT(DISTINCT CASE WHEN c.msn IS NULL THEN p.msn END)) as net_change
    FROM p_silent p
    FULL OUTER JOIN c_silent c ON p.msn = c.msn
    WHERE COALESCE(c.circle, p.circle) IS NOT NULL AND COALESCE(c.division, p.division) IS NOT NULL
    GROUP BY 1, 2
    ORDER BY circle, division
  `);

  const divisionTable = divisionRows.map(r => {
    const yCnt = Number(r.yesterday_silent || 0);
    const clrCnt = Number(r.cleared_today || 0);
    const newCnt = Number(r.new_additions_today || 0);
    const tCnt = Number(r.today_silent || 0);
    return {
      circle: r.circle,
      division: r.division,
      yesterdaySilent: yCnt,
      cleared_4_7d: Number(r.cleared_4_7d || 0),
      cleared_8_30d: Number(r.cleared_8_30d || 0),
      cleared_gt30d: Number(r.cleared_gt30d || 0),
      cleared_never: Number(r.cleared_never || 0),
      clearedToday: clrCnt,
      newAdditionsToday: newCnt,
      netChange: newCnt - clrCnt,
      todaySilent: tCnt,
      recoveryRatePct: yCnt > 0 ? ((clrCnt / yCnt) * 100).toFixed(2) : '0.00'
    };
  });

  try {
    await q('DETACH prev_db;');
  } catch (e) {}
  try {
    await q('DETACH curr_db;');
  } catch (e) {}
  await new Promise(r => {
    try {
      memDb.close(() => r());
    } catch (e) {
      r();
    }
  });

  return {
    summary,
    agingMatrix,
    circleTable,
    divisionTable
  };
}

async function generateAllChurnAnalytics() {
  console.log('=== STARTING DAILY CHURN & TREND COMPUTATION ===');
  const snapshots = getDbSnapshots();

  if (snapshots.length < 2) {
    console.warn('Fewer than 2 database snapshots available. Need at least 2 to compute delta.');
    return null;
  }

  // 1. Group snapshots by calendar date (YYYY-MM-DD)
  const byDate = {};
  snapshots.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  });

  const sortedDates = Object.keys(byDate).sort();
  console.log('Available snapshot dates:', sortedDates);

  // Latest date is TODAY
  const todayDate = sortedDates[sortedDates.length - 1];
  // Current sync is the latest snapshot of TODAY
  const todaySnapshots = byDate[todayDate];
  const currentSyncSnapshot = todaySnapshots[todaySnapshots.length - 1];

  // Yesterday date is the date immediately preceding todayDate
  let yesterdayDate = sortedDates.length > 1 ? sortedDates[sortedDates.length - 2] : null;
  if (!yesterdayDate) {
    console.error('No previous day snapshot found.');
    return null;
  }

  // =========================================================================
  // CRITICAL REQUIREMENT (User Instruction):
  // "Yesterday refers to last sync of yesterday not today sync. It is very important to understand, so remember it."
  // - "Today report means - Refer current sync report"
  // - "Yesterday report mean - refer Yesterday Last sync"
  // Even if multiple synchronizations run throughout today, the baseline
  // is NEVER an earlier sync from today. It is ALWAYS the FINAL / LAST sync
  // from the PREVIOUS calendar day (Yesterday).
  // =========================================================================
  const yesterdaySnapshots = byDate[yesterdayDate];
  const yesterdayLastSyncSnapshot = yesterdaySnapshots[yesterdaySnapshots.length - 1];

  console.log(`[CHURN ENGINE] Baseline Comparison Confirmed:`);
  console.log(`  -> Today Current Sync:   ${currentSyncSnapshot.date} at ${currentSyncSnapshot.time} (${currentSyncSnapshot.file})`);
  console.log(`  -> Yesterday Last Sync:  ${yesterdayLastSyncSnapshot.date} at ${yesterdayLastSyncSnapshot.time} (${yesterdayLastSyncSnapshot.file}) [NOT today's earlier sync]`);

  // Compute Current Daily Churn for Consumer, DT, Feeder
  const categories = ['consumer', 'dt', 'feeder'];
  const resultsByCategory = {};

  for (const cat of categories) {
    console.log(`Computing churn for ${cat.toUpperCase()}...`);
    const res = await computePairwiseChurn(
      yesterdayLastSyncSnapshot.fullPath,
      currentSyncSnapshot.fullPath,
      yesterdayLastSyncSnapshot.date,
      currentSyncSnapshot.date,
      yesterdayLastSyncSnapshot.time,
      currentSyncSnapshot.time,
      cat
    );
    if (res) resultsByCategory[cat] = res;
  }

  // 2. Compute Multi-Day Historical Trend Accumulation (up to 10 days)
  console.log('Computing historical trend across all consecutive daily last syncs...');
  const dailyLastSyncs = sortedDates.map(d => {
    const list = byDate[d];
    return list[list.length - 1]; // Last sync of that day
  });

  const trendHistory = [];
  const circleTrendHistory = [];
  const divisionTrendHistory = [];

  for (let i = 1; i < dailyLastSyncs.length; i++) {
    const prev = dailyLastSyncs[i - 1];
    const curr = dailyLastSyncs[i];

    for (const cat of categories) {
      const pair = await computePairwiseChurn(
        prev.fullPath,
        curr.fullPath,
        prev.date,
        curr.date,
        prev.time,
        curr.time,
        cat
      );

      if (pair && pair.summary) {
        trendHistory.push({
          date: curr.date,
          compareDate: prev.date,
          category: cat,
          yesterdaySilent: pair.summary.yesterdaySilent,
          todaySilent: pair.summary.todaySilent,
          clearedToday: pair.summary.clearedToday,
          cleared_4_7d: pair.agingMatrix.find(a => a.agingBucket === '4 - 7 Days')?.clearedToday || 0,
          cleared_8_15d: pair.agingMatrix.find(a => a.agingBucket === '8 - 15 Days')?.clearedToday || 0,
          cleared_16_30d: pair.agingMatrix.find(a => a.agingBucket === '16 - 30 Days')?.clearedToday || 0,
          cleared_gt30d: pair.agingMatrix.filter(a => ['31 - 60 Days', '61 - 90 Days', '91 - 180 Days', '> 180 Days'].includes(a.agingBucket)).reduce((s, x) => s + x.clearedToday, 0),
          cleared_never: pair.agingMatrix.find(a => a.agingBucket === 'Never Communicated')?.clearedToday || 0,
          newAdditionsToday: pair.summary.newAdditionsToday,
          netChange: pair.summary.netChange,
          stillSilent: pair.summary.stillSilent,
          recoveryRatePct: pair.summary.recoveryRatePct
        });

        // Circle-wise daywise breakdown
        if (pair.circleTable) {
          pair.circleTable.forEach(c => {
            circleTrendHistory.push({
              date: curr.date,
              compareDate: prev.date,
              category: cat,
              circle: c.circle,
              totalNonComm: c.todaySilent,
              todayAddition: c.newAdditionsToday,
              todayClear: c.clearedToday,
              netAddition: c.netChange
            });
          });
        }

        // Division-wise daywise breakdown
        if (pair.divisionTable) {
          pair.divisionTable.forEach(d => {
            divisionTrendHistory.push({
              date: curr.date,
              compareDate: prev.date,
              category: cat,
              circle: d.circle,
              division: d.division,
              totalNonComm: d.todaySilent,
              todayAddition: d.newAdditionsToday,
              todayClear: d.clearedToday,
              netAddition: d.netChange
            });
          });
        }
      }
    }
  }

  // Read existing trend history if any, merge and preserve historical records
  const circleTrendHistoryFile = path.join(dataDir, 'daily_circle_trend_history.json');
  const divisionTrendHistoryFile = path.join(dataDir, 'daily_division_trend_history.json');

  let accumulatedTrend = [];
  let accumulatedCircleTrend = [];
  let accumulatedDivTrend = [];

  if (fs.existsSync(trendHistoryFile)) {
    try {
      accumulatedTrend = JSON.parse(fs.readFileSync(trendHistoryFile, 'utf8'));
      if (!Array.isArray(accumulatedTrend)) accumulatedTrend = [];
    } catch (e) {}
  }
  if (fs.existsSync(circleTrendHistoryFile)) {
    try {
      accumulatedCircleTrend = JSON.parse(fs.readFileSync(circleTrendHistoryFile, 'utf8'));
      if (!Array.isArray(accumulatedCircleTrend)) accumulatedCircleTrend = [];
    } catch (e) {}
  }
  if (fs.existsSync(divisionTrendHistoryFile)) {
    try {
      accumulatedDivTrend = JSON.parse(fs.readFileSync(divisionTrendHistoryFile, 'utf8'));
      if (!Array.isArray(accumulatedDivTrend)) accumulatedDivTrend = [];
    } catch (e) {}
  }

  // Merge overall trend entries without duplicates (keyed by date + category)
  const trendMap = new Map();
  accumulatedTrend.forEach(t => trendMap.set(`${t.date}_${t.category}`, t));
  trendHistory.forEach(t => trendMap.set(`${t.date}_${t.category}`, t));
  const finalTrend = Array.from(trendMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  // Merge circle trend entries (keyed by date + category + circle)
  const circleTrendMap = new Map();
  accumulatedCircleTrend.forEach(t => circleTrendMap.set(`${t.date}_${t.category}_${t.circle}`, t));
  circleTrendHistory.forEach(t => circleTrendMap.set(`${t.date}_${t.category}_${t.circle}`, t));
  const finalCircleTrend = Array.from(circleTrendMap.values()).sort((a, b) => {
    const dComp = b.date.localeCompare(a.date);
    return dComp !== 0 ? dComp : (a.circle || '').localeCompare(b.circle || '');
  });

  // Merge division trend entries (keyed by date + category + circle + division)
  const divTrendMap = new Map();
  accumulatedDivTrend.forEach(t => divTrendMap.set(`${t.date}_${t.category}_${t.circle}_${t.division}`, t));
  divisionTrendHistory.forEach(t => divTrendMap.set(`${t.date}_${t.category}_${t.circle}_${t.division}`, t));
  const finalDivTrend = Array.from(divTrendMap.values()).sort((a, b) => {
    const dComp = b.date.localeCompare(a.date);
    if (dComp !== 0) return dComp;
    const cComp = (a.circle || '').localeCompare(b.circle || '');
    return cComp !== 0 ? cComp : (a.division || '').localeCompare(b.division || '');
  });

  fs.writeFileSync(trendHistoryFile, JSON.stringify(finalTrend, null, 2), 'utf8');
  fs.writeFileSync(circleTrendHistoryFile, JSON.stringify(finalCircleTrend, null, 2), 'utf8');
  fs.writeFileSync(divisionTrendHistoryFile, JSON.stringify(finalDivTrend, null, 2), 'utf8');

  // Build the complete daily churn payload
  const finalPayload = {
    updatedAt: new Date().toISOString(),
    todayDate: currentSyncSnapshot.date,
    todayTime: currentSyncSnapshot.time,
    yesterdayDate: yesterdayLastSyncSnapshot.date,
    yesterdayTime: yesterdayLastSyncSnapshot.time,
    categories: resultsByCategory,
    trendHistory: finalTrend,
    circleTrendHistory: finalCircleTrend,
    divisionTrendHistory: finalDivTrend
  };

  fs.writeFileSync(outputFile, JSON.stringify(finalPayload, null, 2), 'utf8');
  console.log('Daily Churn & Trend successfully generated and written to:', outputFile);
  return finalPayload;
}

if (require.main === module) {
  generateAllChurnAnalytics().then(() => {
    console.log('Daily churn generation finished.');
    process.exit(0);
  }).catch(e => {
    console.error('Daily churn generation failed:', e);
    process.exit(1);
  });
}

module.exports = { generateAllChurnAnalytics };
