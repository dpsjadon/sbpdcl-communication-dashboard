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
    console.log(`DIALOG APPEARED: ${d.message()} (${d.type()})`);
    await d.accept();
  });

  page.on('response', async res => {
    const headers = res.headers();
    const cd = headers['content-disposition'];
    const ct = headers['content-type'];
    if (cd || (ct && (ct.includes('excel') || ct.includes('zip') || ct.includes('csv') || ct.includes('octet-stream')))) {
      console.log('DOWNLOAD/FILE RESPONSE:', res.url(), 'Type:', ct, 'Disposition:', cd);
    }
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
    await new Promise(r => setTimeout(r, 3000));

    console.log('Inspecting btnDownload element details:');
    const btnHtml = await page.evaluate(() => {
      const btn = document.getElementById('ContentPlaceHolder1_authsub_btnDownload');
      return {
        outerHTML: btn?.outerHTML,
        onclick: btn?.getAttribute('onclick'),
        formAction: btn?.form?.action,
        formTarget: btn?.form?.target
      };
    });
    console.log('Btn details:', JSON.stringify(btnHtml, null, 2));

    console.log('Clicking btnDownload with navigation/network listener...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(e => console.log('Navigation error/timeout (may be file download):', e.message)),
      page.click('#ContentPlaceHolder1_authsub_btnDownload')
    ]);

    console.log('After click, URL:', page.url());
    console.log('After click, Title:', await page.title());

    // Check if any popup or alert text appeared in DOM
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    console.log('Body text preview:', bodyText);

    // Also check DownloadRequest page! Maybe it was queued into DownloadRequest?
    console.log('Checking /MIS/DownloadRequest.aspx...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2', timeout: 35000 });
    const queueRows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table tr')).slice(0, 8).map(r => r.innerText.trim().replace(/\s+/g, ' '));
    });
    console.log('Queue top rows:', JSON.stringify(queueRows, null, 2));

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

run();
