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

  browserClient.on('Browser.downloadWillBegin', e => {
    console.log('Download starting:', e.suggestedFilename, e.guid);
  });
  let lastLogged = 0;
  browserClient.on('Browser.downloadProgress', e => {
    if (e.receivedBytes - lastLogged > 10 * 1024 * 1024 || e.state === 'completed') {
      console.log(`Download progress: ${(e.receivedBytes / (1024 * 1024)).toFixed(1)} MB (${e.state})`);
      lastLogged = e.receivedBytes;
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

    console.log('Finding Master Information row and clicking download...');
    const clicked = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      for (let r of rows) {
        if (r.innerText.includes('Master Information') && r.innerText.toLowerCase().includes('processed')) {
          const btn = r.querySelector('input[type="image"]');
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });

    if (!clicked) {
      console.log('Failed to find Master Information download button!');
      return;
    }

    console.log('Clicked download for Master Information. Waiting for arrival (file is ~94MB zipped)...');
    let masterFile = null;
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const current = fs.readdirSync(downloadDir);
      const newFiles = current.filter(f => !filesBefore.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp') && f.includes('Master'));
      if (newFiles.length > 0) {
        masterFile = newFiles[0];
        console.log(`Master file downloaded completely: ${masterFile} (${(fs.statSync(path.join(downloadDir, masterFile)).size / (1024 * 1024)).toFixed(2)} MB)`);
        break;
      }
    }

    console.log('Download status check complete.');

  } finally {
    await browser.close();
  }
}

run();
