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
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.testPad = {
    index: 0,
    id: "Joy-Con L+R (STANDARD GAMEPAD Vendor: 057e)",
    mapping: "standard",
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  Object.defineProperty(navigator, "getGamepads", {
    value: () => (window.testPad.connected ? [window.testPad] : []),
  });
});
const wait = () => page.waitForTimeout(180);
async function tap(i) {
  await page.evaluate(
    (i) => (window.testPad.buttons[i] = { pressed: true, value: 1 }),
    i,
  );
  await wait();
  await page.evaluate(
    (i) => (window.testPad.buttons[i] = { pressed: false, value: 0 }),
    i,
  );
  await wait();
}
async function chooseMenu(name) {
  for (let i = 0; i < 12; i++) {
    if (
      await page.evaluate(
        (name) => document.activeElement?.getAttribute("data-menu") === name,
        name,
      )
    ) {
      await tap(1);
      return;
    }
    await tap(13);
  }
  throw new Error(
    `Menu option not reached: ${name}; ${JSON.stringify(await page.evaluate(() => ({ focus: document.activeElement?.outerHTML, dialogs: [...document.querySelectorAll("dialog[open]")].map((d) => d.id), mode: window.__builders.mode, status: document.querySelector("#gamepad-status").textContent })))}`,
  );
}
async function siteReady(kind) {
  await page.waitForFunction(
    (kind) =>
      window.__builders.mode === "site" &&
      document.querySelector("#loading").hidden &&
      (kind === "crane"
        ? window.__builders.craneMission
        : kind === "tower"
          ? window.__builders.towerMission
          : window.__builders.sim),
    kind,
    { timeout: 45000 },
  );
  await wait();
}
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__builders?.ready, null, {
    timeout: 30000,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await wait();
  assert.equal(
    await page.locator("body").getAttribute("data-input"),
    "gamepad",
  );
  assert.equal(await page.locator(".drive-forward kbd").innerText(), "ZR");
  assert.equal(
    await page.locator('[data-action="joint0"] kbd').first().innerText(),
    "左杆←",
  );
  assert.equal(await page.locator("#start kbd").innerText(), "A");
  await tap(13);
  assert.equal(
    await page.evaluate(() => window.__builders.selectedMachine),
    "crane",
  );
  await tap(1);
  assert.equal(
    await page.locator("#scene-dialog").evaluate((d) => d.open),
    true,
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.scene),
    "2",
  );
  await tap(0);
  assert.equal(
    await page.locator("#scene-dialog").evaluate((d) => d.open),
    false,
  );
  await tap(1);
  await tap(1);
  await siteReady("crane");
  assert.equal(await page.locator("#grab-key").innerText(), "A");
  await tap(0);
  assert.equal(await page.evaluate(() => window.__builders.paused), true);
  await chooseMenu("scenes");
  assert.equal(
    await page.locator("#scene-dialog").evaluate((d) => d.open),
    true,
  );
  await tap(0);
  assert.equal(await page.evaluate(() => window.__builders.paused), false);
  await tap(9);
  await chooseMenu("exit");
  await page.waitForFunction(() => window.__builders.mode === "showroom");
  await wait();
  await tap(12);
  assert.equal(
    await page.evaluate(() => window.__builders.selectedMachine),
    "excavator",
  );
  await tap(1);
  // Left stick navigates a dialog without operating the machine.
  const angle = await page.evaluate(() => window.__builders.machine.angles[0]);
  await page.evaluate(() => (window.testPad.axes[1] = 1));
  await wait();
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.scene),
    "1",
  );
  await page.evaluate(() => (window.testPad.axes[1] = 0));
  await wait();
  assert.equal(
    await page.evaluate(() => window.__builders.machine.angles[0]),
    angle,
  );
  await tap(12);
  await tap(1);
  await siteReady("excavator");
  await tap(9);
  await chooseMenu("scenes");
  await tap(13);
  await tap(1);
  await siteReady("excavator");
  assert.match(await page.locator("#mission-name").innerText(), /砂料厂/);
  await tap(9);
  await chooseMenu("reset");
  await siteReady("excavator");
  await tap(9);
  await chooseMenu("help");
  assert.equal(
    await page.locator("#help-dialog").evaluate((d) => d.open),
    true,
  );
  assert.equal(
    await page.locator("#help-dialog .help-grid").isVisible(),
    false,
  );
  await tap(1);
  assert.equal(
    await page.locator("#help-dialog").evaluate((d) => d.open),
    false,
  );
  await tap(9);
  await page.screenshot({ path: "test-results/gamepad-menu.png" });
  // Disconnect switches hints back and leaves a mouse-operable modal.
  await page.evaluate(() => (window.testPad.connected = false));
  await wait();
  assert.equal(
    await page.locator("body").getAttribute("data-input"),
    "keyboard",
  );
  assert.equal(await page.locator(".drive-forward kbd").innerText(), "W");
  await page.locator('[data-menu="resume"]').click();
  assert.equal(
    await page.locator("#game-menu-dialog").evaluate((d) => d.open),
    false,
  );
  await page.evaluate(() => (window.testPad.connected = true));
  await wait();
  await tap(9);
  await chooseMenu("exit");
  await page.waitForFunction(() => window.__builders.mode === "showroom");
  await wait();
  // Navigation remains usable where the sidebar is hidden.
  await page.setViewportSize({ width: 390, height: 844 });
  await tap(12);
  assert.equal(
    await page.evaluate(() => window.__builders.selectedMachine),
    "tower",
  );
  await tap(1);
  await tap(1);
  await siteReady("tower");
  await tap(9);
  await chooseMenu("roof");
  assert.equal(
    await page.locator("#game-menu-dialog").evaluate((d) => d.open),
    false,
  );
  await tap(9);
  await chooseMenu("exit");
  await page.waitForFunction(() => window.__builders.mode === "showroom");
  await page.screenshot({ path: "test-results/gamepad-navigation-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: automatic hints, controller-only machine and scene navigation, switch/restart/exit, help, disconnect fallback, tower views, mobile.",
  );
} finally {
  await browser.close();
}
