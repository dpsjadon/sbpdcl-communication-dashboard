const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USERNAME = 'MNG_DHARMENDRA';
const PASSWORD = 'Test@123';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  await page.goto('https://mdm.sbpdclinfra.in/SSO/LoginPage');
  await page.type('#tne', USERNAME);
  await page.type('#tpw', PASSWORD);
  await Promise.all([page.waitForNavigation().catch(()=>{}), page.click('#BtnSubmit')]);
  await page.goto('https://mdm.sbpdclinfra.in/MDMS/DashBoard/MainDashboard');
  await page.waitForSelector('#ContentPlaceHolder1_authsub_lblTC');

  console.log('Clicking lblTC (Total Consumers)...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    page.click('#ContentPlaceHolder1_authsub_lblTC')
  ]);
  console.log('Current URL:', page.url());
  const heading = await page.evaluate(() => document.body.innerText.split('\n').slice(0, 15).join('\n'));
  console.log('Heading:\n', heading);

  // Check download button
  const dlBtn = await page.$('#ContentPlaceHolder1_authsub_btnDownload');
  console.log('Download button present:', !!dlBtn);

  await browser.close();
}

main().catch(console.error);
