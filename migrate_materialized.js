const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

const activeCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/active_db.json'), 'utf8'));
const targetDbPath = path.join(__dirname, 'data', activeCfg.activeDb);
console.log('Connecting to active DB:', targetDbPath);

const db = new duckdb.Database(targetDbPath, duckdb.OPEN_READWRITE);
const con = db.connect();

const run = (sql) => new Promise((res, rej) => con.run(sql, err => err ? rej(err) : res()));
const all = (sql) => new Promise((res, rej) => con.all(sql, (err, rows) => err ? rej(err) : res(rows)));

(async () => {
  try {
    console.log('1. Building non_comm_ticket_analytics...');
    let t0 = performance.now();
    await run('DROP TABLE IF EXISTS non_comm_ticket_analytics');
    await run(`
      CREATE TABLE non_comm_ticket_analytics AS
      SELECT 
        s.msn, s.consumer_id, s.name, s.circle, s.division, s.subdivision, s.section,
        s.feeder, s.dt_name, s.phase, s.make, s.duration_days, s.comm_category,
        s.aging_bucket as comm_aging_bucket, s.is_never_comm, s.is_non_comm,
        c.ticket_no, c.ticket_status, c.main_remarks, c.sub_remarks, c.create_date,
        c.created_at, c.resolved_at, c.aging_days as ticket_aging_days,
        c.aging_bucket as ticket_aging_bucket,
        COALESCE(c.consumer_total_tickets, 0) as consumer_total_tickets,
        COALESCE(c.consumer_open_tickets, 0) as consumer_open_tickets,
        COALESCE(c.is_repeat_consumer, 0) as is_repeat_consumer,
        COALESCE(c.repeat_bucket, '1 Ticket') as repeat_bucket,
        COALESCE(c.open_ticket_bucket, '0 Open Tickets') as open_ticket_bucket,
        CASE WHEN c.ticket_no IS NOT NULL THEN 1 ELSE 0 END as has_ticket
      FROM smart_meter_analytics s
      LEFT JOIN latest_complaint_analytics c ON s.msn = c.msn
      WHERE s.is_non_comm = 1;
    `);
    console.log('non_comm_ticket_analytics built in', (performance.now() - t0).toFixed(1), 'ms');

    console.log('2. Denormalizing smart_meter_analytics...');
    t0 = performance.now();
    await run(`
      CREATE TABLE smart_meter_analytics_denorm AS
      SELECT 
        s.*,
        CASE WHEN c.ticket_no IS NOT NULL THEN 'YES' ELSE 'NO' END as ticket_raised,
        COALESCE(c.ticket_status, 'No Ticket') as ticket_status,
        COALESCE(c.ticket_no, '-') as ticket_no,
        COALESCE(c.main_remarks, '-') as main_remarks,
        COALESCE(c.sub_remarks, '-') as sub_remarks,
        COALESCE(c.create_date, '-') as ticket_date,
        COALESCE(c.aging_days, 0) as ticket_aging,
        COALESCE(c.consumer_total_tickets, 0) as total_tickets_count,
        COALESCE(c.consumer_open_tickets, 0) as open_tickets_count,
        COALESCE(c.repeat_bucket, '1 Ticket') as repeat_bucket,
        COALESCE(c.open_ticket_bucket, '0 Open Tickets') as open_ticket_bucket
      FROM smart_meter_analytics s
      LEFT JOIN latest_complaint_analytics c ON s.msn = c.msn;
    `);
    await run('DROP TABLE smart_meter_analytics');
    await run('ALTER TABLE smart_meter_analytics_denorm RENAME TO smart_meter_analytics');
    console.log('smart_meter_analytics denormalized in', (performance.now() - t0).toFixed(1), 'ms');

    console.log('3. Creating ART performance indexes...');
    t0 = performance.now();
    await run('CREATE INDEX IF NOT EXISTS idx_sma_circle ON smart_meter_analytics(circle);');
    await run('CREATE INDEX IF NOT EXISTS idx_sma_division ON smart_meter_analytics(division);');
    await run('CREATE INDEX IF NOT EXISTS idx_sma_msn ON smart_meter_analytics(msn);');
    await run('CREATE INDEX IF NOT EXISTS idx_sma_consumer_id ON smart_meter_analytics(consumer_id);');

    await run('CREATE INDEX IF NOT EXISTS idx_nct_circle ON non_comm_ticket_analytics(circle);');
    await run('CREATE INDEX IF NOT EXISTS idx_nct_division ON non_comm_ticket_analytics(division);');
    await run('CREATE INDEX IF NOT EXISTS idx_nct_comm_cat ON non_comm_ticket_analytics(comm_category);');
    await run('CREATE INDEX IF NOT EXISTS idx_nct_status ON non_comm_ticket_analytics(ticket_status);');

    await run('CREATE INDEX IF NOT EXISTS idx_cmp_circle ON complaint_analytics(circle);');
    await run('CREATE INDEX IF NOT EXISTS idx_cmp_division ON complaint_analytics(division);');
    await run('CREATE INDEX IF NOT EXISTS idx_cmp_status ON complaint_analytics(ticket_status);');
    console.log('Indexes created in', (performance.now() - t0).toFixed(1), 'ms');

    // Also copy to sbpdcl_analytics.duckdb
    fs.copyFileSync(targetDbPath, path.join(__dirname, 'data/sbpdcl_analytics.duckdb'));
    console.log('Active DB mirrored to sbpdcl_analytics.duckdb');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    con.close();
    db.close();
  }
})();
