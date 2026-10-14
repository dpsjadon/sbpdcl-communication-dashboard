/**
 * Automated Fetcher for SBPDCL MDMS:
 * 1. Queue & Download HES-Cyan (>7 Days Non-Communicating)
 * 2. Download HES-Airtel (>7 Days Non-Communicating) (or use existing 309665)
 * 3. Download Master Information (Total Smart Meter Installed & Handed over for O&M)
 * 4. Extract all ZIP files into ./data directory
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

const downloadDir = path.join(__dirname, 'downloads');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadFileFromRow(page, rowPredicate, filePrefix, maxWaitSec = 90) {
  console.log(`Locating row for predicate [${filePrefix}]...`);
  const existingFiles = new Set(fs.readdirSync(downloadDir));

  const clicked = await page.evaluate((predicate) => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    for (let r of rows) {
      if (r.innerText.includes(predicate) && r.innerText.toLowerCase().includes('processed')) {
        const btn = r.querySelector('input[type="image"]');
        if (btn) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  }, filePrefix);

  if (!clicked) {
    throw new Error(`Could not find or click download button for ${filePrefix}`);
  }

  console.log(`Clicked download for ${filePrefix}, waiting for arrival...`);
  let targetFile = null;
  for (let i = 0; i < maxWaitSec; i++) {
    await sleep(2000);
    const currentFiles = fs.readdirSync(downloadDir);
    const candidates = currentFiles.filter(f => !existingFiles.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
    if (candidates.length > 0) {
      // Find candidate matching prefix
      targetFile = candidates[0];
      const stats = fs.statSync(path.join(downloadDir, targetFile));
      console.log(`Downloaded file arrived: ${targetFile} (${stats.size} bytes)`);
      break;
    }
  }

  if (!targetFile) {
    throw new Error(`Timeout waiting for file matching ${filePrefix}`);
  }

  return targetFile;
}

async function main() {
  console.log('--- SBPDCL 3-DATABASE ACQUISITION PIPELINE ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir
  });

  page.on('dialog', async d => {
    console.log(`[Dialog] ${d.message()}`);
    await d.accept();
  });

  try {
    // STEP 1: Login
    console.log('Step 1: Logging in to MDM portal...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME, { delay: 20 });
    await page.type('#tpw', PASSWORD, { delay: 20 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);
    console.log('Logged in successfully.');

    // STEP 2: Trigger HES-Cyan Download Request
    console.log('Step 2: Navigating to MainDashboard to trigger HES-Cyan Non-Communicating >7 Days...');
    await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard', { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(3000);

    const cyanClicked = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr'));
      for (let r of rows) {
        if (r.innerText.includes('HES-Cyan')) {
          const links = Array.from(r.querySelectorAll('a'));
          for (let a of links) {
            if (a.href.includes('Non Communicating') && a.href.includes('>7 Days')) {
              a.click();
              return true;
            }
          }
        }
      }
      return false;
    });

    if (cyanClicked) {
      console.log('Clicked HES-Cyan count hyperlink, waiting for DashboardDetails page...');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
      await sleep(3000);

      console.log('Submitting Download Request for HES-Cyan...');
      const dlBtn = await page.$('#ContentPlaceHolder1_authsub_btnDownload');
      if (dlBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {}),
          dlBtn.click()
        ]);
        console.log('HES-Cyan download request submitted.');
        await sleep(3000);
      }
    } else {
      console.log('Warning: Could not find HES-Cyan row or hyperlink on MainDashboard.');
    }

    // STEP 3: Navigate to DownloadRequest and Poll Queue
    console.log('Step 3: Monitoring /MIS/DownloadRequest.aspx queue...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2', timeout: 45000 });

    let cyanProcessed = false;
    for (let attempt = 1; attempt <= 20; attempt++) {
      console.log(`Checking queue status (Attempt ${attempt}/20)...`);
      const queueStatus = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tr'));
        const info = {};
        for (let r of rows) {
          const text = r.innerText;
          if (text.includes('HES-Cyan') && text.includes('greater than 7 Day')) {
            info.cyan = text.includes('Processed') ? 'Processed' : (text.includes('Processing') ? 'Processing' : 'Pending');
          }
          if (text.includes('HES-Airtel') && text.includes('greater than 7 Day')) {
            info.airtel = text.includes('Processed') ? 'Processed' : 'Pending';
          }
          if (text.includes('Master Information')) {
            info.master = text.includes('Processed') ? 'Processed' : 'Pending';
          }
        }
        return info;
      });

      console.log('Queue state:', JSON.stringify(queueStatus));
      if (queueStatus.cyan === 'Processed') {
        cyanProcessed = true;
        break;
      }

      await sleep(6000);
      await page.reload({ waitUntil: 'networkidle2' });
    }

    // STEP 4: Download files
    console.log('Step 4: Downloading reports...');

    // 4A: Download HES-Cyan
    console.log('Downloading HES-Cyan...');
    const cyanZip = await downloadFileFromRow(page, 'HES-Cyan', 'HES-Cyan', 60);

    // 4B: Check if HES-Airtel already exists in downloads or download it
    let airtelZip = fs.readdirSync(downloadDir).find(f => f.includes('HES-Airtel') && f.endsWith('.zip'));
    if (!airtelZip) {
      console.log('Downloading HES-Airtel...');
      airtelZip = await downloadFileFromRow(page, 'HES-Airtel', 'HES-Airtel', 60);
    } else {
      console.log(`Using already downloaded Airtel file: ${airtelZip}`);
    }

    // 4C: Download Master Information
    console.log('Downloading Master Information (Total Smart Meters installed & handed over)...');
    const masterZip = await downloadFileFromRow(page, 'Master Information', 'Master Information', 180);

    console.log('All 3 files successfully retrieved:');
    console.log(`1. Airtel: ${airtelZip}`);
    console.log(`2. Cyan:   ${cyanZip}`);
    console.log(`3. Master: ${masterZip}`);

    // STEP 5: Extract all zip files to data directory
    console.log('Step 5: Extracting CSV files to ./data...');
    const allZips = [airtelZip, cyanZip, masterZip];
    for (let z of allZips) {
      const fullZipPath = path.join(downloadDir, z);
      console.log(`Extracting ${z}...`);
      const zip = new AdmZip(fullZipPath);
      zip.extractAllTo(dataDir, true);
    }

    const extractedFiles = fs.readdirSync(dataDir);
    console.log('Extracted files in data directory:', extractedFiles);
    for (let f of extractedFiles) {
      const sz = fs.statSync(path.join(dataDir, f)).size;
      console.log(`  -> ${f} (${(sz / (1024 * 1024)).toFixed(2)} MB)`);
    }

    console.log('--- DATA ACQUISITION COMPLETED SUCCESSFULLY ---');

  } catch (err) {
    console.error('Pipeline error:', err);
  } finally {
    await browser.close();
  }
}

main();
