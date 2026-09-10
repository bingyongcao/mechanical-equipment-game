import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

// Conservative finite-volume columns. Each cell stores bulk sand depth in metres.
// The staircase is deliberately shared by rendering and collision in this prototype.
export class SandField {
  heights: Float64Array;
  colliders: (RAPIER.Collider | null)[];
  mesh: THREE.InstancedMesh;
  dirty = new Set<number>();
  matrix = new THREE.Matrix4();
  constructor(
    public world: RAPIER.World,
    public nx: number,
    public nz: number,
    public dx: number,
    public dz: number,
    public x0: number,
    public z0: number,
    public floor: number,
    depth: number,
    public ceiling = Infinity,
  ) {
    this.heights = new Float64Array(nx * nz).fill(depth);
    this.colliders = Array(nx * nz).fill(null);
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#ceb076", roughness: 1 }),
      nx * nz,
    );
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < this.heights.length; i++) this.dirty.add(i);
    this.flush();
  }
  index(x: number, z: number) {
    const ix = Math.floor((x - this.x0) / this.dx),
      iz = Math.floor((z - this.z0) / this.dz);
    return ix < 0 || ix >= this.nx || iz < 0 || iz >= this.nz
      ? -1
      : iz * this.nx + ix;
  }
  center(i: number) {
    return {
      x: this.x0 + ((i % this.nx) + 0.5) * this.dx,
      z: this.z0 + (Math.floor(i / this.nx) + 0.5) * this.dz,
    };
  }
  height(x: number, z: number) {
    const i = this.index(x, z);
    return i < 0 ? this.floor : this.floor + this.heights[i];
  }
  get volume() {
    return this.heights.reduce((a, h) => a + h * this.dx * this.dz, 0);
  }
  take(i: number, volume: number) {
    const v = Math.min(volume, this.heights[i] * this.dx * this.dz);
    this.heights[i] -= v / (this.dx * this.dz);
    this.dirty.add(i);
    return v;
  }
  deposit(i: number, volume: number) {
    if (i < 0 || this.heightAt(i) + volume / (this.dx * this.dz) > this.ceiling)
      return false;
    this.heights[i] += volume / (this.dx * this.dz);
    this.dirty.add(i);
    return true;
  }
  heightAt(i: number) {
    return this.floor + this.heights[i];
  }
  relax() {
    // Pairwise flux conserves volume and approaches a 34-degree repose angle.
    const slope = Math.tan((34 * Math.PI) / 180);
    for (let i = 0; i < this.heights.length; i++) {
      for (const [j, d] of [
        [i % this.nx < this.nx - 1 ? i + 1 : -1, this.dx],
        [i + this.nx < this.heights.length ? i + this.nx : -1, this.dz],
      ]) {
        if (j < 0) continue;
        const diff = this.heights[i] - this.heights[j];
        const flux = Math.max(0, Math.abs(diff) - slope * d) * 0.22;
        if (flux < 1e-5) continue;
        const from = diff > 0 ? i : j,
          to = diff > 0 ? j : i;
        this.heights[from] -= flux;
        this.heights[to] += flux;
        this.dirty.add(from);
        this.dirty.add(to);
      }
    }
  }
  flush() {
    for (const i of this.dirty) {
      const h = this.heights[i],
        p = this.center(i);
      this.matrix.makeScale(this.dx, Math.max(h, 1e-6), this.dz);
      this.matrix.setPosition(p.x, this.floor + h / 2, p.z);
      this.mesh.setMatrixAt(i, this.matrix);
      const c = this.colliders[i];
      if (h < 1e-6) {
        if (c) this.world.removeCollider(c, true);
        this.colliders[i] = null;
      } else if (c) {
        c.setHalfExtents({ x: this.dx / 2, y: h / 2, z: this.dz / 2 });
        c.setTranslation({ x: p.x, y: this.floor + h / 2, z: p.z });
      } else
        this.colliders[i] = this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(this.dx / 2, h / 2, this.dz / 2)
            .setTranslation(p.x, this.floor + h / 2, p.z)
            .setFriction(0.85)
            .setCollisionGroups(0x00040001),
        );
    }
    if (this.dirty.size) this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
  }
  dispose() {
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
