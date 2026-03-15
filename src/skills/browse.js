import { chromium } from 'playwright';

let browser = null;
let page = null;

export async function launchBrowser({ headless = true } = {}) {
  browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  page = await context.newPage();
  console.log('[browser] launched');
  return page;
}

export async function navigateTo(url) {
  if (!page) throw new Error('Browser not launched. Call launchBrowser() first.');
  await page.goto(url, { waitUntil: 'networkidle' });
  console.log(`[browser] navigated to ${url}`);
  return page.url();
}

export async function getPageContent() {
  if (!page) throw new Error('Browser not launched.');

  // Get the visible text
  const text = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script, style, noscript');
    scripts.forEach(s => s.remove());
    return document.body.innerText.trim().slice(0, 1500); // was 3000, now 1500
  });

  // Get interactive elements — what can the agent actually DO on this page?
  const interactive = await page.evaluate(() => {
    const elements = [];
    document.querySelectorAll('input, button, a, select, textarea, [role="button"]').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // skip hidden elements
      elements.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        placeholder: el.placeholder || null,
        text: el.innerText?.trim().slice(0, 50) || null,
        href: el.href || null,
        id: el.id || null,
        name: el.name || null,
        ariaLabel: el.getAttribute('aria-label') || null,
      });
    });
    return elements.slice(0, 15); // top 15 interactive elements
  });

  return { text, interactive };
}

export async function takeScreenshot(filename = 'screenshot.png') {
  if (!page) throw new Error('Browser not launched.');
  const path = `reports/${filename}`;
  await page.screenshot({ path, fullPage: false });
  console.log(`[browser] screenshot saved to ${path}`);
  return path;
}

export async function performAction(action) {
  if (!page) throw new Error('Browser not launched.');

  // Agent calls this with structured action objects
  switch (action.type) {
    case 'click':
      await page.click(action.selector);
      console.log(`[browser] clicked: ${action.selector}`);
      break;
    case 'fill':
      await page.fill(action.selector, action.value);
      console.log(`[browser] filled: ${action.selector} = "${action.value}"`);
      break;
    case 'press':
      await page.press(action.selector, action.key);
      console.log(`[browser] pressed: ${action.key} on ${action.selector}`);
      break;
    case 'wait':
      await page.waitForTimeout(action.ms || 1000);
      break;
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }

  // After every action, return updated page state
  await page.waitForLoadState('networkidle').catch(() => {}); // don't throw if no navigation
  return getPageContent();
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    console.log('[browser] closed');
  }
}