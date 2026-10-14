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
    console.log('Logging in at /SSO/LoginPage...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME, { delay: 20 });
    await page.type('#tpw', PASSWORD, { delay: 20 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);

    console.log('Current URL after login:', page.url());

    console.log('Navigating to MainDashboard...');
    await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 4000));

    await page.screenshot({ path: path.join(__dirname, 'main_dashboard.png'), fullPage: true });
    console.log('Saved main_dashboard.png');

    // Extract table and hyperlinks
    const dashboardData = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table')).map((tbl, idx) => {
        const rows = Array.from(tbl.querySelectorAll('tr')).map(r => {
          return Array.from(r.querySelectorAll('th, td')).map(cell => ({
            text: cell.innerText.trim(),
            html: cell.innerHTML,
            links: Array.from(cell.querySelectorAll('a')).map(a => ({
              text: a.innerText.trim(),
              href: a.href,
              id: a.id,
              onclick: a.getAttribute('onclick')
            }))
          }));
        });
        return { index: idx, id: tbl.id, className: tbl.className, rowCount: rows.length, rows: rows.slice(0, 20) };
      });
      return {
        title: document.title,
        tables
      };
    });

    fs.writeFileSync(path.join(__dirname, 'main_dashboard_data.json'), JSON.stringify(dashboardData, null, 2));
    console.log('Saved main_dashboard_data.json');

    // Next, check ConsumerReport page
    console.log('Navigating to ConsumerReport...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/ConsumerReport?pn=1', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 4000));

    await page.screenshot({ path: path.join(__dirname, 'consumer_report.png'), fullPage: true });
    console.log('Saved consumer_report.png');

    const consumerPageData = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select')).map(s => ({
        id: s.id,
        name: s.name,
        options: Array.from(s.options).map(o => ({ value: o.value, text: o.text }))
      }));
      const buttons = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button, a.btn')).map(b => ({
        id: b.id,
        name: b.name,
        value: b.value || b.innerText,
        onclick: b.getAttribute('onclick')
      }));
      return { selects, buttons };
    });

    fs.writeFileSync(path.join(__dirname, 'consumer_report_controls.json'), JSON.stringify(consumerPageData, null, 2));
    console.log('Saved consumer_report_controls.json');

  } catch (err) {
    console.error('Error during exploration:', err);
  } finally {
    await browser.close();
  }
}

run();
