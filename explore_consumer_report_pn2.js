const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function explore() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();

  try {
    console.log('Logging in...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME);
    await page.type('#tpw', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);

    console.log('Navigating to ConsumerReport?pn=2...');
    await page.goto('https://mdm.sbpdclinfra.in/MIS/ConsumerReport?pn=2', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 3000));

    console.log('Current URL:', page.url());
    await page.screenshot({ path: path.join(__dirname, 'consumer_report_pn2.png'), fullPage: true });

    // Extract all selects, options, tabs, radios, buttons
    const data = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select')).map(s => ({
        id: s.id,
        name: s.name,
        options: Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() }))
      }));

      const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        value: i.value,
        checked: i.checked
      }));

      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).map(b => ({
        id: b.id,
        value: b.value || b.innerText,
        type: b.type
      }));

      // Tabs or links
      const links = Array.from(document.querySelectorAll('a, span, div')).filter(el => {
        const txt = (el.innerText || '').toLowerCase();
        return txt.includes('hes') || txt.includes('communication') || txt.includes('last');
      }).map(el => ({
        tag: el.tagName,
        id: el.id,
        text: el.innerText.trim(),
        className: el.className
      }));

      return { selects, inputs, buttons, links };
    });

    fs.writeFileSync(path.join(__dirname, 'consumer_report_pn2_controls.json'), JSON.stringify(data, null, 2));
    console.log('Controls written to consumer_report_pn2_controls.json');

  } finally {
    await browser.close();
  }
}

explore()
  .then(() => console.log('Exploration done.'))
  .catch(e => console.error('Error:', e));
