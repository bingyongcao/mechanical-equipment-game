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
page.on("pageerror", (e) => console.log("ERROR", e.message));
await page.goto("http://127.0.0.1:5173");
await page.waitForFunction(() => window.__builders?.ready);
await page.evaluate(async () => {
  const g = window.__builders;
  await g.enterSite(0);
  g.pause(true);
});
const results = await page.evaluate(() => {
  const g = window.__builders,
    m = g.machine,
    s = g.sim;
  function advance(input, seconds) {
    for (let i = 0; i < seconds * 120; i++) {
      m.step(new Map(Object.entries(input)), 1 / 120, true);
      s.step();
    }
    s.render(1);
  }
  const report = () => ({
    angles: m.angles.slice(),
    position: m.root.position.toArray(),
    loaded: s.rocks
      .filter((r) => m.bucketContains(r.mesh.position))
      .map((r) => ({ id: r.id, p: r.mesh.position.toArray() })),
    delivered: s.tracker.count,
    minY: Math.min(...s.rocks.map((r) => r.body.translation().y)),
  });
  let results = [];
  advance({ joint1: 1 }, 0.25);
  results.push({ name: "lower", ...report() });
  advance({ drive: 1 }, 1.6);
  results.push({ name: "push", ...report() });
  advance({ joint3: -1 }, 1.8);
  results.push({ name: "curl", ...report() });
  advance({ joint1: -1 }, 1.5);
  advance({}, 2);
  results.push({ name: "lift", ...report() });
  advance({ drive: 1 }, 2.4);
  advance({ joint0: -1 }, 2.0);
  advance({}, 1);
  results.push({ name: "carry", ...report() });
  advance({ joint3: 1 }, 4.0);
  advance({ joint1: 1 }, 0.6);
  advance({}, 8);
  results.push({ name: "dump", ...report() });
  return results;
});
assert.ok(
  results.find((r) => r.name === "lift").loaded.length >= 2,
  "bucket must physically lift multiple stones",
);
assert.ok(
  results.find((r) => r.name === "carry").loaded.length >= 2,
  "stones must stay in bucket through translation and slew",
);
assert.ok(
  results.find((r) => r.name === "dump").delivered >= 2,
  "unloaded stones must settle in target",
);
assert.equal(
  results.find((r) => r.name === "dump").loaded.length,
  0,
  "dump must empty the bucket",
);
assert.ok(
  results.every((r) => r.minY > 0),
  "stones must not fall through ground",
);
fs.writeFileSync(
  "test-results/physical-haul.json",
  JSON.stringify(results, null, 2),
);
console.log(
  "PASS physical scoop → lift → drive → slew → dump:",
  results.at(-1).delivered,
  "rocks delivered",
);
await page.screenshot({ path: "test-results/scoop.png" });
await browser.close();
