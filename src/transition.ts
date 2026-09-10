// Stage entry / exit effects for the excavator model. The transitions only touch
// visual presentation (model.position.y, model.scale, per-material opacity) and a
// short-lived dust ring that lives in world space. They never modify
// `machine.root.position` or `machine.root.rotation`, so physics and
// `poseBlockReason` keep reading the resting matrix.
import * as THREE from "three";
import type { Machine } from "./machine";

const reduced = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

type RingParticle = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
};
type Ring = {
  points: THREE.Points;
  particles: RingParticle[];
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  life: number;
  maxLife: number;
  origin: THREE.Vector3;
};
type Tween = {
  machine: Machine;
  kind: "in" | "out";
  duration: number;
  elapsed: number;
  snapped: boolean;
  done: boolean;
  materialKeys: THREE.MeshStandardMaterial[];
  originalTransparent: boolean[];
  ring: Ring | null;
};

const tweens: Tween[] = [];
const rings: Ring[] = [];
let installed = false;
let lastFrame = performance.now();

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
// Slight overshoot near the end so the model feels like it lands.
function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function collectMaterials(machine: Machine): {
  keys: THREE.MeshStandardMaterial[];
  transparent: boolean[];
} {
  const keys: THREE.MeshStandardMaterial[] = [];
  const seen = new Set<THREE.Material>();
  for (const m of machine.originals.keys()) {
    if (seen.has(m)) continue;
    seen.add(m);
    if ((m as THREE.MeshStandardMaterial).isMaterial) {
      keys.push(m as THREE.MeshStandardMaterial);
    }
  }
  const transparent = keys.map((m) => m.transparent);
  return { keys, transparent };
}

function spawnDustRing(
  scene: THREE.Scene,
  origin: THREE.Vector3,
  count: number,
  radius: number,
  duration: number,
  color: number,
  size: number,
): Ring {
  const positions = new Float32Array(count * 3);
  const particles: RingParticle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.12;
    const speed = radius * (0.9 + Math.random() * 0.4) / duration;
    const x = Math.cos(angle) * speed;
    const z = Math.sin(angle) * speed;
    const y = (Math.random() * 0.5 + 0.5) * (radius * 0.4 / duration);
    positions.set([origin.x, origin.y, origin.z], i * 3);
    particles.push({
      pos: new THREE.Vector3(origin.x, origin.y, origin.z),
      vel: new THREE.Vector3(x, y, z),
      life: duration,
      maxLife: duration,
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return { points, particles, geometry, material, life: duration, maxLife: duration, origin: origin.clone() };
}

function projectGround(machine: Machine, target: THREE.Vector3) {
  // Find the lowest world-Y of any mesh under `machine.model` so the dust ring
  // hugs the tracks instead of floating at the model's pivot.
  const box = new THREE.Box3().setFromObject(machine.model);
  if (!Number.isFinite(box.min.y)) {
    target.copy(machine.root.position);
    target.y = 0;
    return;
  }
  target.set(machine.root.position.x, box.min.y, machine.root.position.z);
}

function applyTransform(
  machine: Machine,
  y: number,
  scale: number,
  opacity: number,
  materials: THREE.MeshStandardMaterial[],
) {
  if (!machine.model) return;
  machine.model.position.y = y;
  machine.model.scale.setScalar(scale);
  for (const m of materials) {
    m.transparent = true;
    m.opacity = opacity;
    m.needsUpdate = true;
  }
}

function restore(
  machine: Machine,
  materials: THREE.MeshStandardMaterial[],
  originalTransparent: boolean[],
) {
  if (!machine.model) return;
  machine.model.position.set(0, 0, 0);
  machine.model.scale.setScalar(1);
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    m.opacity = 1;
    m.transparent = originalTransparent[i];
    m.needsUpdate = true;
  }
}

function tickTween(t: Tween, dt: number) {
  if (t.done) return;
  // Apply the "arriving" pose on the first tick so the tween animation is
  // visible immediately on the next paint, not on the synchronous caller.
  if (!t.snapped) {
    t.snapped = true;
    if (t.kind === "in") {
      applyTransform(t.machine, 2.4, 0.001, 0, t.materialKeys);
    }
  }
  const p = Math.min(1, t.elapsed / t.duration);
  const inScale = t.kind === "in" ? easeOutBack(p) : easeOutCubic(1 - p);
  const inY = t.kind === "in" ? 2.4 * (1 - easeOutCubic(p)) : 2.4 * easeOutCubic(p);
  // Opacity reaches 1 quickly during entry, fades linearly during exit.
  const opacity =
    t.kind === "in"
      ? Math.min(1, p * 2.4)
      : 1 - easeOutCubic(p);
  applyTransform(t.machine, inY, Math.max(0.001, inScale), opacity, t.materialKeys);
  // Landing dust at ~60% of entry; launch dust right at the start of exit.
  if (t.kind === "in" && !t.ring && p >= 0.6) {
    const origin = new THREE.Vector3();
    projectGround(t.machine, origin);
    t.ring = spawnDustRing(
      t.machine.root.parent as THREE.Scene,
      origin,
      28,
      1.4,
      0.85,
      0xd8c8a6,
      0.16,
    );
    rings.push(t.ring);
  } else if (t.kind === "out" && !t.ring) {
    const origin = new THREE.Vector3();
    projectGround(t.machine, origin);
    t.ring = spawnDustRing(
      t.machine.root.parent as THREE.Scene,
      origin,
      22,
      1.1,
      0.7,
      0xcfb98a,
      0.14,
    );
    rings.push(t.ring);
  }
  if (p >= 1) {
    restore(t.machine, t.materialKeys, t.originalTransparent);
    t.done = true;
  }
}

function tickRings(dt: number) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    const positions = r.geometry.attributes.position;
    for (let p = 0; p < r.particles.length; p++) {
      const particle = r.particles[p];
      const k = p * 3;
      // Quick settling so the ring expands fast then collapses onto the ground.
      particle.vel.y -= 4.2 * dt;
      particle.vel.x *= 1 - 1.6 * dt;
      particle.vel.z *= 1 - 1.6 * dt;
      particle.pos.x += particle.vel.x * dt;
      particle.pos.y += particle.vel.y * dt;
      particle.pos.z += particle.vel.z * dt;
      if (particle.pos.y < r.origin.y) particle.pos.y = r.origin.y;
      positions.setXYZ(p, particle.pos.x, particle.pos.y, particle.pos.z);
    }
    positions.needsUpdate = true;
    r.material.opacity = Math.max(0, r.life / r.maxLife) * 0.85;
    if (r.life <= 0) {
      r.points.removeFromParent();
      r.geometry.dispose();
      r.material.dispose();
      rings.splice(i, 1);
    }
  }
}

function loop() {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.08);
  lastFrame = now;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i];
    if (t.done) {
      tweens.splice(i, 1);
      continue;
    }
    t.elapsed += dt;
    tickTween(t, dt);
    if (t.done) tweens.splice(i, 1);
  }
  tickRings(dt);
  requestAnimationFrame(loop);
}

export function installTransitionLoop() {
  if (installed) return;
  installed = true;
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

function startTween(machine: Machine, kind: "in" | "out") {
  if (!machine.model) return;
  installTransitionLoop();
  if (reduced()) {
    restore(machine, Array.from(machine.originals.keys()) as THREE.MeshStandardMaterial[], []);
    return;
  }
  const { keys, transparent } = collectMaterials(machine);
  if (!keys.length) return;
  // If a tween is already running for this machine, restore it before starting
  // a new one so the two animations don't fight over the materials.
  for (const existing of tweens) {
    if (existing.machine === machine) {
      restore(existing.machine, existing.materialKeys, existing.originalTransparent);
      existing.done = true;
    }
  }
  const tween: Tween = {
    machine,
    kind,
    duration: kind === "in" ? 0.6 : 0.42,
    elapsed: 0,
    snapped: false,
    done: false,
    materialKeys: keys,
    originalTransparent: transparent,
    ring: null,
  };
  tweens.push(tween);
}

export function playEntry(machine: Machine) {
  startTween(machine, "in");
}
export function playExit(machine: Machine) {
  startTween(machine, "out");
}
export function isTransitioning(machine: Machine) {
  return tweens.some((t) => t.machine === machine && !t.done);
}
