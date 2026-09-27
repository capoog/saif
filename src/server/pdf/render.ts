import "server-only";

/**
 * HTML → PDF بـ Chromium headless. على Vercel بيستخدم @sparticuz/chromium،
 * ومحليًا CHROME_PATH (أو Chromium المثبت في بيئة التطوير).
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = (await import("puppeteer-core")).default;
  let executablePath: string;
  let args: string[];
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
  } else {
    executablePath = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
    args = ["--no-sandbox", "--disable-dev-shm-usage"];
  }
  const browser = await puppeteer.launch({ executablePath, args, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
