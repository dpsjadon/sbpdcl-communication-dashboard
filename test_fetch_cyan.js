const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function run() {
  const downloadDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();

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

    console.log('Navigating to Cyan details page...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {}),
      page.evaluate(() => {
        const rows = document.querySelectorAll('#ContentPlaceHolder1_authsub_grd tr');
        rows[2].querySelectorAll('td')[5].querySelector('a').click();
      })
    ]);

    await new Promise(r => setTimeout(r, 3000));
    console.log('On Cyan details page:', page.url());

    // Extract all form inputs and cookies
    const formData = await page.evaluate(() => {
      const form = document.querySelector('form');
      const inputs = Array.from(form.querySelectorAll('input')).map(inp => ({
        name: inp.name,
        value: inp.value
      })).filter(inp => inp.name);
      return {
        action: form.action,
        inputs
      };
    });

    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log(`Extracted ${formData.inputs.length} form inputs and cookies.`);

    // Build URL-encoded body
    const params = new URLSearchParams();
    for (const inp of formData.inputs) {
      if (inp.name === 'ctl00$ctl00$ContentPlaceHolder1$authsub$btnDownload') {
        params.append(inp.name, 'Download');
      } else {
        params.append(inp.name, inp.value);
      }
    }
    // Ensure the download button param is present
    if (!params.has('ctl00$ctl00$ContentPlaceHolder1$authsub$btnDownload')) {
      params.append('ctl00$ctl00$ContentPlaceHolder1$authsub$btnDownload', 'Download');
    }

    console.log('Posting form directly with Node fetch...');
    const postRes = await fetch(formData.action || page.url(), {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': page.url()
      },
      body: params.toString()
    });

    console.log('Response status:', postRes.status);
    console.log('Content-Type:', postRes.headers.get('content-type'));
    console.log('Content-Disposition:', postRes.headers.get('content-disposition'));

    const arrayBuffer = await postRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const outFile = path.join(downloadDir, 'HES-Cyan-NonCommunicating-gt-7Day.xlsx');
    fs.writeFileSync(outFile, buffer);
    console.log(`Saved file successfully: ${outFile} (${buffer.length} bytes)`);

  } finally {
    await browser.close();
  }
}

run();
