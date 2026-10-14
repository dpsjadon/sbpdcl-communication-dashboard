const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
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

    console.log('Executing exact doPostBack for Cyan Non Communicating >7 Days...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(e => console.log('Nav wait 1:', e.message)),
      page.evaluate(() => {
        __doPostBack('ctl00$ctl00$ContentPlaceHolder1$authsub$grd', 'Non Communicating >7 Days^$1');
      })
    ]);

    await new Promise(r => setTimeout(r, 3000));
    console.log('Cyan >7 Days URL:', page.url());

    const titleH = await page.evaluate(() => {
      const h = document.body.innerText;
      return h.slice(0, 400);
    });
    console.log('Page header preview:', titleH);

    console.log('Clicking Download button on Cyan >7 Days...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(e => console.log('Nav wait 2:', e.message)),
      page.click('#ContentPlaceHolder1_authsub_btnDownload')
    ]);

    await new Promise(r => setTimeout(r, 3000));
    const resultText = await page.evaluate(() => document.body.innerText.slice(0, 600));
    console.log('Result after clicking download:', resultText);

    console.log('Navigating to DownloadRequest queue...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
    const rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table tr')).slice(0, 5).map(r => r.innerText.replace(/\s+/g, ' ').trim());
    });
    console.log('Queue top rows:');
    rows.forEach((r, i) => console.log(`${i}: ${r}`));

  } finally {
    await browser.close();
  }
}

run();
