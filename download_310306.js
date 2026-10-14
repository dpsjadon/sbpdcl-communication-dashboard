const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function download310306() {
  const downloadDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

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
    console.log('[Download Begin]:', e.suggestedFilename);
  });
  let lastLoggedMB = 0;
  client.on('Browser.downloadProgress', e => {
    const mb = (e.receivedBytes / (1024 * 1024)).toFixed(1);
    if (mb - lastLoggedMB >= 10 || e.state === 'completed') {
      console.log(`[Download Progress]: ${mb} MB (${e.state})`);
      lastLoggedMB = parseFloat(mb);
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

    console.log('Clicking download button for request 310306...');
    const clicked = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      for (let r of rows) {
        if (r.innerText.includes('310306') && r.innerText.includes('Last Communication Information')) {
          const btn = r.querySelector('input[type="image"]');
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });

    console.log('Click result:', clicked);
    console.log('Waiting up to 90 seconds for download to finish...');
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const curFiles = fs.readdirSync(downloadDir);
      const matched = curFiles.find(f => f.includes('310306') && !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
      if (matched) {
        console.log('File successfully downloaded:', matched, fs.statSync(path.join(downloadDir, matched)).size, 'bytes');
        break;
      }
    }

  } finally {
    await browser.close();
  }
}

download310306()
  .then(() => console.log('Download script completed.'))
  .catch(e => console.error('Download error:', e));
