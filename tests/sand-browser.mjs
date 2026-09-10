import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
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
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__builders?.ready);
  await page.evaluate(async () => {
    await window.__builders.enterSite(1);
    window.__builders.pause(true);
  });
  const report = await page.evaluate(() => {
    const g = window.__builders,
      m = g.machine,
      s = g.sim;
    const run = (input, time) => {
      const timings = [];
      for (let i = 0; i < Math.round(time / s.world.timestep); i++) {
        m.step(new Map(Object.entries(input)), s.world.timestep, true);
        s.step();
        timings.push(s.stepMs);
      }
      s.render(1);
      return timings;
    };
    const snap = (name) => ({
      name,
      angles: [...m.angles],
      position: m.root.position.toArray(),
      bucket: s.bucketVolume,
      ledger: s.ledger,
      valid: m.validPose(),
      blocked: m.blockedReason,
    });
    const samples = [snap("initial")],
      timings = [];
    timings.push(...run({ joint1: 1 }, 0.6));
    samples.push(snap("lower"));
    timings.push(...run({ drive: 1 }, 1.5));
    samples.push(snap("push"));
    timings.push(...run({ joint3: -1 }, 1.8));
    samples.push(snap("curl"));
    timings.push(...run({ joint1: -1 }, 3));
    timings.push(...run({}, 1));
    samples.push(snap("lift"));
    timings.push(...run({ drive: 1 }, 3));
    samples.push(snap("approach"));
    timings.push(...run({ joint2: -1 }, 1.3));
    samples.push(snap("extend-high"));
    timings.push(...run({ joint0: 1 }, 4.13));
    samples.push(snap("over-truck"));
    timings.push(...run({ joint3: 1 }, 4));
    timings.push(...run({ joint2: 1 }, 1.3));
    timings.push(...run({ joint1: 1 }, 0.6));
    timings.push(...run({}, 5));
    samples.push(snap("dump"));
    timings.sort((a, b) => a - b);
    return {
      samples,
      physicsMs: {
        p50: timings[Math.floor(timings.length * 0.5)],
        p95: timings[Math.floor(timings.length * 0.95)],
        max: timings.at(-1),
      },
    };
  });
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(
    "test-results/sand-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Physical haul:",
    JSON.stringify({
      lift: report.samples.find((s) => s.name === "lift").bucket,
      delivered: report.samples.at(-1).ledger.truck,
      physicsMs: report.physicsMs,
    }),
  );
  await page.screenshot({ path: "test-results/sand-yard.png" });
  assert.deepEqual(errors, []);
  assert.ok(
    report.samples.every((s) => Math.abs(s.ledger.error) < 1e-6),
    "volume conservation",
  );
  assert.ok(
    report.samples.find((s) => s.name === "lift").bucket > 0.01,
    "physical excavation must lift sand",
  );
  assert.ok(
    report.samples.at(-1).ledger.truck > 0.25,
    "physical haul must deliver a useful load into truck",
  );
  assert.ok(report.samples.at(-1).bucket < 0.03, "dump must empty bucket");

  // Independent filling fixture: remove sand from the actual field, release it
  // above the truck, then let collision + settling drive progress. Not a claim
  // that the player controller has executed every scoop needed to fill the truck.
  await page.evaluate(async () => {
    await window.__builders.enterSite(1);
    window.__builders.pause(true);
  });
  const fixture = await page.evaluate(() => {
    const g = window.__builders,
      s = g.sim,
      m = g.machine;
    const V = m.root.position.constructor;
    let source = 300,
      events = 0;
    const drop = (outside = false) => {
      for (let i = 0; i < 128; i++) {
        while (s.field.heights[source] < 0.04) source++;
        const v = s.field.take(source, 0.0078125),
          p = s.load.center(i);
        if (
          !s.spawn(new V(p.x, s.load.heightAt(i) + 0.6, outside ? -17 : p.z), v)
        )
          throw Error("Fixture particle capacity exceeded");
      }
      s.field.flush();
    };
    const run = () => {
      for (let i = 0; i < 4 / s.world.timestep; i++) {
        if (s.step().justCompleted) events++;
      }
      s.render(1);
    };
    drop(true);
    run();
    const outsideCount = s.tracker.count;
    const batches = [];
    for (let i = 0; i < 9; i++) {
      drop();
      run();
      batches.push(s.tracker.count);
    }
    const below = s.tracker.completed;
    drop();
    // UI loop handles the final falling load and completion event itself.
    g.pause(false);
    return { outsideCount, batches, below, events, ledger: s.ledger };
  });
  assert.equal(fixture.outsideCount, 0, "road spills do not count");
  assert.equal(fixture.below, false, "less than 80% must not finish");
  await page.waitForFunction(
    () => window.__builders.sim.tracker.completed,
    null,
    { timeout: 45000 },
  );
  await page
    .locator("#success-dialog")
    .waitFor({ state: "visible", timeout: 10000 });
  const completion = await page.evaluate(() => ({
    count: window.__builders.sim.tracker.count,
    ledger: window.__builders.sim.ledger,
  }));
  assert.ok(completion.count >= 80);
  assert.ok(Math.abs(completion.ledger.error) < 1e-6);
  await page.screenshot({ path: "test-results/sand-completion.png" });
  report.fillFixture = { ...fixture, completion };
  fs.writeFileSync(
    "test-results/sand-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Fill fixture:",
    JSON.stringify({ batches: fixture.batches, completion }),
  );
  await page.getByRole("button", { name: "继续自由探索" }).click();
  const oneShot = await page.evaluate(() => {
    window.__builders.pause(true);
    let events = 0;
    for (let i = 0; i < 240; i++)
      if (window.__builders.sim.step().justCompleted) events++;
    return events;
  });
  assert.equal(oneShot, 0, "completion is one-shot");
  await page.evaluate(async () => {
    await window.__builders.enterSite(1);
    window.__builders.pause(true);
  });
  const reset = await page.evaluate(() => ({
    count: window.__builders.sim.tracker.count,
    error: window.__builders.sim.ledger.error,
    grains: window.__builders.sim.grains.length,
  }));
  assert.deepEqual(reset, { count: 0, error: 0, grains: 0 });
  await page.evaluate(() => window.__builders.returnShowroom());
  assert.equal(
    await page.evaluate(() => window.__builders.machine.siteGuard),
    null,
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
