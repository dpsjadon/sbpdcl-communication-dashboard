const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function main() {
  const downloadDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

  console.log('Target Download Directory:', downloadDir);
  console.log('Launching browser to check/download Notify To Discom Status Report...');

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
    console.log('[CDP Download Begin]:', e.suggestedFilename, 'GUID:', e.guid);
  });
  client.on('Browser.downloadProgress', e => {
    console.log(`[CDP Download Progress]: ${(e.receivedBytes / (1024 * 1024)).toFixed(2)} MB (${e.state})`);
  });

  page.on('dialog', async d => {
    console.log('[Dialog]:', d.message());
    await d.accept();
  });

  try {
    console.log('Logging in...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME, { delay: 10 });
    await page.type('#tpw', PASSWORD, { delay: 10 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);

    console.log('Navigating to /MIS/DownloadRequest.aspx ...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));

    // Inspect queue rows
    const rows = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr, table tr'));
      return trs.map((r, idx) => {
        const cells = Array.from(r.querySelectorAll('td, th')).map(c => c.innerText.trim());
        const hasBtn = !!r.querySelector('input[type="image"], input[type="submit"], a');
        return { idx, cells, hasBtn };
      });
    });

    console.log('Found rows in download queue:');
    rows.slice(0, 15).forEach(r => console.log(JSON.stringify(r)));

    // Look for Notify to Discom status report with status Processed
    console.log('Searching for target report row...');
    const targetRow = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr, table tr'));
      for (const r of trs) {
        const text = r.innerText;
        if (text.includes('Notify') && text.includes('Discom') && text.includes('Processed')) {
          const cells = Array.from(r.querySelectorAll('td'));
          const reqId = cells.length > 0 ? cells[0].innerText.trim() : '';
          const btn = r.querySelector('input[type="image"], input[type="submit"], a');
          if (btn) {
            btn.click();
            return { found: true, reqId, text: text.slice(0, 120) };
          }
        }
      }
      return { found: false };
    });

    console.log('Target row click attempt:', targetRow);

    if (!targetRow.found) {
      console.log('Target row not immediately found or not processed. Checking any row with Notify...');
    }

    // Wait and observe downloads directory
    console.log('Waiting for download to finish (up to 10 minutes)...');
    let start = Date.now();
    let completedFile = null;

    while (Date.now() - start < 600000) {
      await new Promise(r => setTimeout(r, 4000));
      const files = fs.readdirSync(downloadDir);
      const crdownloads = files.filter(f => f.endsWith('.crdownload'));
      const notifyZips = files.filter(f => (f.toLowerCase().includes('notify') || f.includes('311397')) && f.endsWith('.zip'));

      if (crdownloads.length > 0) {
        const crFile = path.join(downloadDir, crdownloads[0]);
        const sizeMb = (fs.statSync(crFile).size / (1024 * 1024)).toFixed(2);
        console.log(`[${Math.round((Date.now() - start)/1000)}s] In-progress: ${sizeMb} MB received`);
      } else if (notifyZips.length > 0) {
        const zPath = path.join(downloadDir, notifyZips[0]);
        const sizeMb = (fs.statSync(zPath).size / (1024 * 1024)).toFixed(2);
        if (fs.statSync(zPath).size > 1024 * 1024) {
          completedFile = zPath;
          console.log(`[SUCCESS] Download completed: ${notifyZips[0]} (${sizeMb} MB)`);
          break;
        }
      }
    }

    if (!completedFile) {
      console.log('Current files in downloads:', fs.readdirSync(downloadDir));
      throw new Error('Download did not complete in time');
    }

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Download script failed:', err);
  process.exit(1);
});
