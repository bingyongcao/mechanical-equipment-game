import test from "node:test";
import assert from "node:assert/strict";
import { DeliveryTracker, rockerAngle } from "../src/logic.mjs";
const target = { x: 3, z: 4.6, radius: 2.1 };
const rock = (id = 0, extra = {}) => ({
  id,
  position: { x: 3, y: 0.2, z: 4.6 },
  velocity: { x: 0, y: 0, z: 0 },
  inBucket: false,
  ...extra,
});
test("only stable, unloaded rocks on the ground count; completion fires once", () => {
  const t = new DeliveryTracker(target, 2),
    rocks = [rock(0), rock(1)];
  for (let i = 0; i < 19; i++) assert.equal(t.update(rocks, 0.1).count, 0);
  assert.equal(t.update(rocks, 0.11).justCompleted, true);
  assert.equal(t.count, 2);
  assert.equal(t.update(rocks, 0.1).justCompleted, false);
});
test("flying rocks and rocks still in bucket never count", () => {
  const t = new DeliveryTracker(target, 1);
  for (let i = 0; i < 50; i++) {
    assert.equal(
      t.update([rock(0, { position: { x: 3, y: 3, z: 4.6 } })], 0.1).count,
      0,
    );
    assert.equal(t.update([rock(0, { inBucket: true })], 0.1).count, 0);
    assert.equal(
      t.update([rock(0, { velocity: { x: 0.5, y: 0, z: 0 } })], 0.1).count,
      0,
    );
  }
});
test("leaving target resets dwell and removes incomplete credit", () => {
  const t = new DeliveryTracker(target, 8);
  for (let i = 0; i < 25; i++) t.update([rock()], 0.1);
  assert.equal(t.count, 1);
  t.update([rock(0, { position: { x: 0, y: 0.2, z: 0 } })], 0.1);
  assert.equal(t.count, 0);
  t.update([rock()], 1.9);
  assert.equal(t.count, 0);
  t.update([rock()], 0.2);
  assert.equal(t.count, 1);
});
test("bucket four-bar closes across the full allowed range", () => {
  const r = 0.623938980864495,
    l = 0.7481310450955803,
    rest = -0.11242704509012448;
  for (let d = -48; d <= 48; d += 3) {
    const t = (d * Math.PI) / 180,
      angle = rest - rockerAngle(t);
    const bx = r * Math.cos(angle),
      by = r * Math.sin(angle),
      cx = 0.47 + 0.26 * Math.cos(t) + 0.03 * Math.sin(t),
      cy = -0.84 - 0.26 * Math.sin(t) + 0.03 * Math.cos(t);
    assert.ok(Math.abs(Math.hypot(cx - bx, cy - by) - l) < 1e-6);
  }
});
