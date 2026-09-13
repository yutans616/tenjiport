import { chromium } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const sizes = [
  { name: "375", width: 375, height: 900 },
  { name: "768", width: 768, height: 1000 },
  { name: "1440", width: 1440, height: 1000 },
];

async function main() {
  const browser = await chromium.launch();
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await page.goto(`${BASE_URL}/demo`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `/tmp/demo-lp-${size.name}.png`, fullPage: true });
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(size.name, "horizontalScroll:", hasHorizontalScroll);
    await page.close();
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
