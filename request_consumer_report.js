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
    console.log(`[DIALOG] ${d.message()}`);
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

    console.log('Navigating to ConsumerReport?pn=1...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/ConsumerReport?pn=1', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));

    // Verify report type is 1 ("Master Information")
    const reportType = await page.evaluate(() => {
      const sel = document.getElementById('ContentPlaceHolder1_authsub_ddlReportType');
      return sel ? { val: sel.value, text: sel.options[sel.selectedIndex]?.text } : null;
    });
    console.log('Selected Report Type:', reportType);

    // Click View
    console.log('Clicking View button...');
    const viewBtn = await page.$('#ContentPlaceHolder1_authsub_btnView');
    if (viewBtn) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
        viewBtn.click()
      ]);
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('Looking for Download Request button...');
    // Inspect buttons after clicking view
    const btnsAfterView = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button')).map(b => ({
        id: b.id,
        name: b.name,
        value: b.value
      }));
    });
    console.log('Buttons available after View:', btnsAfterView);

    // Click Download Request
    const dlReqBtn = await page.$('#ContentPlaceHolder1_authsub_btnDownloadRequest');
    if (dlReqBtn) {
      console.log('Clicking Download Request button...');
      await dlReqBtn.click();
      console.log('Submitted Download Request. Waiting 5s...');
      await new Promise(r => setTimeout(r, 5000));
    } else {
      console.log('btnDownloadRequest not found directly, checking for any download request button...');
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('input, button')).find(b => (b.value || '').toLowerCase().includes('download request'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 5000));
    }

    // Now navigate to DownloadRequest.aspx
    console.log('Navigating to DownloadRequest.aspx to inspect queue...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
    const topRows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table tr')).slice(0, 8).map(r => r.innerText.replace(/\s+/g, ' ').trim());
    });
    console.log('Queue rows after submitting:');
    topRows.forEach((r, i) => console.log(`${i}: ${r}`));

  } finally {
    await browser.close();
  }
}

run();
