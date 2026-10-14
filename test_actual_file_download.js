const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function run() {
  const downloadDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

  const existingFiles = new Set(fs.readdirSync(downloadDir));

  console.log('Launching browser...');
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

  try {
    console.log('Logging in...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME, { delay: 20 });
    await page.type('#tpw', PASSWORD, { delay: 20 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);

    console.log('Navigating to DownloadRequest...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking download button for row 1 (HES-Airtel)...');
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      for (let r of rows) {
        if (r.innerText.includes('HES-Airtel') && r.innerText.includes('Processed')) {
          const btn = r.querySelector('input[type="image"]');
          if (btn) {
            btn.click();
            break;
          }
        }
      }
    });

    console.log('Waiting for file in downloadDir...');
    let downloaded = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const current = fs.readdirSync(downloadDir).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
      const added = current.filter(f => !existingFiles.has(f));
      if (added.length > 0) {
        downloaded = added[0];
        console.log(`Success! File downloaded: ${downloaded} (${fs.statSync(path.join(downloadDir, downloaded)).size} bytes)`);
        break;
      }
    }

    if (!downloaded) {
      console.log('Download not detected yet. Files in dir:', fs.readdirSync(downloadDir));
    }

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

run();
