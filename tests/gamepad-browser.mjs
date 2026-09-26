import { chromium } from "playwright";
import assert from "node:assert/strict";
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
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  Object.defineProperty(navigator, "getGamepads", {
    value: () => (window.testPad.connected ? [window.testPad] : []),
  });
});
const axis = async (i, v) =>
  page.evaluate(([i, v]) => (window.testPad.axes[i] = v), [i, v]);
const button = async (i, v) =>
  page.evaluate(
    ([i, v]) => (window.testPad.buttons[i] = { pressed: !!v, value: v }),
    [i, v],
  );
const settle = () => page.waitForTimeout(250);
const angle = () => page.evaluate(() => window.__builders.machine.angles[0]);
const view = () => page.evaluate(() => window.__builders.cameraView);
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__builders?.ready, null, {
    timeout: 30000,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await settle();
  const before = await angle();
  await axis(0, 0.7);
  await settle();
  assert.notEqual(await angle(), before, "analog input moves machine");
  await axis(0, 0.1);
  await settle();
  const stopped = await angle();
  await settle();
  assert.equal(await angle(), stopped, "deadzone stops drift");
  await axis(0, 0);
  await settle();
  await button(3, 1);
  await axis(2, 0.8);
  const cameraBefore = await view();
  await settle();
  assert.notDeepEqual(await view(), cameraBefore, "camera rotation");
  assert.equal(await angle(), stopped, "camera mode isolates machine");
  await axis(2, 0);
  await axis(0, 0.8);
  const panBefore = await view();
  await settle();
  assert.notDeepEqual((await view()).target, panBefore.target, "camera pan");
  await axis(0, 0);
  await button(7, 1);
  const zoomBefore = await view();
  await settle();
  assert.notDeepEqual(
    (await view()).position,
    zoomBefore.position,
    "camera zoom",
  );
  await button(7, 0);
  await axis(0, 1);
  await button(3, 0);
  await settle();
  assert.equal(await angle(), stopped, "camera release requires neutral");
  await axis(0, 0);
  await settle();
  await button(9, 1);
  await settle();
  assert.equal(await page.evaluate(() => window.__builders.paused), true);
  await settle();
  assert.equal(
    await page.evaluate(() => window.__builders.paused),
    true,
    "held pause does not repeat",
  );
  await button(9, 0);
  await settle();
  await button(9, 1);
  await settle();
  assert.equal(await page.evaluate(() => window.__builders.paused), false);
  await button(9, 0);
  await settle();
  await axis(0, 1);
  await settle();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await settle();
  const blurred = await angle();
  await settle();
  assert.equal(await angle(), blurred);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await settle();
  assert.equal(await angle(), blurred, "focus recovery requires neutral");
  await axis(0, 0);
  await settle();
  await axis(0, 1);
  await settle();
  await page.evaluate(() => (window.testPad.connected = false));
  await settle();
  const disconnected = await angle();
  await settle();
  assert.equal(await angle(), disconnected);
  await page.evaluate(() => (window.testPad.connected = true));
  await settle();
  assert.equal(await angle(), disconnected, "reconnect requires neutral");
  await axis(0, 0);
  await settle();
  for (const kind of ["crane", "tower"]) {
    await page.locator(`#choose-${kind}`).click();
    await settle();
    const start = await page.evaluate(
      (kind) =>
        kind === "crane"
          ? window.__builders.craneMachine.angles[0]
          : window.__builders.towerMachine.slew,
      kind,
    );
    await axis(0, 0.8);
    await settle();
    const end = await page.evaluate(
      (kind) =>
        kind === "crane"
          ? window.__builders.craneMachine.angles[0]
          : window.__builders.towerMachine.slew,
      kind,
    );
    assert.notEqual(end, start, `${kind} gamepad movement`);
    await axis(0, 0);
    await settle();
  }
  await page.locator("#choose-excavator").click();
  await page.locator("#start").click();
  await axis(0, 1);
  await settle();
  const modalAngle = await angle();
  await settle();
  assert.equal(await angle(), modalAngle, "modal blocks input");
  await axis(0, 0);
  await page.locator('[data-scene="0"]').click();
  await page.waitForFunction(
    () => window.__builders.sim && document.querySelector("#loading").hidden,
    null,
    { timeout: 30000 },
  );
  await settle();
  await button(1, 1);
  await settle();
  assert.equal(
    await page.evaluate(() => window.__builders.machine.scoopAssist),
    true,
    "A enables scoop assist",
  );
  await settle();
  assert.equal(
    await page.evaluate(() => window.__builders.machine.scoopAssist),
    true,
    "held A does not toggle repeatedly",
  );
  await button(1, 0);
  await settle();
  await button(1, 1);
  await settle();
  assert.equal(
    await page.evaluate(() => window.__builders.machine.scoopAssist),
    false,
  );
  await button(1, 0);
  await settle();
  const position = await page.evaluate(() =>
    window.__builders.machine.root.position.toArray(),
  );
  await button(7, 1);
  await settle();
  assert.notDeepEqual(
    await page.evaluate(() =>
      window.__builders.machine.root.position.toArray(),
    ),
    position,
    "ZR drives forward",
  );
  await button(7, 0);
  await settle();
  await button(1, 1);
  await settle();
  await button(1, 0);
  await settle();
  assert.equal(
    await page.evaluate(() => window.__builders.machine.scoopAssist),
    true,
  );
  await button(3, 1);
  await settle();
  assert.equal(
    await page.evaluate(() => window.__builders.machine.scoopAssist),
    false,
    "camera mode cancels automatic scoop movement",
  );
  await button(3, 0);
  await settle();
  await page.screenshot({ path: "test-results/gamepad.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Gamepad browser checks passed: analog, deadzone, camera, pause, focus, disconnect, three machines.",
  );
} finally {
  await browser.close();
}
