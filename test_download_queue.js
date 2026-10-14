const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

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
    if (e.state === 'completed') console.log('Download completed!');
  });

  console.log('Logging in...');
  await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage');
  await page.type('#tne', USERNAME);
  await page.type('#tpw', PASSWORD);
  await Promise.all([page.waitForNavigation().catch(()=>{}), page.click('#BtnSubmit')]);

  // First: Queue Total Consumers from MainDashboard lblTC
  console.log('Navigating to MainDashboard to queue Total Consumers...');
  await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard');
  await page.waitForSelector('#ContentPlaceHolder1_authsub_lblTC');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    page.click('#ContentPlaceHolder1_authsub_lblTC')
  ]);
  console.log('On DashboardDetails. Clicking download to queue master...');
  await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownload', { visible: true });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    page.click('#ContentPlaceHolder1_authsub_btnDownload')
  ]);
  console.log('Total Consumers queued.');

  // Now go to DownloadRequest page and check queue
  console.log('Navigating to DownloadRequest.aspx...');
  await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const rows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table tr')).slice(0, 10).map((r, i) => ({
      idx: i,
      text: r.innerText.replace(/\s+/g, ' ').trim(),
      hasDl: !!r.querySelector('input[type="image"]')
    }));
  });
  console.log('Queue status:');
  rows.forEach(r => console.log(`${r.idx}: [DL:${r.hasDl}] ${r.text}`));

  // Download 310313 and 310312 if available!
  for (const reqId of ['310313', '310312']) {
    console.log(`Attempting download for Req ID ${reqId}...`);
    const clicked = await page.evaluate((targetReq) => {
      const allRows = Array.from(document.querySelectorAll('table tr'));
      for (const r of allRows) {
        if (r.innerText.includes(targetReq) && r.innerText.toLowerCase().includes('processed')) {
          const btn = r.querySelector('input[type="image"]');
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    }, reqId);
    console.log(`Clicked ${reqId}:`, clicked);
    if (clicked) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Wait for downloads to finish
  console.log('Waiting for active downloads to complete...');
  for (let s = 0; s < 40; s++) {
    await new Promise(r => setTimeout(r, 2000));
    const files = fs.readdirSync(downloadDir);
    const crd = files.filter(f => f.endsWith('.crdownload'));
    if (crd.length === 0 && files.filter(f => f.includes('Last Communication Information')).length >= 1) {
      console.log('Files in download dir:', files);
      break;
    }
  }

  await browser.close();
}

main().catch(console.error);
