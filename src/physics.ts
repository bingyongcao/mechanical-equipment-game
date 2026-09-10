import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Machine } from "./machine";
import { terrainGeometry } from "./environment";
import { seededRandom, DeliveryTracker, terrainHeight } from "./logic.mjs";
export interface Rock {
  id: number;
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  previous: THREE.Vector3;
  previousQ: THREE.Quaternion;
}
export class Simulation {
  world!: RAPIER.World;
  rocks: Rock[] = [];
  machines: { node: THREE.Object3D; body: RAPIER.RigidBody }[] = [];
  group = new THREE.Group();
  tracker: DeliveryTracker;
  elapsed = 0;
  constructor(
    public machine: Machine,
    target: { x: number; z: number; radius: number },
    required = 8,
  ) {
    this.tracker = new DeliveryTracker(target, required);
  }
  async init(variant = 0) {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 120;
    this.world.numSolverIterations = 8;
    if (variant !== 1) {
      const ground = terrainGeometry(),
        positions = ground.attributes.position.array as Float32Array;
      this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          positions,
          new Uint32Array(ground.index!.array),
        )
          .setFriction(0.9)
          .setCollisionGroups(0x00040001),
      );
      ground.dispose();
      for (const [x, z, w, d] of [
        [0, -11.6, 29, 0.3],
        [0, 11.6, 29, 0.3],
        [-14.5, 0, 0.3, 23],
        [14.5, 0, 0.3, 23],
        [-10, -8, 4, 2.4],
      ]) {
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(w / 2, 1.1, d / 2)
            .setTranslation(x, 1.0, z)
            .setCollisionGroups(0x00040001),
        );
      }
    }
    const byParent = new Map<string, RAPIER.RigidBody>();
    this.machine.root.updateMatrixWorld(true);
    for (const c of this.machine.colliders) {
      const node = this.machine.node(c.parent);
      let body = byParent.get(c.parent);
      if (!body) {
        const p = node.getWorldPosition(new THREE.Vector3()),
          q = node.getWorldQuaternion(new THREE.Quaternion());
        body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(p.x, p.y, p.z)
            .setRotation(q),
        );
        byParent.set(c.parent, body);
        this.machines.push({ node, body });
      }
      const desc = RAPIER.ColliderDesc.convexHull(
        new Float32Array(c.vertices.flat()),
      );
      if (!desc) throw new Error("无效碰撞体 " + c.name);
      const entry =
        c.name.startsWith("COL_Bucket tooth") ||
        c.name === "COL_Bucket cutting edge";
      if (entry) desc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
      this.world.createCollider(
        desc
          .setFriction(entry ? 0.4 : 0.85)
          .setRestitution(0.02)
          .setCollisionGroups(0x00020001),
        body,
      );
    }
    if (variant === 1) return;
    const rand = seededRandom(128 + variant);
    for (let i = 0; i < 24; i++) {
      const column = i % 4,
        row = Math.floor(i / 4) % 3,
        layer = Math.floor(i / 12);
      this.addRock(
        new THREE.Vector3(
          column * 0.43 + (rand() - 0.5) * 0.07,
          0.38 + layer * 0.43,
          (row - 1) * 0.43 + (rand() - 0.5) * 0.07,
        ),
        rand,
      );
    }
  }
  addRock(
    position: THREE.Vector3,
    rand = seededRandom(this.rocks.length + 100),
  ) {
    const radius = 0.17 + rand() * 0.055,
      geom = new THREE.IcosahedronGeometry(radius, 1),
      p = geom.attributes.position;
    const sx = 0.85 + rand() * 0.4,
      sy = 0.75 + rand() * 0.35,
      sz = 0.8 + rand() * 0.4;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      const n = 1 + 0.12 * Math.sin(x * 39 + y * 26 + z * 31);
      p.setXYZ(i, x * n * sx, y * n * sy, z * n * sz);
    }
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.095, 0.08, 0.31 + rand() * 0.2),
        roughness: 0.94,
        flatShading: true,
      }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(position);
    this.group.add(mesh);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setCcdEnabled(true)
        .setLinearDamping(0.12)
        .setAngularDamping(0.2),
    );
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(p.array))!;
    this.world.createCollider(
      desc
        .setDensity(1700)
        .setFriction(0.85)
        .setRestitution(0.05)
        .setCollisionGroups(0x00010007),
      body,
    );
    const rock = {
      id: this.rocks.length,
      body,
      mesh,
      previous: position.clone(),
      previousQ: new THREE.Quaternion(),
    };
    this.rocks.push(rock);
    return rock;
  }
  syncMachine(teleport = false) {
    for (const { node, body } of this.machines) {
      const p = node.getWorldPosition(new THREE.Vector3()),
        q = node.getWorldQuaternion(new THREE.Quaternion());
      if (teleport) {
        body.setTranslation(p, true);
        body.setRotation(q, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      body.setNextKinematicTranslation(p);
      body.setNextKinematicRotation(q);
    }
  }
  step() {
    this.syncMachine();
    const dt = this.world.timestep;
    this.elapsed += dt;
    for (const r of this.rocks) {
      r.previous.copy(r.body.translation());
      r.previousQ.copy(r.body.rotation());
    }
    this.world.step();
    const info = this.rocks.map((r) => {
      const p = r.body.translation();
      if (p.y < -4) {
        // Recovery only for numerical escape; never used for normal hauling.
        r.body.setTranslation(
          {
            x: 1 + (r.id % 5) * 0.43,
            y: 1,
            z: -0.5 + Math.floor(r.id / 5) * 0.4,
          },
          true,
        );
        r.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        r.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      return {
        id: r.id,
        position: p,
        velocity: r.body.linvel(),
        inBucket: this.machine.bucketContains(new THREE.Vector3(p.x, p.y, p.z)),
      };
    });
    return this.tracker.update(info, dt);
  }
  render(alpha: number) {
    for (const r of this.rocks) {
      const q = r.body.rotation();
      r.mesh.position.copy(r.previous).lerp(r.body.translation(), alpha);
      r.mesh.quaternion
        .copy(r.previousQ)
        .slerp(new THREE.Quaternion(q.x, q.y, q.z, q.w), alpha);
    }
  }
  dispose() {
    this.world?.free();
    for (const r of this.rocks) {
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
    this.rocks = [];
    this.machines = [];
  }
}
