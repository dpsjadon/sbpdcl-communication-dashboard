const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = process.env.SBPDCL_USER || 'MNG_DHARMENDRA';
const PASSWORD = process.env.SBPDCL_PASS || 'Test@123';

async function explore() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();

  try {
    console.log('Logging in to MDMS...');
    await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('#tne', USERNAME);
    await page.type('#tpw', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
      page.click('#BtnSubmit')
    ]);
    console.log('Logged in successfully');

    const inspectUrl = async (url, label) => {
      console.log(`\n=================== Inspecting ${label}: ${url} ===================`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise(r => setTimeout(r, 2000));
      const info = await page.evaluate(() => {
        const title = document.title;
        const selects = Array.from(document.querySelectorAll('select')).map(s => ({
          id: s.id,
          name: s.name,
          options: Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() }))
        }));
        const buttons = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button')).map(b => ({
          id: b.id,
          value: b.value || b.innerText,
          visible: b.offsetParent !== null
        }));
        const tables = Array.from(document.querySelectorAll('table')).map(t => ({
          id: t.id,
          rows: t.querySelectorAll('tr').length,
          headers: Array.from(t.querySelectorAll('th')).map(th => th.innerText.trim())
        }));
        return { title, selects, buttons, tables };
      });
      console.log(JSON.stringify(info, null, 2));
      return info;
    };

    const dtr1 = await inspectUrl('https://mdm.sbpdclinfra.in/MIS/DTRReport?pn=1', 'DTRReport pn=1 (DT Master)');
    const dtr2 = await inspectUrl('https://mdm.sbpdclinfra.in/MIS/DTRReport?pn=2', 'DTRReport pn=2 (DT Non/Never Comm)');
    const fdr1 = await inspectUrl('https://mdm.sbpdclinfra.in/MIS/FeederReport?pn=1', 'FeederReport pn=1 (Feeder Master)');
    const fdr2 = await inspectUrl('https://mdm.sbpdclinfra.in/MIS/FeederReport?pn=2', 'FeederReport pn=2 (Feeder Non/Never Comm)');
    const dlq = await inspectUrl('https://mdm.sbpdclinfra.in/MIS/DownloadRequest.aspx', 'Download Queue');

    fs.writeFileSync(path.join(__dirname, 'dt_feeder_controls.json'), JSON.stringify({ dtr1, dtr2, fdr1, fdr2, dlq }, null, 2));
    console.log('Saved dt_feeder_controls.json');

  } catch (err) {
    console.error('Error during explore:', err);
  } finally {
    await browser.close();
  }
}

explore();
