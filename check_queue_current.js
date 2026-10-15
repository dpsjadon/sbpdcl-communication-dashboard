const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(45000);

  console.log('Logging in...');
  await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2' });
  await page.type('#tne', USERNAME, { delay: 10 });
  await page.type('#tpw', PASSWORD, { delay: 10 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    page.click('#BtnSubmit')
  ]);

  console.log('Navigating to MIS/DownloadRequest.aspx ...');
  await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const rows = await page.evaluate(() => {
    const tableRows = Array.from(document.querySelectorAll('table tr'));
    return tableRows.slice(0, 15).map(r => {
      const cells = Array.from(r.querySelectorAll('th, td')).map(c => c.innerText.trim());
      const hasBtn = !!r.querySelector('input, a, button');
      return { cells, hasBtn };
    });
  });

  console.log('Download queue rows:');
  rows.forEach((r, i) => console.log(`Row ${i}:`, r.cells.join(' | ')));

  await page.screenshot({ path: 'download_queue_current.png' });
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
