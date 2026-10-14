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

  // Track any new tabs / popups
  browser.on('targetcreated', async target => {
    console.log('New target created:', target.type(), target.url());
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
    // The link text is '62388' or we can evaluate __doPostBack or click the anchor directly
    const initialFiles = fs.readdirSync(downloadDir);

    const clickResult = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr'));
      for (let r of rows) {
        if (r.innerText.includes('HES-Airtel')) {
          const links = Array.from(r.querySelectorAll('a'));
          // Let's find the link corresponding to Non Communicating > 7 Days
          for (let a of links) {
            if (a.href.includes('Non Communicating') && a.href.includes('>7 Days')) {
              a.click();
              return { clicked: true, href: a.href, text: a.innerText };
            }
          }
        }
      }
      return { clicked: false };
    });
    console.log('Click result:', clickResult);

    console.log('Waiting 10 seconds to observe navigation, popups, or downloads...');
    await new Promise(r => setTimeout(r, 10000));

    console.log('Current page URL after click:', page.url());
    console.log('Current page title:', await page.title());

    await page.screenshot({ path: path.join(__dirname, 'after_airtel_click.png'), fullPage: true });

    // Check all pages / tabs in browser
    const pages = await browser.pages();
    console.log('Total open pages:', pages.length);
    for (let i = 0; i < pages.length; i++) {
      console.log(`Page ${i}: ${pages[i].url()} | Title: ${await pages[i].title()}`);
    }

    // Check files in downloadDir
    const currentFiles = fs.readdirSync(downloadDir);
    console.log('Files in downloads directory:', currentFiles);

    // Also check what elements are on the current page (e.g. table, export button, etc.)
    const activePage = pages[pages.length - 1];
    const pageDetails = await activePage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('input, button, a')).filter(el => {
        const txt = (el.innerText || el.value || el.id || el.className || '').toLowerCase();
        return txt.includes('excel') || txt.includes('export') || txt.includes('download') || txt.includes('csv');
      }).map(el => ({
        tag: el.tagName,
        id: el.id,
        name: el.name,
        value: el.value,
        text: el.innerText,
        href: el.href,
        onclick: el.getAttribute('onclick')
      }));
      const tables = Array.from(document.querySelectorAll('table')).map(t => ({
        id: t.id,
        className: t.className,
        rows: t.querySelectorAll('tr').length
      }));
      return { btns, tables };
    });
    console.log('Active page elements:', JSON.stringify(pageDetails, null, 2));

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

run();
