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
  
  // Use Browser CDP session
  const browserClient = await browser.target().createCDPSession();
  await browserClient.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true
  });

  browserClient.on('Browser.downloadWillBegin', e => {
    console.log('Browser.downloadWillBegin:', e.suggestedFilename, e.guid);
  });
  browserClient.on('Browser.downloadProgress', e => {
    console.log('Browser.downloadProgress:', e.state, e.receivedBytes, e.totalBytes);
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

    console.log('Navigating to MainDashboard...');
    await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Navigating to Cyan details page...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {}),
      page.evaluate(() => {
        const rows = document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr');
        rows[2].querySelectorAll('td')[5].querySelector('a').click();
      })
    ]);

    await new Promise(r => setTimeout(r, 3000));
    console.log('Clicking btnDownload on Cyan details...');
    await page.click('#ContentPlaceHolder1_authsub_btnDownload');

    console.log('Awaiting file in downloadDir...');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const current = fs.readdirSync(downloadDir);
      const newFiles = current.filter(f => !filesBefore.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
      if (newFiles.length > 0) {
        console.log('SUCCESS! File downloaded to disk:', newFiles[0]);
        break;
      }
    }

    console.log('Files currently in downloadDir:', fs.readdirSync(downloadDir));

  } finally {
    await browser.close();
  }
}

run();
