import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// Start game
await page.getByRole("button", { name: /Begin Siege/i }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/td-playing.png" });

// Select Ember tower
await page.getByRole("button", { name: /Ember/i }).first().click();
await page.waitForTimeout(200);

const canvas = page.locator("canvas");
const box = await canvas.boundingBox();
if (!box) throw new Error("no canvas");

// Place towers on known buildable cells
// Map is 22x14 cells, path on row 2 mostly. Build above/below path.
const spots = [
  [0.22, 0.18],
  [0.28, 0.18],
  [0.35, 0.18],
  [0.42, 0.32],
  [0.50, 0.32],
  [0.58, 0.48],
  [0.30, 0.55],
  [0.45, 0.70],
];
for (const [fx, fy] of spots) {
  // re-select tower if needed
  const goldText = await page.locator("header").innerText();
  await page.getByRole("button", { name: /Ember|Frost|Volt|Iron/i }).nth(spots.indexOf([fx,fy]) % 4).click().catch(()=>{});
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(100);
  void goldText;
}

// Place a few more systematically
for (const kind of ["Frost", "Volt", "Iron"]) {
  await page.getByRole("button", { name: new RegExp(kind) }).first().click();
  await page.waitForTimeout(80);
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.18);
  await page.waitForTimeout(80);
  await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.48);
  await page.waitForTimeout(80);
}

await page.screenshot({ path: "/workspace/screenshots/td-built.png" });

// Start wave
const waveBtn = page.getByRole("button", { name: /Start Wave/i });
if (await waveBtn.count()) {
  await waveBtn.click();
}
await page.waitForTimeout(3000);
await page.screenshot({ path: "/workspace/screenshots/td-wave.png" });

// Open help
await page.getByRole("button", { name: /Matchups/i }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: "/workspace/screenshots/td-help.png" });
await page.getByRole("button", { name: /Close/i }).click();

// Mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/td-mobile.png" });

// Check for horizontal overflow
const overflow = await page.evaluate(() => {
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyText: document.body.innerText.slice(0, 300),
  };
});

console.log(JSON.stringify({ errors, overflow }, null, 2));
await browser.close();
