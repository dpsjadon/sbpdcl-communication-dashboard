const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function testQueueMaster() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
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
    await page.waitForSelector('#ContentPlaceHolder1_authsub_grd', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking Total Meters link...');
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr');
      const link = rows[1]?.querySelectorAll('td')[1]?.querySelector('a');
      if (link) link.click();
    });

    console.log('Waiting for DashboardDetails page...');
    await page.waitForFunction(() => window.location.href.includes('DashboardDetails'), { timeout: 60000 });
    await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownload', { visible: true, timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    console.log('Clicking download button on DashboardDetails...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
      page.click('#ContentPlaceHolder1_authsub_btnDownload')
    ]);
    await new Promise(r => setTimeout(r, 2000));

    const pageText = await page.evaluate(() => document.body.innerText);
    const match = pageText.match(/Request id is (\d+)/i);
    console.log('Master queued, Request ID:', match ? match[1] : 'not found');

    console.log('Checking queue...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table tr')).slice(0, 5).map(r => r.innerText.replace(/\s+/g, ' ').trim());
    });
    rows.forEach((r, i) => console.log(`${i}: ${r}`));

  } finally {
    await browser.close();
  }
}

testQueueMaster()
  .then(() => console.log('Done testQueueMaster.'))
  .catch(e => console.error('Error testQueueMaster:', e));
