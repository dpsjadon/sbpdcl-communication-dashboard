/**
 * SBPDCL MDMS Modular Multi-Report Live Sync Pipeline
 * Supports:
 * - consumer: Prepaid Total Consumers + Last Communication Information (HES-Cyan & HES-Airtel)
 * - dt: DT Meter Master + DT Non Comm Report + DT Never Comm Report
 * - feeder: Feeder Meter Master + Feeder Non Comm Report + Feeder Never Comm Report
 * - all: All of the above
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = process.env.SBPDCL_USER || 'MNG_DHARMENDRA';
const PASSWORD = process.env.SBPDCL_PASS || 'Test@123';

const rootDir = __dirname;
const downloadDir = path.join(rootDir, 'downloads');
const dataDir = path.join(rootDir, 'data');

if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function log(step, pct, msg) {
  const line = `[SYNC_STEP:${step}:${pct}] ${msg}`;
  console.log(line);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runSync(options = {}) {
  const target = options.target || 'all'; // 'consumer', 'dt', 'feeder', 'all' or specific report IDs
  const doConsMaster = target === 'all' || target === 'consumer' || target === 'consumer_master';
  const doConsComm = target === 'all' || target === 'consumer' || target === 'consumer_last_comm' || target === 'consumer_comm';
  const doDTMaster = target === 'all' || target === 'dt' || target === 'dt_master';
  const doDTNonComm = target === 'all' || target === 'dt' || target === 'dt_non_comm';
  const doDTNeverComm = target === 'all' || target === 'dt' || target === 'dt_never_comm';
  const doFdrMaster = target === 'all' || target === 'feeder' || target === 'feeder_master';
  const doFdrNonComm = target === 'all' || target === 'feeder' || target === 'feeder_non_comm';
  const doFdrNeverComm = target === 'all' || target === 'feeder' || target === 'feeder_never_comm';
  const doComplaint = target === 'all' || target === 'complaint' || target === 'onm';

  const doConsumer = doConsMaster || doConsComm;
  const doDT = doDTMaster || doDTNonComm || doDTNeverComm;
  const doFeeder = doFdrMaster || doFdrNonComm || doFdrNeverComm;

  log('START', 2, `Initializing crawler engine for targets: ${target.toUpperCase()}...`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(90000);
  const client = await browser.target().createCDPSession();
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true
  });

  client.on('Browser.downloadWillBegin', e => {
    log('DOWNLOAD', 80, `Download initiated: ${e.suggestedFilename}`);
  });

  page.on('dialog', async d => {
    log('DIALOG', 0, `Dialog: ${d.message()}`);
    await d.accept();
  });

  try {
    // -------------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------------
    log('AUTH', 5, 'Authenticating on SBPDCL MDMS portal (https://mdm.sbpdclinfra.in)...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME, { delay: 10 });
    await page.type('#tpw', PASSWORD, { delay: 10 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);
    log('AUTH', 10, 'Authentication successful.');

    // -------------------------------------------------------------
    // 1. CONSUMER METERS QUEUEING
    // -------------------------------------------------------------
    if (doConsumer) {
      if (doConsMaster) {
        log('CONSUMER_MASTER', 15, 'Queuing Prepaid Total Consumers from Main Dashboard...');
        await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard', { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForSelector('#ContentPlaceHolder1_authsub_lblTC', { timeout: 45000 });
        await sleep(1500);

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
          page.click('#ContentPlaceHolder1_authsub_lblTC')
        ]);

        await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownload', { visible: true, timeout: 60000 });
        await sleep(1500);

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
          page.click('#ContentPlaceHolder1_authsub_btnDownload')
        ]);
        await sleep(2000);
        log('CONSUMER_MASTER', 20, 'Prepaid Total Consumers queued.');
      }

      if (doConsComm) {
        // Last Comm Cyan
        log('CONSUMER_COMM', 25, 'Queuing Last Communication (HES-Cyan)...');
        await page.goto('https://mdm.sbpdclinfra.in/MIS/ConsumerReport?pn=2', { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlReportType', { timeout: 45000 });
        await sleep(1500);
        await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '10');
        await page.evaluate(() => document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true })));
        await sleep(3000);

        await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlHES', { timeout: 30000 });
        await page.select('#ContentPlaceHolder1_authsub_ddlHES', '4');
        await page.evaluate(() => document.querySelector('#ContentPlaceHolder1_authsub_ddlHES')?.dispatchEvent(new Event('change', { bubbles: true })));
        await sleep(2000);

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
          page.click('#ContentPlaceHolder1_authsub_btnView')
        ]);
        await sleep(1500);
        await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownloadRequest', { visible: true, timeout: 60000 });
        await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
        await sleep(2500);
        log('CONSUMER_COMM', 30, 'Queued Last Communication (HES-Cyan).');

        // Last Comm Airtel
        log('CONSUMER_COMM', 35, 'Queuing Last Communication (HES-Airtel)...');
        await page.goto('https://mdm.sbpdclinfra.in/MIS/ConsumerReport?pn=2', { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlReportType', { timeout: 45000 });
        await sleep(1500);
        await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '10');
        await page.evaluate(() => document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true })));
        await sleep(3000);

        await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlHES', { timeout: 30000 });
        await page.select('#ContentPlaceHolder1_authsub_ddlHES', '6');
        await page.evaluate(() => document.querySelector('#ContentPlaceHolder1_authsub_ddlHES')?.dispatchEvent(new Event('change', { bubbles: true })));
        await sleep(2000);

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
          page.click('#ContentPlaceHolder1_authsub_btnView')
        ]);
        await sleep(1500);
        await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownloadRequest', { visible: true, timeout: 60000 });
        await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
        await sleep(2500);
        log('CONSUMER_COMM', 40, 'Queued Last Communication (HES-Airtel).');
      }
    }

    // -------------------------------------------------------------
    // 2. DT METERS QUEUEING
    // -------------------------------------------------------------
    if (doDT) {
      if (doDTMaster) {
        log('DT_MASTER', 45, 'Queuing DT Meter Master from /MIS/DTRReport?pn=1...');
        await page.goto('https://mdm.sbpdclinfra.in/MIS/DTRReport?pn=1', { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlReportType', { timeout: 45000 });
        await sleep(1000);
        await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '1');
        await page.evaluate(() => document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true })));
        await sleep(2000);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
          page.click('#ContentPlaceHolder1_authsub_btnView')
        ]);
        await sleep(1500);
        await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownloadRequest', { visible: true, timeout: 60000 });
        await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
        await sleep(2500);
        log('DT_MASTER', 50, 'DT Meter Master queued successfully.');
      }

      if (doDTNonComm) {
        log('DT_NON_COMM', 53, 'Queuing DT Non Communicating Report from /MIS/DTRReport?pn=2...');
        await page.goto('https://mdm.sbpdclinfra.in/MIS/DTRReport?pn=2', { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlReportType', { timeout: 45000 });
        await sleep(1000);
        await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '11');
        await page.evaluate(() => document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true })));
        await sleep(2000);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
          page.click('#ContentPlaceHolder1_authsub_btnView')
        ]);
        await sleep(1500);
        await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownloadRequest', { visible: true, timeout: 60000 });
        await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
        await sleep(2500);
        log('DT_NON_COMM', 56, 'DT Non Communicating Report queued.');
      }

      if (doDTNeverComm) {
        log('DT_NEVER_COMM', 58, 'Queuing DT Never Communicating Report from /MIS/DTRReport?pn=2...');
        await page.goto('https://mdm.sbpdclinfra.in/MIS/DTRReport?pn=2', { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlReportType', { timeout: 45000 });
        await sleep(1000);
        await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '12');
        await page.evaluate(() => document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true })));
        await sleep(2000);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
          page.click('#ContentPlaceHolder1_authsub_btnView')
        ]);
        await sleep(1500);
        await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownloadRequest', { visible: true, timeout: 60000 });
        await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
        await sleep(2500);
        log('DT_NEVER_COMM', 60, 'DT Never Communicating Report queued.');
      }
    }

    // -------------------------------------------------------------
    // 3. FEEDER METERS QUEUEING
    // -------------------------------------------------------------
    if (doFeeder) {
      if (doFdrMaster) {
        log('FDR_MASTER', 63, 'Queuing Feeder Meter Master from /MIS/FeederReport?pn=1...');
        await page.goto('https://mdm.sbpdclinfra.in/MIS/FeederReport?pn=1', { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlReportType', { timeout: 45000 });
        await sleep(1000);
        await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '1');
        await page.evaluate(() => document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true })));
        await sleep(2000);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
          page.click('#ContentPlaceHolder1_authsub_btnView')
        ]);
        await sleep(1500);
        await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownloadRequest', { visible: true, timeout: 60000 });
        await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
        await sleep(2500);
        log('FDR_MASTER', 66, 'Feeder Meter Master queued.');
      }

      if (doFdrNonComm) {
        log('FDR_NON_COMM', 68, 'Queuing Feeder Non Communicating Report from /MIS/FeederReport?pn=2...');
        await page.goto('https://mdm.sbpdclinfra.in/MIS/FeederReport?pn=2', { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlReportType', { timeout: 45000 });
        await sleep(1000);
        await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '11');
        await page.evaluate(() => document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true })));
        await sleep(2000);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
          page.click('#ContentPlaceHolder1_authsub_btnView')
        ]);
        await sleep(1500);
        await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownloadRequest', { visible: true, timeout: 60000 });
        await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
        await sleep(2500);
        log('FDR_NON_COMM', 70, 'Feeder Non Communicating Report queued.');
      }

      if (doFdrNeverComm) {
        log('FDR_NEVER_COMM', 72, 'Queuing Feeder Never Communicating Report from /MIS/FeederReport?pn=2...');
        await page.goto('https://mdm.sbpdclinfra.in/MIS/FeederReport?pn=2', { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlReportType', { timeout: 45000 });
        await sleep(1000);
        await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '12');
        await page.evaluate(() => document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true })));
        await sleep(2000);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
          page.click('#ContentPlaceHolder1_authsub_btnView')
        ]);
        await sleep(1500);
        await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownloadRequest', { visible: true, timeout: 60000 });
        await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
        await sleep(2500);
        log('FDR_NEVER_COMM', 73, 'Feeder Never Communicating Report queued.');
      }
    }

    // -------------------------------------------------------------
    // 4. ONM COMPLAINT REPORT QUEUEING
    // -------------------------------------------------------------
    if (doComplaint) {
      log('COMPLAINT', 74, 'Queuing OnM Complaint Report from /MDMS/Complaint/Reports/ComplaintReport...');
      await page.goto('https://mdm.sbpdclinfra.in/MDMS/Complaint/Reports/ComplaintReport', { waitUntil: 'networkidle2', timeout: 45000 });
      await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlReportType', { timeout: 45000 });
      await sleep(1000);
      await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '7');
      await page.evaluate(() => {
        const sel = document.getElementById('ContentPlaceHolder1_authsub_ddlReportType');
        if (sel) sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await sleep(3000);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
        page.click('#ContentPlaceHolder1_authsub_btnDownload')
      ]);
      await sleep(2500);
      log('COMPLAINT', 75, 'OnM Complaint Report queued.');
    }

    // -------------------------------------------------------------
    // 5. MONITOR QUEUE & DOWNLOAD PROCESSED FILES
    // -------------------------------------------------------------
    log('QUEUE', 76, 'Navigating to Download Queue (/MIS/DownloadRequest.aspx)...');
    try {
      await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      log('QUEUE_WARN', 76, `Initial queue navigation notice: ${e.message}`);
    }

    const downloadedReqIds = new Set();
    const downloadedTypes = new Set();
    const neededTypes = [];
    if (doConsMaster) neededTypes.push('Prepaid Total Consumers');
    if (doConsComm) neededTypes.push('Last Communication Information');
    if (doDTMaster) neededTypes.push('DTR Master Information');
    if (doDTNonComm) neededTypes.push('DTR Non Communicating');
    if (doDTNeverComm) neededTypes.push('DTR Never Communicating');
    if (doFdrMaster) neededTypes.push('Feeder Master Information');
    if (doFdrNonComm) neededTypes.push('Feeder Non Communicating');
    if (doFdrNeverComm) neededTypes.push('Feeder Never');
    if (doComplaint) neededTypes.push('Complaint');

    for (let attempt = 1; attempt <= 45; attempt++) {
      const qPct = 77 + Math.min(15, Math.floor(attempt * 0.35));
      log('QUEUE', qPct, `Polling download queue (Check ${attempt}/45)...`);

      let availableToDownload = [];
      try {
        availableToDownload = await page.evaluate((needed) => {
          const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr'));
          const toDownload = [];
          for (const r of rows) {
            const cells = Array.from(r.querySelectorAll('td'));
            if (cells.length >= 5) {
              const reqId = cells[0].innerText.trim();
              const repName = cells[2].innerText.trim();
              const status = cells[3].innerText.trim();
              if (status.toLowerCase().includes('processed')) {
                for (const n of needed) {
                  if (repName.toLowerCase().includes(n.toLowerCase())) {
                    toDownload.push({ reqId, repName, typeKey: n });
                    break;
                  }
                }
              }
            }
          }
          return toDownload;
        }, neededTypes);
      } catch (evalErr) {
        log('QUEUE_WARN', qPct, `Evaluation notice: ${evalErr.message}`);
      }

      let newDownloads = 0;
      for (const item of availableToDownload) {
        if (!downloadedReqIds.has(item.reqId)) {
          log('DOWNLOAD', 82, `Initiating download for ${item.repName} (Req: ${item.reqId})...`);
          try {
            await page.evaluate((id) => {
              const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr'));
              for (const r of rows) {
                const cells = Array.from(r.querySelectorAll('td'));
                if (cells.length > 0 && cells[0].innerText.trim() === id) {
                  const btn = r.querySelector('input[type="image"]');
                  if (btn) btn.click();
                }
              }
            }, item.reqId);
            downloadedReqIds.add(item.reqId);
            downloadedTypes.add(item.typeKey);
            newDownloads++;
            await sleep(4000);
          } catch (clickErr) {
            log('DOWNLOAD_WARN', 82, `Click download notice: ${clickErr.message}`);
          }
        }
      }

      const allDone = neededTypes.every(nt => downloadedTypes.has(nt));
      if (allDone || (downloadedReqIds.size >= neededTypes.length && downloadedReqIds.size > 0)) {
        log('DOWNLOAD', 88, 'All requested reports have been triggered for download.');
        break;
      }

      await sleep(6000);
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
      } catch (reloadErr) {
        log('QUEUE_WARN', qPct, `Queue reload slow (${reloadErr.message}). Refreshing...`);
        try {
          await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'domcontentloaded', timeout: 45000 });
        } catch (gotoErr) {
          // Continue to next polling cycle without crashing
        }
      }
    }

    // Settle downloads (wait for .crdownload files to complete)
    log('EXTRACT', 90, 'Verifying download streams and waiting for files to settle...');
    for (let w = 0; w < 60; w++) {
      await sleep(2000);
      const curFiles = fs.readdirSync(downloadDir);
      const activeCr = curFiles.filter(f => f.endsWith('.crdownload'));
      if (activeCr.length === 0) {
        await sleep(2000);
        break;
      }
    }

    // Extract all recent zip archives into data directory
    log('EXTRACT', 93, 'Extracting zip archives into data directory...');
    const now = Date.now();
    const zipFiles = fs.readdirSync(downloadDir)
      .filter(f => f.endsWith('.zip'))
      .sort((a, b) => {
        return fs.statSync(path.join(downloadDir, b)).mtimeMs - fs.statSync(path.join(downloadDir, a)).mtimeMs;
      });

    for (const z of zipFiles) {
      try {
        const zipPath = path.join(downloadDir, z);
        const stats = fs.statSync(zipPath);
        // Extract recent zips (modified in the last 24h) or all if fewer than 15
        if (now - stats.mtimeMs < 24 * 3600 * 1000 || zipFiles.length <= 15) {
          const zip = new AdmZip(zipPath);
          zip.extractAllTo(dataDir, true);
          log('EXTRACT', 94, `Extracted archive: ${z}`);
        }
      } catch (e) {
        console.error('Error extracting zip:', z, e.message);
      }
    }

    // Rebuild DuckDB
    log('REBUILD', 96, 'Executing DuckDB build pipeline to update analytics...');
    const { buildDatabase } = require('./build_database');
    await buildDatabase({ target });

    log('COMPLETE', 100, `Synchronization for ${target.toUpperCase()} completed successfully! Fresh portal data is active.`);
    return { success: true };

  } catch (err) {
    log('ERROR', 100, `Sync failed: ${err.message}`);
    throw err;
  } finally {
    await browser.close();
  }
}

// CLI execution
if (require.main === module) {
  const target = process.argv[2] || 'all';
  runSync({ target })
    .then(r => {
      console.log('Sync finished successfully:', r);
      process.exit(0);
    })
    .catch(e => {
      console.error('Sync process failed:', e);
      process.exit(1);
    });
}

module.exports = { runSync };
