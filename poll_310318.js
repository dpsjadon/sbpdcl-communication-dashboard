const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

const downloadDir = path.join(__dirname, 'downloads');

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true
  });

  cdp.on('Browser.downloadWillBegin', e => console.log('Download will begin:', e.suggestedFilename));
  cdp.on('Browser.downloadProgress', e => {
    if (e.state === 'completed') console.log('Download completed:', e);
  });

  await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage');
  await page.type('#tne', USERNAME);
  await page.type('#tpw', PASSWORD);
  await Promise.all([page.waitForNavigation().catch(()=>{}), page.click('#BtnSubmit')]);

  await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const rows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table tr')).slice(0, 6).map((r, i) => ({
      idx: i,
      text: r.innerText.replace(/\s+/g, ' ').trim(),
      hasDl: !!r.querySelector('input[type="image"]')
    }));
  });
  console.log('Top queue:');
  rows.forEach(r => console.log(`${r.idx}: [DL:${r.hasDl}] ${r.text}`));

  // If 310318 is processed, click download
  const downloaded = await page.evaluate(() => {
    const allRows = Array.from(document.querySelectorAll('table tr'));
    for (const r of allRows) {
      if (r.innerText.includes('310318') && r.innerText.toLowerCase().includes('processed')) {
        const btn = r.querySelector('input[type="image"]');
        if (btn) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  });

  console.log('Clicked 310318 download:', downloaded);
  if (downloaded) {
    console.log('Waiting for download to finish...');
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const files = fs.readdirSync(downloadDir);
      if (files.some(f => f.includes('310318') && !f.endsWith('.crdownload'))) {
        console.log('Download 310318 finished!');
        break;
      }
    }
  }

  await browser.close();
}

main().catch(console.error);
