import test from "node:test";
import assert from "node:assert/strict";
import { GamepadInput, deadzone } from "../src/gamepad.ts";

const pad = () => ({
  index: 0,
  id: "Joy-Con L+R",
  connected: true,
  mapping: "standard",
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
});
const press = (p, i, value = 1) => {
  p.buttons[i] = { pressed: value > 0.5, value };
};

test("deadzone suppresses drift and preserves proportional speed", () => {
  assert.equal(deadzone(0.15), 0);
  assert.equal(deadzone(-1), -1);
  assert.equal(deadzone(1), 1);
  assert.ok(Math.abs(deadzone(0.59) - 0.5) < 1e-10);
});
test("connection, focus recovery and reconnection require neutral controls", () => {
  const reader = new GamepadInput(),
    p = pad();
  p.axes[0] = 1;
  assert.equal(reader.read([p], true).active, false);
  p.axes[0] = 0;
  assert.equal(reader.read([p], true).active, true);
  reader.read([p], false);
  p.axes[0] = 1;
  assert.equal(reader.read([p], true).active, false);
  p.axes[0] = 0;
  reader.read([p], true);
  assert.equal(reader.read([], true).active, false);
  p.axes[0] = 1;
  assert.equal(reader.read([p], true).active, false);
});
test("Nintendo A and plus trigger once per press", () => {
  const reader = new GamepadInput(),
    p = pad();
  reader.read([p], true);
  press(p, 1);
  press(p, 9);
  const result = reader.read([p], true);
  assert.equal(result.action, true);
  assert.equal(result.pause, true);
  assert.equal(reader.read([p], true).action, false);
  assert.equal(reader.read([p], true).pause, false);
});
test("leaving camera mode requires recentering", () => {
  const reader = new GamepadInput(),
    p = pad();
  reader.read([p], true);
  press(p, 3);
  p.axes[0] = 1;
  assert.equal(reader.read([p], true).camera, true);
  press(p, 3, 0);
  assert.equal(reader.read([p], true).active, false);
  p.axes[0] = 0;
  assert.equal(reader.read([p], true).active, true);
});
test("Xbox layout, analog triggers, and unsupported mappings", () => {
  const reader = new GamepadInput(),
    p = pad();
  p.id = "Xbox Controller";
  reader.read([p], true);
  press(p, 0);
  press(p, 7, 0.4);
  const result = reader.read([p], true);
  assert.equal(result.action, true);
  assert.equal(result.drive, 0.4);
  press(p, 2);
  assert.equal(reader.read([p], true).camera, true);
  p.mapping = "";
  assert.equal(reader.read([p], true).active, false);
});

test("partly held analog trigger prevents rearming", () => {
  const reader = new GamepadInput(),
    p = pad();
  p.buttons[7] = { pressed: false, value: 0.3 };
  assert.equal(reader.read([p], true).active, false);
  press(p, 7, 0);
  assert.equal(reader.read([p], true).active, true);
});
