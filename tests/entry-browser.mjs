import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  for (const [width, height] of [
    [1366, 768],
    [1280, 720],
    [1024, 600],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://127.0.0.1:5173");
    await page.waitForFunction(() => window.__builders?.ready);
    assert.equal(await page.locator("#scoop-assist").isVisible(), false);
    if (width <= 560) await page.locator("#start").scrollIntoViewIfNeeded();
    const point = await page.locator("#start").evaluate((button) => {
      const r = button.getBoundingClientRect();
      const x = r.x + r.width / 2,
        y = r.y + r.height / 2;
      return {
        x,
        y,
        visible:
          r.top >= 0 &&
          r.bottom <= innerHeight &&
          button.contains(document.elementFromPoint(x, y)),
      };
    });
    assert.ok(
      point.visible,
      `Entry must be visible without scrolling at ${width}x${height}`,
    );
    await page.mouse.click(point.x, point.y);
    assert.ok(
      await page.locator("#scene-dialog").evaluate((dialog) => dialog.open),
    );
    await page.locator('[data-scene="0"]').click();
    await page.waitForFunction(() => window.__builders.mode === "site");
    await page.locator("#return-showroom").click();
    await page.waitForFunction(() => window.__builders.mode === "showroom");
    console.log(`Entry and return passed at ${width}x${height}`);
  }
} finally {
  await browser.close();
}
