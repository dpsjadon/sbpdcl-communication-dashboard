const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function run() {
  const downloadDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

  const filesBefore = new Set(fs.readdirSync(downloadDir));

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  
  const browserClient = await browser.target().createCDPSession();
  await browserClient.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true
  });

  let completed = false;
  browserClient.on('Browser.downloadWillBegin', e => {
    console.log('Download started:', e.suggestedFilename, e.guid);
  });
  let lastLoggedMB = 0;
  browserClient.on('Browser.downloadProgress', e => {
    const mb = (e.receivedBytes / (1024 * 1024)).toFixed(1);
    if (mb - lastLoggedMB >= 10 || e.state === 'completed') {
      console.log(`Progress: ${mb} MB (${e.state})`);
      lastLoggedMB = parseFloat(mb);
    }
    if (e.state === 'completed') {
      completed = true;
    }
  });

  try {
    console.log('Logging in...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2' });
    await page.type('#tne', USERNAME);
    await page.type('#tpw', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);

    console.log('Navigating to DownloadRequest.aspx...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking Row 1 excel button (Request 309677 Master Information)...');
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      // Row 1 is Master Information 309677
      const r = rows[1];
      const btn = r.querySelector('input[type="image"]');
      if (btn) btn.click();
    });

    console.log('Waiting for download to finish (94 MB)...');
    for (let i = 0; i < 180; i++) {
      await new Promise(r => setTimeout(r, 2000));
      if (completed) break;
      const current = fs.readdirSync(downloadDir);
      const newDone = current.filter(f => !filesBefore.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp') && f.includes('Master'));
      if (newDone.length > 0) {
        console.log('File detected on disk:', newDone[0], fs.statSync(path.join(downloadDir, newDone[0])).size, 'bytes');
        completed = true;
        break;
      }
    }

    console.log('Files in downloadDir:', fs.readdirSync(downloadDir));

  } finally {
    await browser.close();
  }
}

run();
