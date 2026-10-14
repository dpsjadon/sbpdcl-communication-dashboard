const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = process.env.SBPDCL_USER || 'MNG_DHARMENDRA';
const PASSWORD = process.env.SBPDCL_PASS || 'Test@123';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function queueReports() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  page.on('dialog', async d => {
    console.log(`Dialog: ${d.message()}`);
    await d.accept();
  });

  try {
    console.log('Logging in...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME);
    await page.type('#tpw', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);
    console.log('Logged in.');

    // Function to trigger a report
    const triggerReport = async (url, ddlVal, reportLabel) => {
      console.log(`\n--- Queueing: ${reportLabel} on ${url} (val: ${ddlVal}) ---`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(1500);

      if (ddlVal) {
        console.log(`Selecting value ${ddlVal}...`);
        await page.select('#ContentPlaceHolder1_authsub_ddlReportType', ddlVal);
        await page.evaluate(() => {
          const el = document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType');
          if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await sleep(2500);
      }

      console.log('Clicking View button...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
        page.click('#ContentPlaceHolder1_authsub_btnView')
      ]);
      await sleep(2000);

      // Check if btnDownloadRequest is present or visible
      const dlBtn = await page.$('#ContentPlaceHolder1_authsub_btnDownloadRequest');
      if (dlBtn) {
        console.log('Clicking Download Request button...');
        await page.click('#ContentPlaceHolder1_authsub_btnDownloadRequest');
        await sleep(3500);
        console.log(`Queued ${reportLabel} successfully!`);
      } else {
        console.log(`btnDownloadRequest NOT FOUND for ${reportLabel}! Checking available buttons...`);
        const btns = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button')).map(b => ({
            id: b.id,
            value: b.value,
            visible: b.offsetParent !== null
          }));
        });
        console.log('Buttons:', JSON.stringify(btns));
      }
      await sleep(2000);
    };

    // 1. DT Meter Master
    await triggerReport('https://mdm.sbpdclinfra.in/MIS/DTRReport?pn=1', '1', 'DT Meter Master');

    // 2. DT Non Comm Report
    await triggerReport('https://mdm.sbpdclinfra.in/MIS/DTRReport?pn=2', '11', 'DT Non Comm Report');

    // 3. DT Never Comm Report
    await triggerReport('https://mdm.sbpdclinfra.in/MIS/DTRReport?pn=2', '12', 'DT Never Comm Report');

    // 4. Feeder Meter Master
    await triggerReport('https://mdm.sbpdclinfra.in/MIS/FeederReport?pn=1', '1', 'Feeder Meter Master');

    // 5. Feeder Non Comm Report
    await triggerReport('https://mdm.sbpdclinfra.in/MIS/FeederReport?pn=2', '11', 'Feeder Non Comm Report');

    // 6. Feeder Never Comm Report
    await triggerReport('https://mdm.sbpdclinfra.in/MIS/FeederReport?pn=2', '12', 'Feeder Never Comm Report');

    // Now inspect download queue
    console.log('\n--- Checking Download Queue ---');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2', timeout: 45000 });
    const queueRows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr')).map(tr => {
        return Array.from(tr.querySelectorAll('td, th')).map(td => td.innerText.trim());
      });
    });
    console.log('Queue status:');
    console.log(JSON.stringify(queueRows.slice(0, 10), null, 2));

  } catch (err) {
    console.error('Error during queueing:', err);
  } finally {
    await browser.close();
  }
}

queueReports();
