const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function run() {
  const downloadDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

  console.log('Launching browser...');
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

  page.on('dialog', async d => {
    console.log(`Dialog opened: ${d.message()}`);
    await d.accept();
  });

  try {
    console.log('Logging in...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME, { delay: 20 });
    await page.type('#tpw', PASSWORD, { delay: 20 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);

    console.log('Navigating to MainDashboard...');
    await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 3000));

    console.log('Clicking HES-Airtel Non Communicating >7 Days hyperlink...');
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr'));
      for (let r of rows) {
        if (r.innerText.includes('HES-Airtel')) {
          const links = Array.from(r.querySelectorAll('a'));
          for (let a of links) {
            if (a.href.includes('Non Communicating') && a.href.includes('>7 Days')) {
              a.click();
              return;
            }
          }
        }
      }
    });

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
    console.log('Current URL on details page:', page.url());

    // Inspect the table and header on DashboardDetails
    const detailsInfo = await page.evaluate(() => {
      const header = document.querySelector('h1, h2, h3, .heading, #ContentPlaceHolder1_authsub_lblTitle')?.innerText;
      const downloadBtn = document.getElementById('ContentPlaceHolder1_authsub_btnDownload');
      const tableHeaders = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd th')).map(th => th.innerText.trim());
      const firstRow = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr:nth-child(2) td')).map(td => td.innerText.trim());
      return {
        header,
        hasDownloadBtn: !!downloadBtn,
        downloadBtnValue: downloadBtn?.value,
        tableHeaders,
        firstRow
      };
    });
    console.log('Details page info:', JSON.stringify(detailsInfo, null, 2));

    const filesBefore = fs.readdirSync(downloadDir);
    console.log('Clicking Download button on DashboardDetails...');
    const dlBtn = await page.$('#ContentPlaceHolder1_authsub_btnDownload');
    if (dlBtn) {
      await dlBtn.click();
      console.log('Clicked download button, waiting for download...');
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const filesAfter = fs.readdirSync(downloadDir);
        const newFiles = filesAfter.filter(f => !filesBefore.includes(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
        if (newFiles.length > 0) {
          console.log('Download detected:', newFiles);
          break;
        }
      }
    }

    console.log('Files in download dir after waiting:', fs.readdirSync(downloadDir));

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

run();
