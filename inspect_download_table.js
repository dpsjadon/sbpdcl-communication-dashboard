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

  try {
    console.log('Logging in...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME, { delay: 20 });
    await page.type('#tpw', PASSWORD, { delay: 20 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);

    console.log('Navigating to /MIS/DownloadRequest.aspx...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));

    // Inspect table rows and download buttons
    const rowInfo = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      return rows.slice(0, 10).map((r, i) => {
        const cells = Array.from(r.querySelectorAll('th, td'));
        const actionElements = Array.from(r.querySelectorAll('a, input, button')).map(el => ({
          tag: el.tagName,
          id: el.id,
          name: el.name,
          type: el.type,
          src: el.src,
          href: el.href,
          value: el.value,
          onclick: el.getAttribute('onclick')
        }));
        return {
          rowIdx: i,
          cellTexts: cells.map(c => c.innerText.trim()),
          actionElements
        };
      });
    });

    console.log('Row inspection:', JSON.stringify(rowInfo, null, 2));

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

run();
