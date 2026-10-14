const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function run() {
  const downloadDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

  const filesBefore = new Set(fs.readdirSync(downloadDir));

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  
  const browserClient = await browser.target().createCDPSession();
  await browserClient.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true
  });

  let completed = false;
  browserClient.on('Browser.downloadWillBegin', e => {
    console.log('Download started:', e.suggestedFilename, e.guid);
  });
  let lastLoggedMB = 0;
  browserClient.on('Browser.downloadProgress', e => {
    const mb = (e.receivedBytes / (1024 * 1024)).toFixed(1);
    if (mb - lastLoggedMB >= 10 || e.state === 'completed') {
      console.log(`Progress: ${mb} MB (${e.state})`);
      lastLoggedMB = parseFloat(mb);
    }
    if (e.state === 'completed') {
      completed = true;
    }
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

    console.log('Navigating to DownloadRequest.aspx to search for Prepaid Total Consumers...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Look for Prepaid Total Consumers in table
    let foundAndClicked = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      for (let r of rows) {
        if (r.innerText.includes('Prepaid Total Consumers') && r.innerText.toLowerCase().includes('processed')) {
          const btn = r.querySelector('input[type="image"]');
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });

    if (!foundAndClicked) {
      console.log('Not on page 1. Checking page 2 or pagination links...');
      const hasPage2 = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('table tr a'));
        const p2 = links.find(a => a.innerText.trim() === '2');
        if (p2) {
          p2.click();
          return true;
        }
        return false;
      });

      if (hasPage2) {
        await new Promise(r => setTimeout(r, 3000));
        console.log('Checked page 2 for Prepaid Total Consumers...');
        foundAndClicked = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('table tr'));
          for (let r of rows) {
            if (r.innerText.includes('Prepaid Total Consumers') && r.innerText.toLowerCase().includes('processed')) {
              const btn = r.querySelector('input[type="image"]');
              if (btn) {
                btn.click();
                return true;
              }
            }
          }
          return false;
        });
      }
    }

    if (!foundAndClicked) {
      console.log('Queueing fresh Prepaid Total Consumers from MainDashboard...');
      await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard', { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 2000));

      // Click Total Meters link
      await page.evaluate(() => {
        const rows = document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr');
        // Click total meters (col 1)
        const link = rows[1].querySelectorAll('td')[1].querySelector('a');
        if (link) link.click();
      });

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));

      console.log('On DashboardDetails for Total Meters. Clicking Download...');
      await page.click('#ContentPlaceHolder1_authsub_btnDownload');
      await new Promise(r => setTimeout(r, 4000));

      console.log('Navigating to DownloadRequest.aspx to poll for completion...');
      await page.goto('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', { waitUntil: 'networkidle2' });
      
      for (let attempt = 1; attempt <= 30; attempt++) {
        console.log(`Polling queue (Attempt ${attempt}/30)...`);
        const status = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('table tr'));
          for (let r of rows) {
            if (r.innerText.includes('Prepaid Total Consumers')) {
              if (r.innerText.toLowerCase().includes('processed')) {
                const btn = r.querySelector('input[type="image"]');
                if (btn) {
                  btn.click();
                  return 'CLICKED';
                }
              }
              return 'IN_PROGRESS';
            }
          }
          return 'NOT_FOUND';
        });

        if (status === 'CLICKED') {
          console.log('Clicked download button for newly processed Prepaid Total Consumers!');
          foundAndClicked = true;
          break;
        }

        await new Promise(r => setTimeout(r, 6000));
        await page.reload({ waitUntil: 'networkidle2' });
      }
    }

    if (foundAndClicked) {
      console.log('Waiting for file arrival (approx 68MB zipped)...');
      for (let i = 0; i < 180; i++) {
        await new Promise(r => setTimeout(r, 2000));
        if (completed) break;
        const current = fs.readdirSync(downloadDir);
        const newDone = current.filter(f => !filesBefore.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp') && f.toLowerCase().includes('prepaid'));
        if (newDone.length > 0) {
          console.log('Prepaid file arrival detected:', newDone[0], fs.statSync(path.join(downloadDir, newDone[0])).size, 'bytes');
          completed = true;
          break;
        }
      }
    }

    console.log('All files in downloadDir now:');
    fs.readdirSync(downloadDir).forEach(f => {
      console.log(`  - ${f} (${(fs.statSync(path.join(downloadDir, f)).size / (1024 * 1024)).toFixed(2)} MB)`);
    });

  } finally {
    await browser.close();
  }
}

run();
