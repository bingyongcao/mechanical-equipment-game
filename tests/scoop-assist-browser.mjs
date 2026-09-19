import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
// Fixed-step fixtures need the resting model, independent of entry tween timing.
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__builders?.ready);
  const results = [];
  for (const degrees of [0, -15, 15, -25, 25]) {
    results.push(
      await page.evaluate(async (degrees) => {
        const g = window.__builders;
        await g.enterSite(0);
        g.pause(true);
        const m = g.machine,
          s = g.sim,
          a = (degrees * Math.PI) / 180;
        m.heading = a;
        m.root.position.set(-6 * Math.cos(a), 0, 6 * Math.sin(a));
        m.pose();
        s.syncMachine(true);
        const advance = (input, seconds) => {
          for (let i = 0; i < seconds * 120; i++) {
            m.step(new Map(Object.entries(input)), 1 / 120, true);
            s.step();
          }
          s.render(1);
        };
        m.setScoopAssist(true);
        advance({}, 2);
        const aligned = {
          ready: m.scoopAssistReady,
          angles: m.angles.slice(),
          valid: m.validPose(),
        };
        advance({ drive: 1 }, 1.65);
        advance({ joint3: -1 }, 1.8);
        const exited = !m.scoopAssist;
        advance({ joint1: -1 }, 1.4);
        advance({}, 2);
        return {
          degrees,
          aligned,
          exited,
          loaded: s.rocks.filter((r) => m.bucketContains(r.mesh.position))
            .length,
          minY: Math.min(...s.rocks.map((r) => r.body.translation().y)),
          angles: m.angles,
        };
      }, degrees),
    );
  }
  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync(
    "test-results/scoop-assist-results.json",
    JSON.stringify(results, null, 2),
  );
  await page.screenshot({ path: "test-results/scoop-assist.png" });
  assert.deepEqual(errors, []);
  for (const r of results) {
    assert.equal(r.aligned.ready, true);
    assert.equal(r.aligned.valid, true);
    assert.equal(r.exited, true);
    assert.ok(r.loaded >= 2, "insufficient scoop: " + JSON.stringify(r));
    assert.ok(r.minY > 0);
  }
} finally {
  await browser.close();
}
