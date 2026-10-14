const puppeteer = require('puppeteer-core');
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

    console.log('Clicking Cyan cell in col 5 (Non Communicating >7 Days)...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(e => console.log('Nav 1:', e.message)),
      page.evaluate(() => {
        const rows = document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr');
        // row 0 is header, row 1 is Airtel, row 2 is Cyan
        const cyanRow = rows[2];
        const cells = cyanRow.querySelectorAll('td');
        const link = cells[5].querySelector('a');
        console.log('Target link:', link ? link.innerText : 'null');
        if (link) link.click();
      })
    ]);

    await new Promise(r => setTimeout(r, 3000));
    console.log('Current URL on Cyan details:', page.url());

    const titleH = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log('Page header preview:', titleH);

    console.log('Clicking Download button...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(e => console.log('Nav 2:', e.message)),
      page.click('#ContentPlaceHolder1_authsub_btnDownload')
    ]);

    await new Promise(r => setTimeout(r, 3000));
    const resultText = await page.evaluate(() => document.body.innerText.slice(0, 600));
    console.log('Result after clicking download:', resultText);

    console.log('Navigating to DownloadRequest queue...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
    const rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table tr')).slice(0, 5).map(r => r.innerText.replace(/\s+/g, ' ').trim());
    });
    console.log('Queue top rows:');
    rows.forEach((r, i) => console.log(`${i}: ${r}`));

  } finally {
    await browser.close();
  }
}

run();
