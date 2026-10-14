const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function testReportView() {
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

    console.log('Selecting ddlReportType = 10 (Last Communication Information)...');
    // Check if selecting triggers a postback
    await page.select('#ContentPlaceHolder1_authsub_ddlReportType', '10');
    // In ASP.NET, often __doPostBack or change event triggers update panel
    await page.evaluate(() => {
      const sel = document.querySelector('#ContentPlaceHolder1_authsub_ddlReportType');
      if (sel) {
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    console.log('Waiting 5 seconds for update panel...');
    await new Promise(r => setTimeout(r, 5000));

    await page.screenshot({ path: path.join(__dirname, 'after_select_last_comm.png'), fullPage: true });

    // Inspect the page controls now
    const controlsAfter = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select')).map(s => ({
        id: s.id,
        name: s.name,
        value: s.value,
        options: Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() }))
      }));

      const buttons = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button')).map(b => ({
        id: b.id,
        value: b.value || b.innerText
      }));

      // Find any tabs or headings
      const tabs = Array.from(document.querySelectorAll('.nav-tabs li, .tab-pane, ul li a, div[id*="tab"], div[id*="Tab"]')).map(el => ({
        text: el.innerText.trim(),
        id: el.id
      }));

      return { selects, buttons, tabs };
    });

    console.log('Controls after selecting Last Communication Information:');
    console.log('Selects:', controlsAfter.selects.map(s => ({ id: s.id, val: s.value, options: s.options.map(o => o.text) })));
    console.log('Buttons:', controlsAfter.buttons);
    console.log('Tabs:', controlsAfter.tabs);

    // Now let's try selecting HES-Cyan (value 4) in ddlHES
    console.log('Selecting ddlHES = 4 (HES-Cyan)...');
    await page.select('#ContentPlaceHolder1_authsub_ddlHES', '4');
    await page.evaluate(() => {
      const sel = document.querySelector('#ContentPlaceHolder1_authsub_ddlHES');
      if (sel) sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking View button (#ContentPlaceHolder1_authsub_btnView)...');
    // Note: Clicking View might navigate or open new page or reload
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(e => console.log('Nav wait:', e.message)),
      page.click('#ContentPlaceHolder1_authsub_btnView')
    ]);

    await new Promise(r => setTimeout(r, 5000));
    console.log('URL after clicking View:', page.url());
    await page.screenshot({ path: path.join(__dirname, 'after_click_view_cyan.png'), fullPage: true });

    // Check what is on the page after clicking View
    const pageAfterView = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('input, button, a')).filter(el => {
        const txt = (el.innerText || el.value || el.id || '').toLowerCase();
        return txt.includes('download') || txt.includes('request') || txt.includes('export') || txt.includes('queue');
      }).map(el => ({
        tag: el.tagName,
        id: el.id,
        text: el.innerText || el.value,
        href: el.href
      }));

      return {
        title: document.title,
        textSnippet: document.body.innerText.slice(0, 1000),
        downloadElements: btns
      };
    });

    console.log('Page after View details:');
    console.log('Title:', pageAfterView.title);
    console.log('Download elements:', pageAfterView.downloadElements);
    console.log('Text preview:', pageAfterView.textSnippet.slice(0, 400));

  } finally {
    await browser.close();
  }
}

testReportView()
  .then(() => console.log('Done testReportView.'))
  .catch(e => console.error('Error testReportView:', e));
