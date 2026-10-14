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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadReports() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  const client = await browser.target().createCDPSession();
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true
  });

  client.on('Browser.downloadWillBegin', e => {
    console.log(`[Download Started]: ${e.suggestedFilename}`);
  });

  try {
    console.log('Logging in...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME);
    await page.type('#tpw', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);

    console.log('Navigating to Download Queue...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2', timeout: 45000 });

    const targetReqIds = ['310803', '310802', '310801', '310800', '310799', '310798'];

    for (const reqId of targetReqIds) {
      console.log(`Downloading Request ID: ${reqId}...`);
      const clicked = await page.evaluate((id) => {
        const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr'));
        for (const r of rows) {
          const cells = Array.from(r.querySelectorAll('td'));
          if (cells.length > 0 && cells[0].innerText.trim() === id) {
            const btn = r.querySelector('input[type="image"]');
            if (btn) {
              btn.click();
              return true;
            }
          }
        }
        return false;
      }, reqId);

      if (clicked) {
        console.log(`Clicked download for ${reqId}`);
        await sleep(4000);
      } else {
        console.warn(`Could not find download button for ${reqId}`);
      }
    }

    // Wait for crdownload files to settle
    console.log('Waiting for downloads to complete...');
    for (let i = 0; i < 20; i++) {
      await sleep(2000);
      const files = fs.readdirSync(downloadDir);
      const cr = files.filter(f => f.endsWith('.crdownload'));
      if (cr.length === 0) break;
    }

    console.log('All downloads settled. Listing files in downloads:');
    const dlFiles = fs.readdirSync(downloadDir);
    console.log(dlFiles);

    // Extract any new zip files to data directory
    console.log('Extracting zip files...');
    for (const f of dlFiles) {
      if (f.endsWith('.zip') && (f.includes('DTR') || f.includes('Feeder') || f.includes('31079') || f.includes('31080'))) {
        try {
          const zip = new AdmZip(path.join(downloadDir, f));
          zip.extractAllTo(dataDir, true);
          console.log(`Extracted: ${f}`);
        } catch (e) {
          console.error(`Error extracting ${f}:`, e.message);
        }
      }
    }

  } catch (err) {
    console.error('Error during download:', err);
  } finally {
    await browser.close();
  }
}

downloadReports();
