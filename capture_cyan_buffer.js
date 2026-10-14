const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function run() {
  const downloadDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();

  let captured = false;
  page.on('response', async res => {
    const cd = res.headers()['content-disposition'];
    if (cd && cd.includes('filename=HES-Cyan')) {
      console.log('Intercepted HES-Cyan file response! Buffering...');
      try {
        const buf = await res.buffer();
        const safeName = 'HES-Cyan-NonCommunicating_gt_7Day.xlsx';
        fs.writeFileSync(path.join(downloadDir, safeName), buf);
        console.log(`Saved buffer to ${safeName} (${buf.length} bytes)`);
        captured = true;
      } catch (e) {
        console.error('Error getting buffer:', e);
      }
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

    console.log('Navigating to MainDashboard...');
    await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking Cyan cell in col 5...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {}),
      page.evaluate(() => {
        const rows = document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr');
        const cyanRow = rows[2];
        const cells = cyanRow.querySelectorAll('td');
        cells[5].querySelector('a').click();
      })
    ]);

    await new Promise(r => setTimeout(r, 3000));
    console.log('Cyan details loaded. Clicking btnDownload...');

    await page.click('#ContentPlaceHolder1_authsub_btnDownload');

    console.log('Waiting for buffer capture...');
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (captured) break;
    }

    const destPath = path.join(downloadDir, 'HES-Cyan-NonCommunicating_gt_7Day.xlsx');
    if (fs.existsSync(destPath)) {
      console.log('File successfully verified on disk:', destPath, fs.statSync(destPath).size, 'bytes');
    }

  } finally {
    await browser.close();
  }
}

run();
