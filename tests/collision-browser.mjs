import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
// Collision geometry must not be sampled midway through the entry scale tween.
const page = await browser.newPage({ reducedMotion: "reduce" });
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__builders?.ready);
  await page.evaluate(async () => {
    await window.__builders.enterSite(0);
    window.__builders.pause(true);
  });
  const checks = await page.evaluate(() => {
    const m = window.__builders.machine;
    m.reset(true);
    m.root.position.set(-8, 0, 5);
    m.pose();
    let blocked = 0;
    for (let i = 0; i < 600; i++) {
      m.step(new Map([["drive", 1]]), 1 / 120, true);
      if (m.blocked) blocked++;
    }
    const travel = { blocked, x: m.root.position.x, y: m.root.position.y };
    // This lane was incorrectly blocked by the old 13.5m boundary.
    m.reset(true);
    m.root.position.set(8.3, 0, 5);
    m.pose();
    const nearWallValid = m.validPose();
    for (let i = 0; i < 240; i++)
      m.step(new Map([["drive", 1]]), 1 / 120, true);
    const wall = { reason: m.blockedReason, x: m.root.position.x };
    m.reset(true);
    for (let i = 0; i < 240; i++)
      m.step(new Map([["joint1", 1]]), 1 / 120, true);
    const ground = m.blockedReason,
      beforeSliding = m.root.position.x;
    for (let i = 0; i < 120; i++)
      m.step(
        new Map([
          ["joint1", 1],
          ["drive", 1],
        ]),
        1 / 120,
        true,
      );
    const groundSlide = m.root.position.x - beforeSliding;
    return {
      travel,
      nearWallValid,
      wall,
      ground,
      groundSlide,
      groundPoseValid: m.validPose(),
    };
  });
  assert.equal(checks.travel.blocked, 0);
  assert.equal(checks.travel.y, 0);
  assert.ok(checks.travel.x > -2.51);
  assert.equal(checks.nearWallValid, true);
  assert.equal(checks.wall.reason, "wall");
  assert.ok(checks.wall.x > 8.3 && checks.wall.x < 8.8);
  assert.equal(checks.ground, "ground");
  assert.equal(checks.groundPoseValid, true);
  assert.ok(
    checks.groundSlide > 1,
    "holding lower at ground contact must still allow forward travel",
  );
  await page.evaluate(() => {
    const g = window.__builders;
    g.machine.reset(true);
    g.sim.syncMachine(true);
    g.pause(false);
    document.querySelector("#toast").textContent = "";
  });
  await page.keyboard.down("KeyF");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyF");
  assert.equal(
    await page.locator("#toast").innerText(),
    "",
    "ground contact must not show a wall warning",
  );
  console.log(
    "PASS flat-ground travel, wall-face boundary, ground stop without misleading toast",
    checks,
  );
} finally {
  await browser.close();
}
