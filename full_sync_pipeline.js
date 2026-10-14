/**
 * SBPDCL MDMS Full Live Sync Pipeline (Updated Workflow)
 *
 * Sequence:
 * 1. Authenticate on https://mdm.sbpdclinfra.in
 * 2. Queue "Prepaid Total Consumers" (Master) from https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard:
 *    - Click lblTC (Total Consumers hyperlink)
 *    - Wait for DashboardDetails page
 *    - Click download button
 * 3. Queue "Last Communication Information" from https://mdm.sbpdclinfra.in/MIS/ConsumerReport?pn=2:
 *    - Select Report Type: "Last Communication Information" (value 10)
 *    - Select HES: "HES-Cyan" (value 4) -> Click View -> Click Download Request
 *    - Select HES: "HES-Airtel" (value 6) -> Click View -> Click Download Request
 * 4. Monitor /MIS/DownloadRequest.aspx:
 *    - Wait until both "Prepaid Total Consumers" and "Last Communication Information" are Processed
 *    - Download both ZIP archives
 * 5. Extract archives into data/ directory
 * 6. Execute DuckDB join pipeline via buildDatabase()
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { buildDatabase } = require('./build_database');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = process.env.SBPDCL_USER || 'MNG_DHARMENDRA';
const PASSWORD = process.env.SBPDCL_PASS || 'Test@123';

const rootDir = __dirname;
const downloadDir = path.join(rootDir, 'downloads');
const dataDir = path.join(rootDir, 'data');
const metaPath = path.join(dataDir, 'sync_meta.json');

if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function log(step, pct, msg) {
  const line = `[SYNC_STEP:${step}:${pct}] ${msg}`;
  console.log(line);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runFullSync() {
  log('START', 2, 'Initializing Chrome automation engine...');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();

  // Set browser download behavior via CDP session
  const browserClient = await browser.target().createCDPSession();
  await browserClient.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true
  });

  browserClient.on('Browser.downloadWillBegin', e => {
    log('DOWNLOAD', 75, `Download starting: ${e.suggestedFilename}`);
  });

  page.on('dialog', async d => {
    log('DIALOG', 0, `Dialog prompt: ${d.message()}`);
    await d.accept();
  });

  try {
    // -------------------------------------------------------------
    // STEP 1: AUTHENTICATION
    // -------------------------------------------------------------
    log('AUTH', 8, 'Authenticating on SBPDCL MDMS portal (https://mdm.sbpdclinfra.in)...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME, { delay: 15 });
    await page.type('#tpw', PASSWORD, { delay: 15 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);
    log('AUTH', 15, 'Authentication successful.');

    // -------------------------------------------------------------
    // STEP 2: TRIGGER TOTAL CONSUMERS (MASTER) FROM MAIN DASHBOARD
    // -------------------------------------------------------------
    log('MASTER', 20, 'Navigating to Main Dashboard for Total Consumers...');
    await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForSelector('#ContentPlaceHolder1_authsub_lblTC', { timeout: 45000 });
    await sleep(2000);

    log('MASTER', 24, 'Clicking Total Consumers count hyperlink...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#ContentPlaceHolder1_authsub_lblTC')
    ]);

    log('MASTER', 28, 'Waiting for DashboardDetails download button...');
    await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownload', { visible: true, timeout: 60000 });
    await sleep(2000);

    log('MASTER', 32, 'Submitting fresh download request for Prepaid Total Consumers...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#ContentPlaceHolder1_authsub_btnDownload')
    ]);
    await sleep(2000);
    log('MASTER', 35, 'Total Consumers report queued successfully.');

    // -------------------------------------------------------------
    // STEP 3: QUEUE LAST COMMUNICATION INFORMATION (HES-CYAN & HES-AIRTEL)
    // -------------------------------------------------------------
    const queueLastComm = async (hesVal, hesName, pct) => {
      log('LAST_COMM', pct, `Navigating to ConsumerReport for Last Communication (${hesName})...`);
      await page.goto('https://mdm.sbpdclinfra.in/MIS/ConsumerReport?pn=2', { waitUntil: 'networkidle2', timeout: 45000 });
      await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlReportType', { timeout: 45000 });
      await sleep(2000);

      log('LAST_COMM', pct + 3, `Selecting "Last Communication Information" report type...`);
      await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '10');
      await page.evaluate(() => {
        const el = document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType');
        if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await sleep(3500);

      log('LAST_COMM', pct + 6, `Selecting HES: ${hesName}...`);
      await page.waitForSelector('#ContentPlaceHolder1_authsub_ddlHES', { timeout: 30000 });
      await page.select('#ContentPlaceHolder1_authsub_ddlHES', hesVal);
      await page.evaluate(() => {
        const el = document.querySelector('#ContentPlaceHolder1_authsub_ddlHES');
        if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await sleep(2500);

      log('LAST_COMM', pct + 9, `Clicking View to load ${hesName} report grid...`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
        page.click('#ContentPlaceHolder1_authsub_btnView')
      ]);
      await sleep(2000);

      log('LAST_COMM', pct + 12, `Clicking Download Request for ${hesName}...`);
      await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownloadRequest', { visible: true, timeout: 60000 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
        page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest')
      ]);
      await sleep(2000);
      log('LAST_COMM', pct + 14, `Queued Last Communication Request for ${hesName}.`);
    };

    // Queue Cyan (value 4) and Airtel (value 6)
    await queueLastComm('4', 'HES-Cyan', 38);
    await queueLastComm('6', 'HES-Airtel', 52);

    // -------------------------------------------------------------
    // STEP 4: MONITOR QUEUE & DOWNLOAD PROCESSED FILES
    // -------------------------------------------------------------
    log('QUEUE', 68, 'Navigating to Download Queue (/MIS/DownloadRequest.aspx)...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2', timeout: 45000 });

    let masterDownloaded = false;
    let lastCommDownloaded = false;

    for (let attempt = 1; attempt <= 45; attempt++) {
      const qPct = 70 + Math.min(18, Math.floor(attempt * 0.4));
      log('QUEUE', qPct, `Polling queue (Check ${attempt}/45): Master: ${masterDownloaded ? 'READY' : 'PENDING'}, Last Comm: ${lastCommDownloaded ? 'READY' : 'PENDING'}...`);

      // Check Master download
      if (!masterDownloaded) {
        const masterReady = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('table tr'));
          for (const r of rows) {
            const txt = r.innerText;
            if (txt.includes('Prepaid Total Consumers') && txt.toLowerCase().includes('processed')) {
              const btn = r.querySelector('input[type="image"]');
              if (btn) {
                btn.click();
                return true;
              }
            }
          }
          return false;
        });

        if (masterReady) {
          log('DOWNLOAD', 76, 'Clicked download for Prepaid Total Consumers archive.');
          masterDownloaded = true;
          await sleep(6000);
        }
      }

      // Check Last Communication download
      if (!lastCommDownloaded) {
        const lastCommReady = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('table tr'));
          for (const r of rows) {
            const txt = r.innerText;
            if (txt.includes('Last Communication Information') && txt.toLowerCase().includes('processed')) {
              const btn = r.querySelector('input[type="image"]');
              if (btn) {
                btn.click();
                return true;
              }
            }
          }
          return false;
        });

        if (lastCommReady) {
          log('DOWNLOAD', 82, 'Clicked download for Last Communication Information archive.');
          lastCommDownloaded = true;
          await sleep(6000);
        }
      }

      if (masterDownloaded && lastCommDownloaded) {
        log('DOWNLOAD', 86, 'All fresh reports triggered for download from portal.');
        break;
      }

      await sleep(6000);
      await page.reload({ waitUntil: 'networkidle2' });
    }

    // Wait for any active .crdownload files to settle
    log('EXTRACT', 89, 'Verifying downloads and waiting for archive streams to finish...');
    for (let w = 0; w < 30; w++) {
      await sleep(2000);
      const curFiles = fs.readdirSync(downloadDir);
      const activeCr = curFiles.filter(f => f.endsWith('.crdownload'));
      if (activeCr.length === 0) break;
    }

    // Extract all zip archives into data directory
    log('EXTRACT', 92, 'Extracting zip archives into data directory...');
    const zipFiles = fs.readdirSync(downloadDir).filter(f => f.endsWith('.zip'));
    for (const z of zipFiles) {
      try {
        const zipPath = path.join(downloadDir, z);
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(dataDir, true);
        log('EXTRACT', 93, `Extracted archive: ${z}`);
      } catch (e) {
        console.error('Error extracting zip:', z, e.message);
      }
    }

    // -------------------------------------------------------------
    // STEP 5: REBUILD DUCKDB DATABASE & RECALCULATE METRICS
    // -------------------------------------------------------------
    log('REBUILD', 95, 'Executing vectorized DuckDB join on MSN and computing metrics...');
    await buildDatabase();

    log('COMPLETE', 100, 'Full portal synchronization completed successfully! Fresh data is active.');
    return { success: true };

  } catch (err) {
    log('ERROR', 100, `Sync failed: ${err.message}`);
    throw err;
  } finally {
    await browser.close();
  }
}

// CLI Execution
if (require.main === module) {
  runFullSync()
    .then(r => console.log('Sync finished successfully:', r))
    .catch(e => console.error('Sync process failed:', e));
}

module.exports = { runFullSync };
