const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function testClickDownloadRequest() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  page.on('dialog', async d => {
    console.log('[Dialog]:', d.message());
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

    console.log('Navigating to ConsumerReport?pn=2...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/ConsumerReport?pn=2', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Selecting ddlReportType = 10 (Last Communication Information)...');
    await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '10');
    await page.evaluate(() => {
      document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 4000));

    console.log('Selecting ddlHES = 4 (HES-Cyan)...');
    await page.select('#ContentPlaceHolder1_authsub_ddlHES', '4');
    await page.evaluate(() => {
      document.querySelector('#ContentPlaceHolder1_authsub_ddlHES')?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking View button...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(e => console.log('Nav wait:', e.message)),
      page.click('#ContentPlaceHolder1_authsub_btnView')
    ]);
    await new Promise(r => setTimeout(r, 4000));

    console.log('Clicking Download Request button (#ContentPlaceHolder1_authsub_btnDownloadRequest)...');
    await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
    await new Promise(r => setTimeout(r, 4000));

    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('Page text after clicking Download Request:');
    const lines = pageText.split('\n').filter(l => l.trim().length > 0);
    console.log(lines.slice(0, 20).join('\n'));

    console.log('Navigating to DownloadRequest queue to inspect queued row...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    const queueRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      return rows.slice(0, 10).map(r => r.innerText.replace(/\s+/g, ' ').trim());
    });

    console.log('Top rows in DownloadRequest queue:');
    queueRows.forEach((r, i) => console.log(`${i}: ${r}`));

  } finally {
    await browser.close();
  }
}

testClickDownloadRequest()
  .then(() => console.log('Test completed.'))
  .catch(e => console.error('Error:', e));
