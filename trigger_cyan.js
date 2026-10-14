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

    console.log('Clicking HES-Cyan Non-Communicating >7 Days link...');
    await page.evaluate(() => {
      // Find row with HES-Cyan
      const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr'));
      for (let r of rows) {
        if (r.innerText.toLowerCase().includes('hes-cyan')) {
          const links = Array.from(r.querySelectorAll('a'));
          for (let a of links) {
            if (a.href.includes('Non Communicating') && a.href.includes('7 Days')) {
              console.log('Found link:', a.href, a.innerText);
              a.click();
              return;
            }
          }
        }
      }
    });

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log('Nav wait:', e.message));
    await new Promise(r => setTimeout(r, 3000));

    console.log('Current URL on Cyan details:', page.url());
    await page.screenshot({ path: path.join(__dirname, 'cyan_details.png') });

    const detailsTitle = await page.evaluate(() => {
      return {
        h: document.body.innerText.slice(0, 300),
        hasBtn: !!document.getElementById('ContentPlaceHolder1_authsub_btnDownload')
      };
    });
    console.log('Details page info:', detailsTitle);

    if (detailsTitle.hasBtn) {
      console.log('Clicking btnDownload on Cyan details...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log('Btn nav wait:', e.message)),
        page.click('#ContentPlaceHolder1_authsub_btnDownload')
      ]);
      await new Promise(r => setTimeout(r, 3000));
      await page.screenshot({ path: path.join(__dirname, 'after_cyan_dl_click.png') });

      const msg = await page.evaluate(() => document.body.innerText.slice(0, 500));
      console.log('Message after click:', msg);
    }

    console.log('Checking /MIS/DownloadRequest.aspx...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
    const rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table tr')).slice(0, 5).map(r => r.innerText.replace(/\s+/g, ' ').trim());
    });
    console.log('Top rows now:');
    rows.forEach((r, i) => console.log(`${i}: ${r}`));

  } finally {
    await browser.close();
  }
}

run();
