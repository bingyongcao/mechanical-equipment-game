// Stage entry / exit effects for the excavator model.
//
// Modelled after the pattern used by D:/repos/anatomy/app/lib/three/viewer.ts:
// the entry pushes the model in from the camera's depth (scale 0.62 + z -1.6)
// with a `back.out`-style overshoot, while a separate opacity tween brings the
// materials up to full. The exit eases the model away with `power2.in`. On
// completion the model is restored to its resting transform and the materials
// are flipped back to `transparent: false` so the opaque fast path is reused.
//
// Unlike anatomy we do not tween the camera — `OrbitControls` owns that and
// any push would fight the user's orbit. Instead we add a small ground-hugging
// dust ring on landing to give the arrival a tactile beat, which anatomy
// doesn't need because its models float over a plinth.
import * as THREE from "three";
import type { Machine } from "./machine";

const reduced = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

type RingParticle = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
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
  // Snap-shot of the material flags we mutate so the tween can restore them
  // exactly to their pre-animation values when it finishes.
  materialKeys: THREE.MeshStandardMaterial[];
  originalTransparent: boolean[];
  originalOpacity: number[];
  ring: Ring | null;
};

const tweens: Tween[] = [];
const rings: Ring[] = [];
let installed = false;
let lastFrame = performance.now();

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
// Mirrors gsap's `back.out(config)` overshoot easing — same shape the anatomy
// viewer uses, with a slight pull past 1.0 before settling.
function easeOutBack(t: number, overshoot = 1.25) {
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function collectMaterials(machine: Machine): {
  keys: THREE.MeshStandardMaterial[];
  transparent: boolean[];
  opacity: number[];
} {
  const keys: THREE.MeshStandardMaterial[] = [];
  const seen = new Set<THREE.Material>();
  for (const m of machine.originals.keys()) {
    if (seen.has(m)) continue;
    seen.add(m);
    keys.push(m as THREE.MeshStandardMaterial);
  }
  return {
    keys,
    transparent: keys.map((m) => m.transparent),
    opacity: keys.map((m) => m.opacity),
  };
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
    const speed = (radius * (0.9 + Math.random() * 0.4)) / duration;
    const x = Math.cos(angle) * speed;
    const z = Math.sin(angle) * speed;
    const y = (Math.random() * 0.5 + 0.5) * ((radius * 0.4) / duration);
    positions.set([origin.x, origin.y, origin.z], i * 3);
    particles.push({
      pos: new THREE.Vector3(origin.x, origin.y, origin.z),
      vel: new THREE.Vector3(x, y, z),
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
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
  return {
    points,
    particles,
    geometry,
    material,
    life: duration,
    maxLife: duration,
    origin: origin.clone(),
  };
}

function projectGround(machine: Machine, target: THREE.Vector3) {
  // The dust ring hugs the tracks, not the model pivot, so we look up the
  // lowest world Y of any mesh under the model.
  const box = new THREE.Box3().setFromObject(machine.model);
  if (!Number.isFinite(box.min.y)) {
    target.copy(machine.root.position);
    target.y = 0;
    return;
  }
  target.set(machine.root.position.x, box.min.y, machine.root.position.z);
}

const REST = {
  position: new THREE.Vector3(0, 0, 0),
  scale: 1,
} as const;
// Entry pushes in from camera depth. Slightly more pronounced than anatomy
// because our showroom camera sits further back than anatomy's.
const ENTRY_FROM = {
  scale: 0.62,
  z: -1.6,
  y: 0.55,
  opacity: 0,
};
const EXIT_TO = {
  scale: 0.72,
  z: -1.0,
  y: 0.55,
  opacity: 0,
};

function applyEntryPose(
  machine: Machine,
  scale: number,
  z: number,
  y: number,
  opacity: number,
  materials: THREE.MeshStandardMaterial[],
) {
  if (!machine.model) return;
  machine.model.scale.setScalar(scale);
  machine.model.position.set(0, y, z);
  for (const m of materials) {
    m.transparent = true;
    m.opacity = opacity;
    // Keep depthWrite true so the partially-faded model still occludes things
    // behind it correctly; without this, the model would punch a hole while
    // it's still mostly invisible.
    m.depthWrite = true;
    m.needsUpdate = true;
  }
}

function applyExitPose(
  machine: Machine,
  scale: number,
  z: number,
  y: number,
  opacity: number,
  materials: THREE.MeshStandardMaterial[],
) {
  if (!machine.model) return;
  machine.model.scale.setScalar(scale);
  machine.model.position.set(0, y, z);
  for (const m of materials) {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = true;
    m.needsUpdate = true;
  }
}

function restore(
  machine: Machine,
  materials: THREE.MeshStandardMaterial[],
  originalTransparent: boolean[],
  originalOpacity: number[],
) {
  if (!machine.model) return;
  machine.model.position.copy(REST.position);
  machine.model.scale.setScalar(REST.scale);
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    m.opacity = originalOpacity[i];
    m.transparent = originalTransparent[i];
    m.needsUpdate = true;
  }
}

function tickTween(t: Tween, dt: number) {
  if (t.done) return;
  // Snap to the start pose on the first frame so the tween is visible
  // immediately. The synchronous caller returns with the model at its
  // resting transform, which keeps physics valid for any test that
  // synchronously inspects `__builders.machine` after `playEntry`.
  if (!t.snapped) {
    t.snapped = true;
    if (t.kind === "in") {
      applyEntryPose(
        t.machine,
        ENTRY_FROM.scale,
        ENTRY_FROM.z,
        ENTRY_FROM.y,
        ENTRY_FROM.opacity,
        t.materialKeys,
      );
    }
  }
  const p = Math.min(1, t.elapsed / t.duration);
  if (t.kind === "in") {
    // Scale uses back.out(1.25) for the landing overshoot. Position eases with
    // power3.out (easeOutCubic) so the model accelerates in then settles.
    // Opacity crosses 0.5 around p=0.35 so the model is mostly visible by the
    // time it reaches mid-flight.
    const scale = easeOutBack(p, 1.25);
    const z = ENTRY_FROM.z * (1 - easeOutCubic(p));
    const y = ENTRY_FROM.y * (1 - easeOutCubic(p));
    const opacity = Math.min(1, p * 1.9 + 0.05);
    applyEntryPose(t.machine, scale, z, y, opacity, t.materialKeys);
    // Dust ring at the landing beat (~65% of the entry). Anchored to the
    // world Y the model will rest at so the ring reads as "tracks hit ground".
    if (!t.ring && p >= 0.65) {
      const origin = new THREE.Vector3();
      projectGround(t.machine, origin);
      t.ring = spawnDustRing(
        t.machine.root.parent as THREE.Scene,
        origin,
        28,
        1.5,
        0.85,
        0xd8c8a6,
        0.16,
      );
      rings.push(t.ring);
    }
  } else {
    // Exit: power2.in (easeIn) so the model accelerates away. Opacity drops
    // slightly faster than scale so the model looks like it's receding into
    // shadow rather than just shrinking in place.
    const ease = easeInCubic(p);
    const scale = THREE.MathUtils.lerp(1, EXIT_TO.scale, ease);
    const z = THREE.MathUtils.lerp(0, EXIT_TO.z, ease);
    const y = THREE.MathUtils.lerp(0, EXIT_TO.y, ease);
    const opacity = 1 - easeOutCubic(p);
    applyExitPose(t.machine, scale, z, y, opacity, t.materialKeys);
    if (!t.ring) {
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
  }
  if (p >= 1) {
    restore(
      t.machine,
      t.materialKeys,
      t.originalTransparent,
      t.originalOpacity,
    );
    t.done = true;
  }
}

function easeInCubic(t: number) {
  return t * t * t;
}

function tickRings(dt: number) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    const positions = r.geometry.attributes.position;
    for (let p = 0; p < r.particles.length; p++) {
      const particle = r.particles[p];
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
    const { keys, transparent, opacity } = collectMaterials(machine);
    restore(machine, keys, transparent, opacity);
    return;
  }
  const { keys, transparent, opacity } = collectMaterials(machine);
  if (!keys.length) return;
  // If a previous tween is still running for the same machine, restore it
  // first so the new tween doesn't inherit half-finished state.
  for (const existing of tweens) {
    if (existing.machine === machine) {
      restore(
        existing.machine,
        existing.materialKeys,
        existing.originalTransparent,
        existing.originalOpacity,
      );
      existing.done = true;
    }
  }
  const tween: Tween = {
    machine,
    kind,
    duration: kind === "in" ? 0.8 : 0.34,
    elapsed: 0,
    snapped: false,
    done: false,
    materialKeys: keys,
    originalTransparent: transparent,
    originalOpacity: opacity,
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
