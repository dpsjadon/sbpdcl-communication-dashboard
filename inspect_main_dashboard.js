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
  await page.waitForSelector('#ContentPlaceHolder1_authsub_grd');
  const data = await page.evaluate(() => {
    const table = document.querySelector('#ContentPlaceHolder1_authsub_grd');
    return Array.from(table.querySelectorAll('tr')).map(r => Array.from(r.querySelectorAll('th,td')).map(c => c.innerText.trim()));
  });
  console.log(JSON.stringify(data, null, 2));

  // Also check if there are other tables or links for "Total Consumers"
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.href })).filter(a => a.text.length > 0);
  });
  console.log('Links:', links);

  await browser.close();
}

main().catch(console.error);
