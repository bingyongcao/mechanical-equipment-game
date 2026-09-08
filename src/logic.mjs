export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function rockerAngle(t, r = 0.623938980864495, l = 0.7481310450955803) {
  const x = 0.47 + 0.26 * Math.cos(t) + 0.03 * Math.sin(t);
  const y = -0.84 - 0.26 * Math.sin(t) + 0.03 * Math.cos(t);
  return (
    -0.11242704509012448 -
    Math.atan2(y, x) -
    Math.acos(
      clamp(
        (r * r - l * l + x * x + y * y) / (2 * r * Math.hypot(x, y)),
        -1,
        1,
      ),
    )
  );
}
export function terrainHeight(x, z) {
  // Rendering, rigid-body terrain and machine support share one level surface.
  return 0;
}
export function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class DeliveryTracker {
  constructor(target, required = 8) {
    this.target = target;
    this.required = required;
    this.stable = new Map();
    this.count = 0;
    this.completed = false;
  }
  update(stones, dt) {
    let count = 0;
    for (const s of stones) {
      const p = s.position,
        v = s.velocity;
      const valid =
        Math.hypot(p.x - this.target.x, p.z - this.target.z) <
          this.target.radius - 0.25 &&
        p.y < terrainHeight(p.x, p.z) + 0.9 &&
        Math.hypot(v.x, v.y, v.z) < 0.16 &&
        !s.inBucket;
      const time = valid ? (this.stable.get(s.id) || 0) + dt : 0;
      this.stable.set(s.id, time);
      if (time >= 2) count++;
    }
    this.count = count;
    const justCompleted = !this.completed && count >= this.required;
    if (justCompleted) this.completed = true;
    return { count, completed: this.completed, justCompleted };
  }
}
