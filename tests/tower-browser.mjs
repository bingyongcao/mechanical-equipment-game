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
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
const report = {};
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__builders?.ready, null, {
    timeout: 60000,
  });
  await page.locator("#choose-tower").click();
  assert.equal(await page.locator(".part-label").count(), 11);
  assert.equal(await page.locator(".joint-row").nth(1).isHidden(), true);
  await page.locator('.part-label[data-part="变幅小车"]').click();
  assert.equal(
    await page.evaluate(() => window.__builders.towerMachine.selected),
    "变幅小车",
  );
  const start = await page.evaluate(
    () => window.__builders.towerMachine.radius,
  );
  await page.keyboard.down("t");
  await page.waitForTimeout(350);
  await page.keyboard.up("t");
  assert.ok(
    (await page.evaluate(() => window.__builders.towerMachine.radius)) >
      start + 0.15,
  );
  await page.screenshot({ path: "test-results/tower-showroom.png" });
  await page.locator("#start").click();
  for (const i of [0, 1, 2])
    assert.equal(await page.locator(`[data-scene="${i}"]`).isHidden(), true);
  await page.locator('[data-scene="3"]').click();
  await page.waitForFunction(
    () =>
      window.__builders?.towerMission &&
      document.querySelector("#loading").hidden,
    null,
    { timeout: 60000 },
  );
  assert.equal(await page.locator("#required").textContent(), "5");
  assert.equal(
    await page.evaluate(() => window.__builders.towerMission.cargo.length),
    15,
  );
  await page.screenshot({ path: "test-results/tower-site-initial.png" });
  // Install a deterministic operator. It only sends the same three axis inputs as
  // the player; it never teleports cargo, changes inventory, or increments floors.
  await page.evaluate(() => {
    const api = window.__builders;
    api.pause(true);
    const m = api.towerMission;
    const events = [];
    const tick = (action, sign, dt = 1 / 30) => {
      const r = m.step(new Map(action ? [[action, sign]] : []), dt);
      if (r.justBuilt || r.justCompleted) events.push(r);
      return r;
    };
    const move = (key, goal) => {
      const action = { ropeLength: "joint3", slew: "joint0", radius: "joint2" }[
        key
      ];
      const speed = { ropeLength: 4, slew: 0.32, radius: 3 }[key];
      for (let i = 0; i < 1800; i++) {
        let d = goal - m.machine[key];
        if (key === "slew") d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 0.004) return;
        const old = m.machine[key];
        tick(
          action,
          Math.sign(d) * (key === "radius" ? -1 : 1),
          Math.min(1 / 30, Math.abs(d) / speed),
        );
        if (Math.abs(m.machine[key] - old) < 1e-7) {
          if (key === "ropeLength" && m.candidate) return;
          throw Error(`Blocked ${key}: ${old} -> ${goal}: ${m.status}`);
        }
      }
      throw Error(`Timed out ${key}`);
    };
    const fly = (p) => {
      move("ropeLength", 2);
      move("slew", Math.atan2(-p.z, p.x));
      move("radius", Math.hypot(p.x, p.z));
    };
    const pick = (type) => {
      const c = m.cargo
        .filter((c) => c.type === type && !c.delivered)
        .sort((a, b) => b.index - a.index)[0];
      const p = c.root.position.clone().add(c.grab);
      fly(p);
      move("ropeLength", 30.35 - 0.96 - p.y);
      tick();
      if (m.candidate !== c) throw Error("Top material not selected");
      if (m.toggleGrab() !== "grabbed") throw Error("Grab failed");
      return c;
    };
    const deliver = (c, type = c.type) => {
      const p = m.padPosition(type);
      fly(p);
      move(
        "ropeLength",
        30.35 - 0.96 - (m.roofY + 0.035 + c.grab.y - c.bounds.min.y),
      );
      return m.toggleGrab();
    };
    window.towerOperator = { tick, move, fly, pick, deliver, events };
  });
  report.rules = await page.evaluate(() => {
    const m = window.__builders.towerMission,
      o = window.towerOperator;
    const c = o.pick(0);
    const index = c.index;
    const invalidAir = m.toggleGrab();
    if (!m.resetCargo()) throw Error("Return failed");
    const restored = c.root.position.distanceTo(c.original) < 1e-6;
    const again = o.pick(0);
    // The bundle is below the first roof railing: a low sweep toward the
    // building must stop before entering it, then lifting makes the route legal.
    o.move("ropeLength", 2);
    o.move("slew", -0.4);
    o.move("radius", 20);
    o.move("ropeLength", 26);
    let wallBlocked = false;
    for (let i = 0; i < 500; i++) {
      o.tick("joint0", 1);
      if (m.blockedReason.includes("楼")) {
        wallBlocked = true;
        break;
      }
    }
    if (!wallBlocked)
      throw Error("Low cargo crossed building without stopping");
    const heldBox = again.bounds.clone().translate(again.root.position);
    const outsideBuilding =
      heldBox.min.x >= 18 - 0.01 ||
      heldBox.max.x <= 6 + 0.01 ||
      heldBox.min.z >= 2 - 0.01 ||
      heldBox.max.z <= -8 + 0.01 ||
      heldBox.min.y >= m.roofY - 0.01;
    if (!outsideBuilding) throw Error("Cargo penetrated building");
    const wrongType = o.deliver(again, 1);
    const heldAfterWrong = m.held === again;
    const correct = o.deliver(again);
    o.tick();
    // A completed type cannot consume another unit during the current floor.
    const remaining = m.remaining.slice();
    const duplicate = m.cargo.find(
      (x) => x.type === 0 && !x.delivered && x.index === 3,
    );
    const p = duplicate.root.position.clone().add(duplicate.grab);
    o.fly(p);
    // Don't lower into the cage; near the top still falls within the grab sensor.
    o.move(
      "ropeLength",
      30.35 -
        0.96 -
        (duplicate.root.position.y + duplicate.bounds.max.y + 0.09),
    );
    o.tick();
    const duplicateRejected = !m.candidate;
    return {
      index,
      invalidAir,
      restored,
      wallBlocked,
      outsideBuilding,
      wrongType,
      heldAfterWrong,
      correct,
      remaining,
      duplicateRejected,
      count: m.count,
    };
  });
  assert.deepEqual(report.rules, {
    index: 4,
    invalidAir: "invalid-release",
    restored: true,
    wallBlocked: true,
    outsideBuilding: true,
    wrongType: "invalid-release",
    heldAfterWrong: true,
    correct: "released",
    remaining: [4, 5, 5],
    duplicateRejected: true,
    count: 0,
  });
  // Complete four rounds, then deliver the fifth round. Growth of the final
  // floor is driven by the real animation loop and real Y key below.
  for (let round = 0; round < 5; round++) {
    report[`round${round + 1}`] = await page.evaluate((round) => {
      const m = window.__builders.towerMission,
        o = window.towerOperator;
      for (let type = 0; type < 3; type++) {
        if (m.received[type]) continue;
        const c = o.pick(type);
        if (o.deliver(c) !== "released")
          throw Error(`Release failed: floor ${round}, type ${type}`);
      }
      if (m.phase !== "clearance") throw Error("Missing clearance phase");
      for (let i = 0; i < 60; i++) o.tick();
      if (m.count !== round) throw Error("Floor grew before hook clearance");
      if (round < 4) {
        for (let i = 0; i < 500 && m.count === round; i++) o.tick("joint3", -1);
        if (m.count !== round + 1) throw Error("Growth failed");
      }
      return {
        count: m.count,
        phase: m.phase,
        remaining: m.remaining,
        delivered: m.cargo.filter((c) => c.delivered).length,
      };
    }, round);
  }
  await page.evaluate(() => window.__builders.pause(false));
  await page.keyboard.down("y");
  await page.waitForFunction(
    () => window.__builders.towerMission.completed,
    null,
    { timeout: 15000 },
  );
  await page.keyboard.up("y");
  await page.waitForFunction(
    () => document.querySelector("#success-dialog").open,
    null,
    { timeout: 8000 },
  );
  assert.equal(await page.locator("#success-count").textContent(), "5");
  assert.equal(
    await page.evaluate(() => window.__builders.towerMission.count),
    5,
  );
  await page.locator("#keep-playing").click();
  await page.locator('[data-tower-view="roof"]').click();
  await page.screenshot({ path: "test-results/tower-complete.png" });
  report.final = await page.evaluate(() => ({
    count: window.__builders.towerMission.count,
    roof: window.__builders.towerMission.roofY,
    remaining: window.__builders.towerMission.remaining,
    calls: window.__builders.rendererInfo.calls,
  }));
  await page.waitForTimeout(2200);
  assert.equal(
    await page.locator("#success-dialog").evaluate((d) => d.open),
    false,
    "completion should only fire once",
  );
  await page.locator("#reset-machine").click();
  await page.waitForFunction(
    () =>
      window.__builders.towerMission?.count === 0 &&
      document.querySelector("#loading").hidden,
    null,
    { timeout: 60000 },
  );
  assert.deepEqual(
    await page.evaluate(() => window.__builders.towerMission.remaining),
    [5, 5, 5],
  );
  // Pointer cancellation / window blur must stop a held control.
  const button = page.locator('[data-action="joint0"][data-sign="1"]');
  await button.hover();
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await page.evaluate(() => window.__builders.held), 0);
  await page.mouse.up();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-tower-view="stock"]').click();
  const resizedFrame = await page.evaluate(
    () => window.__builders.rendererInfo.frame,
  );
  await page.waitForFunction(
    (frame) => window.__builders.rendererInfo.frame > frame + 2,
    resizedFrame,
  );
  await page.screenshot({
    path: "test-results/tower-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "no narrow-screen overflow",
  );
  assert.match(
    await page.locator("#compact-mission").textContent(),
    /加建.*钢筋/,
  );
  await page.locator("#return-showroom").click();
  assert.equal(await page.locator("#machine-select").isVisible(), true);
  await page.locator("#machine-select").selectOption("crane");
  assert.equal(
    await page.evaluate(() => window.__builders.selectedMachine),
    "crane",
  );
  assert.equal(await page.locator(".part-label").count(), 6);
  await page.locator("#machine-select").selectOption("excavator");
  assert.equal(await page.locator(".part-label").count(), 7);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "test-results/tower-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS: tower showroom, controls-only 15 deliveries, 5 floors, completion, reset and mobile navigation",
    JSON.stringify(report.final),
  );
} catch (e) {
  await page.screenshot({
    path: "test-results/tower-failure.png",
    fullPage: true,
  });
  console.error(JSON.stringify(report), errors);
  throw e;
} finally {
  await browser.close();
}
