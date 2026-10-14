const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  console.log('Navigating to http://localhost:8098/ with cache disabled...');
  await page.setCacheEnabled(false);
  await page.goto('http://localhost:8098/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Capturing fresh screenshot of Executive Overview...');
  await page.screenshot({ path: path.join(__dirname, 'overview_fresh.png'), fullPage: false });

  // Click on Circle Analysis
  console.log('Clicking Circle Analysis tab...');
  await page.evaluate(() => {
    const tab = document.querySelector('[data-tab="tab-circle"]');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(__dirname, 'circle_fresh.png'), fullPage: false });

  // Click on Phase & Make
  console.log('Clicking Phase & Make tab...');
  await page.evaluate(() => {
    const tab = document.querySelector('[data-tab="tab-dimensions"]');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(__dirname, 'phase_make_fresh.png'), fullPage: false });

  // Click on Aging & Tech
  console.log('Clicking Aging & Tech tab...');
  await page.evaluate(() => {
    const tab = document.querySelector('[data-tab="tab-aging"]');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(__dirname, 'aging_tech_fresh.png'), fullPage: false });

  // Click on Meter Explorer
  console.log('Clicking Meter Explorer tab...');
  await page.evaluate(() => {
    const tab = document.querySelector('[data-tab="tab-meters"]');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(__dirname, 'meters_fresh.png'), fullPage: false });

  await browser.close();
  console.log('All fresh screenshots captured!');
}

main().catch(console.error);
