const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function testQueueBoth() {
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

    // 1. Queue Cyan
    console.log('1. Navigating to ConsumerReport?pn=2 for HES-Cyan...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/ConsumerReport?pn=2', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '10');
    await page.evaluate(() => {
      document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 3000));

    await page.select('#ContentPlaceHolder1_authsub_ddlHES', '4');
    await page.evaluate(() => {
      document.querySelector('#ContentPlaceHolder1_authsub_ddlHES')?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking View for HES-Cyan...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {}),
      page.click('#ContentPlaceHolder1_authsub_btnView')
    ]);
    await new Promise(r => setTimeout(r, 3000));

    console.log('Clicking Download Request for HES-Cyan...');
    await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
    await new Promise(r => setTimeout(r, 4000));

    // 2. Queue Airtel
    console.log('2. Navigating to ConsumerReport?pn=2 for HES-Airtel...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/ConsumerReport?pn=2', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '10');
    await page.evaluate(() => {
      document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType')?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 3000));

    await page.select('#ContentPlaceHolder1_authsub_ddlHES', '6');
    await page.evaluate(() => {
      document.querySelector('#ContentPlaceHolder1_authsub_ddlHES')?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking View for HES-Airtel...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {}),
      page.click('#ContentPlaceHolder1_authsub_btnView')
    ]);
    await new Promise(r => setTimeout(r, 3000));

    console.log('Clicking Download Request for HES-Airtel...');
    await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
    await new Promise(r => setTimeout(r, 4000));

    // Check DownloadRequest queue
    console.log('3. Checking DownloadRequest.aspx queue...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table tr')).slice(0, 10).map(r => r.innerText.replace(/\s+/g, ' ').trim());
    });
    console.log('Queue rows:');
    rows.forEach((r, i) => console.log(`${i}: ${r}`));

  } finally {
    await browser.close();
  }
}

testQueueBoth()
  .then(() => console.log('Both queued.'))
  .catch(e => console.error('Error queuing:', e));
