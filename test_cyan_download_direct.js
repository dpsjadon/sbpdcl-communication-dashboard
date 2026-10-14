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
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir
  });

  page.on('response', res => {
    const cd = res.headers()['content-disposition'];
    const ct = res.headers()['content-type'];
    if (cd || (ct && ct.includes('excel')) || (ct && ct.includes('csv')) || (ct && ct.includes('octet'))) {
      console.log('Detected file response:', res.url(), ct, cd);
    }
  });

  page.on('dialog', async d => {
    console.log(`DIALOG: ${d.message()}`);
    await d.accept();
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
    console.log('Cyan details loaded:', page.url());

    console.log('Clicking btnDownload on Cyan details...');
    await page.click('#ContentPlaceHolder1_authsub_btnDownload');

    console.log('Waiting up to 30 seconds for download or alert...');
    let found = null;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const currentFiles = fs.readdirSync(downloadDir);
      const newFiles = currentFiles.filter(f => !filesBefore.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
      if (newFiles.length > 0) {
        found = newFiles[0];
        console.log(`Success! Direct download captured: ${found} (${fs.statSync(path.join(downloadDir, found)).size} bytes)`);
        break;
      }
    }

    if (!found) {
      console.log('No new file in downloadDir yet. Let us check the page text or if it queued:');
      const text = await page.evaluate(() => document.body.innerText.slice(0, 600));
      console.log('Page text:', text);
    }

  } finally {
    await browser.close();
  }
}

run();
