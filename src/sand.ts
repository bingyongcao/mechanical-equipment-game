import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Simulation } from "./physics";
import { SandField } from "./sand-field";
import { TRUCK, SAND_WALLS } from "./sand-site";
import truckPhysics from "../assets/dump-truck/dump-truck.physics.json";

type Grain = {
  body: RAPIER.RigidBody;
  volume: number;
  radius: number;
  stable: number;
  previous: THREE.Vector3;
};
export class SandSimulation extends Simulation {
  readonly kind = "sand";
  field!: SandField;
  load!: SandField;
  grains: Grain[] = [];
  maxGrains = 1600;
  initialVolume = 0;
  escapedVolume = 0;
  extractedVolume = 0;
  stepMs = 0;
  peakGrains = 0;
  capacity = truckPhysics.bed.capacityM3;
  grainMesh!: THREE.InstancedMesh;
  previousBucket = new THREE.Vector3();
  previousBucketRotation = new THREE.Quaternion();
  tick = 0;
  stableLoadTime = 0;
  solidBoxes: THREE.Box3[] = [];
  async init() {
    await super.init(1);
    this.world.timestep = 1 / 60;
    this.tracker.required = 80;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(60, 0.15, 60)
        .setTranslation(0, -0.15, 0)
        .setFriction(0.9)
        .setCollisionGroups(0x00040001),
    );
    const solid = (center: number[], half: number[]) => {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(...(half as [number, number, number]))
          .setTranslation(...(center as [number, number, number]))
          .setFriction(0.8)
          .setCollisionGroups(0x00040001),
      );
      this.solidBoxes.push(
        new THREE.Box3(
          new THREE.Vector3(...(center as [number, number, number])).sub(
            new THREE.Vector3(...(half as [number, number, number])),
          ),
          new THREE.Vector3(...(center as [number, number, number])).add(
            new THREE.Vector3(...(half as [number, number, number])),
          ),
        ),
      );
    };
    for (const w of SAND_WALLS)
      solid([w.center[0], 0.675, w.center[2]], [w.half[0], 0.675, w.half[2]]);
    for (const c of truckPhysics.colliders)
      solid(
        [c.center[0] + TRUCK.x, c.center[1], c.center[2] + TRUCK.z],
        c.halfExtents,
      );
    this.field = new SandField(this.world, 56, 44, 0.5, 0.5, -14, -11, 0, 0.6);
    this.load = new SandField(
      this.world,
      16,
      8,
      0.25,
      0.275,
      -3,
      TRUCK.z - 1.1,
      1.55,
      0,
      2.95,
    );
    this.initialVolume = this.field.volume;
    this.group.add(this.field.mesh, this.load.mesh);
    this.grainMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: "#d6b77f", roughness: 1 }),
      this.maxGrains,
    );
    this.grainMesh.count = 0;
    this.grainMesh.frustumCulled = false;
    this.grainMesh.castShadow = true;
    this.group.add(this.grainMesh);
    this.machine.supportHeight = (x, z) => {
      // Rigid level support approximation: use the highest of six track samples.
      // Pitch, rutting and compaction are outside this technical prototype.
      let h = 0;
      for (const dx of [-1.5, 0, 1.5])
        for (const dz of [-0.8, 0.8]) {
          const a = this.machine.heading;
          h = Math.max(
            h,
            this.field.height(
              x + dx * Math.cos(a) + dz * Math.sin(a),
              z - dx * Math.sin(a) + dz * Math.cos(a),
            ),
          );
        }
      return h;
    };
    this.machine.siteGuard = () => this.guard();
    this.machine.root.position.set(-6, 0.6, -8);
    this.machine.pose();
    this.syncMachine(true);
    this.previousBucket.copy(
      this.machine.node("J_Bucket").getWorldPosition(new THREE.Vector3()),
    );
    this.previousBucketRotation.copy(
      this.machine.node("J_Bucket").getWorldQuaternion(new THREE.Quaternion()),
    );
  }
  guard(): "ground" | "wall" | "office" | null {
    const pos = this.machine.root.position;
    if (Math.abs(pos.x) > 12.2 || Math.abs(pos.z) > 9.2) return "wall";
    const p = new THREE.Vector3();
    for (const c of this.machine.colliders) {
      const box = new THREE.Box3();
      for (const v of c.vertices) {
        p.fromArray(v).applyMatrix4(this.machine.node(c.parent).matrixWorld);
        if (p.y < 0.004) return "ground";
        const loadCell = this.load.index(p.x, p.z);
        if (loadCell >= 0 && p.y < this.load.heightAt(loadCell)) return "wall";
        if (
          this.grains.length > this.maxGrains - 64 &&
          this.field.index(p.x, p.z) >= 0 &&
          p.y < this.field.height(p.x, p.z)
        )
          return "ground";
        box.expandByPoint(p);
      }
      if (this.solidBoxes.some((s) => s.intersectsBox(box))) return "wall";
    }
    return null;
  }
  spawn(p: THREE.Vector3, volume: number) {
    if (this.grains.length >= this.maxGrains) return false;
    // One coarse sphere represents a parcel of dry sand at fixed packing fraction.
    const radius = Math.cbrt((volume * 0.64 * 3) / (4 * Math.PI));
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setCcdEnabled(true)
        .setLinearDamping(0.16)
        .setAngularDamping(0.5),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(radius)
        .setMass(volume * 1600)
        .setFriction(0.95)
        .setRestitution(0.01)
        .setCollisionGroups(0x00010007),
      body,
    );
    this.grains.push({ body, volume, radius, stable: 0, previous: p.clone() });
    this.peakGrains = Math.max(this.peakGrains, this.grains.length);
    return true;
  }
  excavate() {
    const node = this.machine.node("J_Bucket"),
      center = node.getWorldPosition(new THREE.Vector3());
    const rotation = node.getWorldQuaternion(new THREE.Quaternion());
    const moved =
      center.distanceTo(this.previousBucket) +
      rotation.angleTo(this.previousBucketRotation);
    this.previousBucket.copy(center);
    this.previousBucketRotation.copy(rotation);
    if (moved < 1e-5 || this.grains.length > this.maxGrains - 64) return;
    // Activate in-place material at the cutting edge. No attachment,
    // teleport-to-bucket, material creation or scoring occurs here.
    const box = new THREE.Box3();
    for (const c of this.machine.colliders.filter(
      (c) =>
        c.name.startsWith("COL_Bucket tooth") ||
        c.name === "COL_Bucket cutting edge",
    ))
      for (const v of c.vertices)
        box.expandByPoint(
          new THREE.Vector3().fromArray(v).applyMatrix4(node.matrixWorld),
        );
    box.expandByScalar(0.16);
    const minX = Math.max(0, Math.floor((box.min.x - this.field.x0) / 0.5)),
      maxX = Math.min(55, Math.floor((box.max.x - this.field.x0) / 0.5));
    const minZ = Math.max(0, Math.floor((box.min.z - this.field.z0) / 0.5)),
      maxZ = Math.min(43, Math.floor((box.max.z - this.field.z0) / 0.5));
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++) {
        if (this.grains.length > this.maxGrains - 4) return;
        const i = z * 56 + x,
          h = this.field.heights[i];
        if (h < 0.02 || h < box.min.y || box.max.y < 0) continue;
        const depth = Math.min(0.125, h),
          v = this.field.take(i, depth * 0.25),
          p = this.field.center(i);
        for (const dx of [-0.125, 0.125])
          for (const dz of [-0.125, 0.125])
            this.spawn(
              new THREE.Vector3(p.x + dx, h - depth / 2, p.z + dz),
              v / 4,
            );
        this.extractedVolume += v;
      }
  }
  step() {
    const start = performance.now(),
      dt = this.world.timestep;
    this.elapsed += dt;
    this.tick++;
    this.syncMachine();
    this.excavate();
    if (this.tick % 6 === 0) {
      this.field.relax();
      this.load.relax();
    }
    this.field.flush();
    this.load.flush();
    for (const g of this.grains) g.previous.copy(g.body.translation());
    this.world.step();
    const point = new THREE.Vector3();
    for (let i = this.grains.length - 1; i >= 0; i--) {
      const g = this.grains[i],
        p = g.body.translation(),
        v = g.body.linvel();
      point.copy(p);
      const inBucket = this.machine.bucketContains(point);
      const speed = Math.hypot(v.x, v.y, v.z);
      const loadIndex = this.load.index(p.x, p.z),
        fieldIndex = this.field.index(p.x, p.z);
      const fullyInTruck =
        loadIndex >= 0 &&
        p.y > 1.55 &&
        p.x - g.radius >= -3 &&
        p.x + g.radius <= 1 &&
        p.z - g.radius >= TRUCK.z - 1.1 &&
        p.z + g.radius <= TRUCK.z + 1.1;
      const target = fullyInTruck
        ? this.load
        : fieldIndex >= 0
          ? this.field
          : null;
      const index = target === this.load ? loadIndex : fieldIndex;
      const nearSurface =
        target && Math.abs(p.y - g.radius - target.heightAt(index)) < 0.06;
      g.stable = !inBucket && speed < 0.22 && nearSurface ? g.stable + dt : 0;
      // Leave space for the full parcel below the rim; overflowing sand stays dynamic.
      if (g.stable > 0.7 && target && target.deposit(index, g.volume)) {
        this.world.removeRigidBody(g.body);
        this.grains.splice(i, 1);
      } else if (p.y < -5 || Math.abs(p.x) > 65 || Math.abs(p.z) > 65) {
        this.escapedVolume += g.volume;
        this.world.removeRigidBody(g.body);
        this.grains.splice(i, 1);
      }
    }
    this.field.flush();
    this.load.flush();
    const percent = (this.load.volume / this.capacity) * 100;
    this.tracker.count = Math.floor(percent * 10) / 10;
    this.stableLoadTime = percent >= 80 ? this.stableLoadTime + dt : 0;
    const justCompleted = !this.tracker.completed && this.stableLoadTime >= 2;
    if (justCompleted) this.tracker.completed = true;
    this.stepMs = performance.now() - start;
    return {
      count: this.tracker.count,
      completed: this.tracker.completed,
      justCompleted,
    };
  }
  get ledger() {
    const active = this.grains.reduce((v, g) => v + g.volume, 0),
      ground = this.field.volume,
      truck = this.load.volume;
    return {
      initial: this.initialVolume,
      ground,
      active,
      truck,
      escaped: this.escapedVolume,
      error: ground + active + truck + this.escapedVolume - this.initialVolume,
      extracted: this.extractedVolume,
      activeCount: this.grains.length,
      peakGrains: this.peakGrains,
      stepMs: this.stepMs,
    };
  }
  get bucketVolume() {
    return this.grains.reduce(
      (v, g) =>
        v +
        (this.machine.bucketContains(
          new THREE.Vector3().copy(g.body.translation()),
        )
          ? g.volume
          : 0),
      0,
    );
  }
  render(alpha: number) {
    const m = new THREE.Matrix4(),
      p = new THREE.Vector3();
    this.grainMesh.count = this.grains.length;
    this.grains.forEach((g, i) => {
      p.copy(g.previous).lerp(g.body.translation(), alpha);
      m.makeScale(g.radius, g.radius, g.radius);
      m.setPosition(p);
      this.grainMesh.setMatrixAt(i, m);
    });
    this.grainMesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.machine.supportHeight = null;
    this.machine.siteGuard = null;
    this.field?.dispose();
    this.load?.dispose();
    if (this.grainMesh) {
      this.grainMesh.dispose();
      this.grainMesh.geometry.dispose();
      (this.grainMesh.material as THREE.Material).dispose();
    }
    this.grains = [];
    super.dispose();
  }
}
