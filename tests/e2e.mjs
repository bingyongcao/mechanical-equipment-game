import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(r.status() + " " + r.url());
});
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__builders?.ready, null, {
    timeout: 30000,
  });
  assert.equal(await page.locator(".part-label").count(), 7);
  const bucketLabel = page.locator('.part-label[data-part="铲斗"]');
  assert.equal(await bucketLabel.locator(".part-tooltip").isVisible(), false);
  await bucketLabel.hover();
  assert.equal(await bucketLabel.locator(".part-tooltip").isVisible(), true);
  assert.match(await bucketLabel.locator(".part-tooltip").innerText(), /铲斗/);
  await page.locator('.part-label[data-part="动臂"]').hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/showroom.png" });
  const raise = page.getByRole("button", { name: "动臂抬起 R", exact: true });
  await raise.hover();
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  const angle = await page.evaluate(() => window.__builders.machine.angles[1]);
  assert.ok(angle < -0.04);
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => window.__builders.machine.angles[1]),
    angle,
  );
  await page.keyboard.down("KeyG");
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.keyboard.up("KeyG");
  assert.equal(await page.evaluate(() => window.__builders.held), 0);
  await page.getByRole("button", { name: "机械复位", exact: true }).click();
  await page.getByRole("button", { name: "去工地试一试" }).click();
  await page.locator('[data-scene="0"]').click();
  await page.waitForFunction(
    () =>
      window.__builders?.sim?.rocks.length === 24 &&
      document.querySelector("#loading").hidden,
    null,
    { timeout: 30000 },
  );
  assert.equal(
    await page.evaluate(() => window.__builders.machine.validPose()),
    true,
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/site.png" });
  const assist = page.getByRole("button", { name: "贴地铲装", exact: true });
  await assist.click();
  await page.waitForFunction(() => window.__builders.machine.scoopAssistReady);
  assert.equal(await assist.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#assist-state").innerText(), "已贴地");
  await page.keyboard.down("KeyY");
  await page.waitForTimeout(150);
  await page.keyboard.up("KeyY");
  await page.waitForFunction(() => !window.__builders.machine.scoopAssist);
  assert.equal(
    await page.evaluate(() => window.__builders.machine.scoopAssist),
    false,
  );
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(300);
  await page.keyboard.up("KeyW");
  assert.ok(
    (await page.evaluate(() => window.__builders.machine.root.position.x)) >
      -5.9,
  );
  assert.equal(await page.locator("#pause").count(), 0);
  assert.equal(await page.locator("#return-showroom").isVisible(), true);
  await page.getByRole("button", { name: "切换施工场景" }).click();
  await page.locator('[data-scene="1"]').click();
  await page.waitForFunction(
    () =>
      window.__builders?.sim?.tracker.required === 80 &&
      document.querySelector("#loading").hidden,
  );
  assert.equal(
    await page.evaluate(() => window.__builders.sim.rocks.length),
    0,
  );
  await page.getByRole("button", { name: "返回机械展厅" }).click();
  assert.equal(await page.evaluate(() => window.__builders.sim), null);
  // Completion fixture: independently dropped dynamic rocks, no manipulation of mission credit.
  await page.evaluate(async () => {
    const g = window.__builders;
    await g.enterSite(0);
    const s = g.sim,
      t = s.tracker.target;
    for (let i = 0; i < 8; i++) {
      const b = s.rocks[i].body;
      b.setTranslation(
        {
          x: t.x + ((i % 4) - 1.5) * 0.48,
          y: 2.2,
          z: t.z + (Math.floor(i / 4) - 0.5) * 0.58,
        },
        true,
      );
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  });
  assert.equal(await page.locator("#delivered").innerText(), "0");
  await page.waitForFunction(() => window.__builders.burstCount > 0, null, {
    timeout: 15000,
  });
  await page.screenshot({ path: "test-results/fireworks.png" });
  await page
    .locator("#success-dialog")
    .waitFor({ state: "visible", timeout: 8000 });
  assert.equal(await page.locator("#success-count").innerText(), "8");
  await page.screenshot({ path: "test-results/success.png" });
  await page.getByRole("button", { name: "继续自由探索" }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#success-dialog").isVisible(), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.equal(await page.locator("#compact-mission").isVisible(), true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: model and labels; hold/release; blur; driving; both scenes; return placement; reset; physical completion fixture; fireworks; continue; mobile layout. No browser errors.",
  );
  fs.writeFileSync(
    "test-results/browser-report.json",
    JSON.stringify({ passed: true, errors, checks: 12 }, null, 2),
  );
} finally {
  await browser.close();
}
