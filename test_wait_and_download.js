const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function testWaitAndDownload() {
  const downloadDir = path.join(__dirname, 'downloads');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  const client = await browser.target().createCDPSession();
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true
  });

  let capturedFile = null;
  client.on('Browser.downloadWillBegin', e => {
    console.log('[CDP Download Begin]:', e.suggestedFilename, e.guid);
    capturedFile = e.suggestedFilename;
  });
  client.on('Browser.downloadProgress', e => {
    console.log('[CDP Download Progress]:', e.receivedBytes, e.state);
  });

  page.on('response', async res => {
    const cd = res.headers()['content-disposition'];
    if (cd && cd.toLowerCase().includes('cyan')) {
      console.log('[Response Intercepted]:', cd);
      try {
        const buf = await res.buffer();
        fs.writeFileSync(path.join(downloadDir, 'test_cyan_captured.xlsx'), buf);
        console.log('[Saved buffer to test_cyan_captured.xlsx]:', buf.length, 'bytes');
      } catch (err) {
        console.error('Error saving buffer:', err.message);
      }
    }
  });

  try {
    console.log('1. Logging in...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2' });
    await page.type('#tne', USERNAME);
    await page.type('#tpw', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);

    console.log('2. Navigating to MainDashboard...');
    await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#ContentPlaceHolder1_authsub_grd', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    console.log('3. Clicking HES-Cyan Non-Communicating >7 Days link...');
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr'));
      for (const r of rows) {
        if (r.innerText.includes('HES-Cyan')) {
          const links = Array.from(r.querySelectorAll('td')[5]?.querySelectorAll('a') || []);
          if (links.length > 0) {
            links[0].click();
            return;
          }
        }
      }
    });

    console.log('4. Waiting for DashboardDetails page to load completely...');
    await page.waitForFunction(() => window.location.href.includes('DashboardDetails'), { timeout: 60000 });
    console.log('URL changed to:', page.url());

    console.log('5. Waiting for download button #ContentPlaceHolder1_authsub_btnDownload...');
    await page.waitForSelector('#ContentPlaceHolder1_authsub_btnDownload', { visible: true, timeout: 60000 });
    console.log('Download button is visible!');

    await new Promise(r => setTimeout(r, 3000));
    console.log('6. Clicking download button on DashboardDetails...');
    await page.click('#ContentPlaceHolder1_authsub_btnDownload');

    console.log('7. Waiting up to 25 seconds for download to complete...');
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const testF = path.join(downloadDir, 'test_cyan_captured.xlsx');
      if (fs.existsSync(testF) && fs.statSync(testF).size > 1000) {
        console.log('Verified test_cyan_captured.xlsx on disk:', fs.statSync(testF).size, 'bytes');
        break;
      }
    }

  } finally {
    await browser.close();
  }
}

testWaitAndDownload()
  .then(() => console.log('Test completed successfully.'))
  .catch(e => console.error('Test failed:', e));
