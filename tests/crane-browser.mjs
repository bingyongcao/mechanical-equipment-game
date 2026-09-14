import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";

fs.mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__builders?.ready, null, { timeout: 30000 });
  await page.locator("#choose-crane").click();
  await page.waitForFunction(() => window.__builders?.selectedMachine === "crane");
  assert.equal(await page.evaluate(() => window.__builders.mode), "showroom");
  assert.equal(await page.locator(".part-label").count(), 6);
  assert.equal(await page.locator("#choose-crane").evaluate((e) => e.classList.contains("selected")), true);
  assert.equal(await page.locator("#choose-excavator").evaluate((e) => e.classList.contains("selected")), false);
  assert.equal(await page.locator(".crane-thumbnail").evaluate((e) => getComputedStyle(e).backgroundSize), "cover");
  const anchorAccuracy = await page.evaluate(() => window.__builders.craneMachine.annotationNodes.every(({ node }) => {
    const mesh = node.parent;
    mesh.geometry.computeBoundingBox();
    const center = mesh.geometry.boundingBox.getCenter(node.position.clone());
    return node.position.distanceTo(center) < 0.001;
  }));
  assert.equal(anchorAccuracy, true, "annotation anchors must use mesh geometry centers");
  await page.locator(".part-label").first().hover();
  assert.equal(await page.evaluate(() => window.__builders.craneMachine.selected), "", "hover must not highlight parts");
  const showroomPose = await page.evaluate(() => window.__builders.craneMachine.angles.slice());
  assert.equal(showroomPose[2], 0, "showroom boom must start fully retracted");
  assert.equal(showroomPose[3], 0.8, "showroom hook must start at the top");
  await page.waitForTimeout(900);
  await page.screenshot({ path: "test-results/crane-showroom.png" });
  await page.locator("#start").click();
  assert.equal(await page.locator('[data-scene="0"]').isHidden(), true);
  assert.equal(await page.locator('[data-scene="1"]').isHidden(), true);
  assert.equal(await page.locator('[data-scene="2"]').isVisible(), true);
  await page.locator('[data-scene="2"]').click();
  await page.waitForTimeout(3000);
  const grabKeyLayout = await page.locator("#scoop-assist").evaluate((button) => {
    const key = button.querySelector("#grab-key").getBoundingClientRect();
    const label = button.querySelector("strong").getBoundingClientRect();
    const state = button.querySelector("#assist-state").getBoundingClientRect();
    return { width: key.width, afterLabel: key.left >= label.right, beforeState: key.right <= state.left };
  });
  assert.ok(grabKeyLayout.width >= 38, "Space key background must cover its label");
  assert.equal(grabKeyLayout.afterLabel, true, "Space key must sit after the action label");
  assert.equal(grabKeyLayout.beforeState, true, "Space key must sit before the right-aligned state");
  if (!(await page.evaluate(() => Boolean(window.__builders?.craneMission))))
    console.error(await page.evaluate(() => ({ mode: window.__builders?.mode, toast: document.querySelector("#toast")?.textContent, loading: document.querySelector("#loading-message")?.textContent })));
  await page.waitForFunction(() => window.__builders?.craneMission, null, { timeout: 15000 });
  const initial = await page.evaluate(() => {
    const m = window.__builders.craneMission;
    return {
      variant: document.body.dataset.mode,
      cargo: m.cargo.length,
      nodes: ["J_Slew", "J_BoomPitch", "J_Telescope_1", "J_Hook", "A_CargoAttach"].every((n) => m.nodes.has(n)),
      driveDisabled: document.querySelector('[data-action="drive"]').disabled,
      labels: [...document.querySelectorAll(".joint-row .control-label strong")].map((x) => x.textContent),
      slew: m.slew,
      extension: m.extension,
      ropeLength: m.ropeLength,
    };
  });
  assert.equal(initial.variant, "site");
  assert.equal(initial.cargo, 5);
  assert.equal(initial.nodes, true);
  assert.equal(initial.driveDisabled, true);
  assert.deepEqual(initial.labels, ["回转平台", "吊臂变幅", "伸缩吊臂", "起升机构"]);
  assert.equal(initial.extension, 0, "mission boom must start fully retracted");
  assert.equal(initial.ropeLength, 0.8, "mission hook must start at the top");
  const cargoVisuals = await page.evaluate(() => window.__builders.craneMission.cargo.map((c) => ({
    visible: c.root.visible,
    meshes: (() => { let count = 0; c.root.traverse((o) => { if (o.isMesh && o.visible) count++; }); return count; })(),
    singleMaterials: (() => { let ok = true; c.root.traverse((o) => { if (o.isMesh && Array.isArray(o.material)) ok = false; }); return ok; })(),
    position: c.root.getWorldPosition(c.root.position.clone()).toArray(),
  })));
  assert.ok(cargoVisuals.every((c) => c.visible && c.meshes === 10 && c.singleMaterials));
  await page.screenshot({ path: "test-results/crane-site-initial.png" });
  await page.keyboard.down("q");
  await page.waitForTimeout(350);
  await page.keyboard.up("q");
  const afterSlew = await page.evaluate(() => window.__builders.craneMission.slew);
  assert.ok(afterSlew > initial.slew + 0.08, "Q must rotate the crane");
  const workflow = await page.evaluate(() => {
    const m = window.__builders.craneMission;
    const empty = new Map();
    const hookPosition = () => m.attach.getWorldPosition(m.attach.position.clone());
    const search = (target, targetY) => {
      let best = { d: Infinity, slew: 0, boom: 0, extension: 0 };
      for (let s = -Math.PI; s < Math.PI; s += Math.PI / 36)
        for (let b = 15; b <= 75; b += 3)
          for (let e = 0; e <= 6; e += 0.3) {
            m.slew = s;
            m.boom = b * Math.PI / 180;
            m.extension = e;
            m.pose();
            const p = hookPosition();
            const d = Math.hypot(p.x - target.x, p.z - target.z);
            if (d < best.d) best = { d, slew: s, boom: m.boom, extension: e };
          }
      Object.assign(m, best);
      m.pose();
      m.ropeLength += hookPosition().y - targetY;
      m.pose();
      m.step(empty, 0);
      return best.d;
    };
    const cargo = m.cargo[0];
    const grab = cargo.grab.getWorldPosition(cargo.grab.position.clone());
    const cargoDistance = search(grab, grab.y);
    const highlighted = m.candidate === cargo;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    const grabbed = m.held === cargo ? "grabbed" : "failed";
    m.ropeLength = 10;
    m.pose();
    m.step(empty, 0);
    const grounded = m.cargoGrounded;
    const groundedLength = m.ropeLength;
    m.step(new Map([["joint3", 1]]), 0.5);
    const loweringBlocked = Math.abs(m.ropeLength - groundedLength) < 0.002;
    const pad = m.targetPads[0].position;
    const padDistance = search(pad, 1.2);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    const released = m.held === null ? "released" : "failed";
    return { cargoDistance, padDistance, highlighted, grabbed, grounded, loweringBlocked, released, count: m.count };
  });
  assert.ok(workflow.cargoDistance < 0.62, "hook must reach cargo");
  assert.equal(workflow.highlighted, true);
  assert.equal(workflow.grabbed, "grabbed");
  assert.equal(workflow.grounded, true);
  assert.equal(workflow.loweringBlocked, true, "a grounded crate must not lower further");
  assert.ok(workflow.padDistance < 0.8, "hook must reach unload pad");
  assert.equal(workflow.released, "released");
  assert.equal(workflow.count, 1);
  await page.screenshot({ path: "test-results/crane-site.png" });
  assert.deepEqual(errors, []);
  console.log("PASS: crane scene, five cargo boxes, fixed chassis UI, controls and runtime nodes");
} catch (error) {
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
