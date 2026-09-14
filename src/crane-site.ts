import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { cuboid } from "./environment";
import craneUrl from "../assets/truck-crane/truck-crane.glb?url";
import shipUrl from "../assets/cargo-ship/cargo-ship.glb?url";

type Cargo = {
  root: THREE.Object3D;
  grab: THREE.Object3D;
  delivered: boolean;
};

export type CraneStepResult = { count: number; justCompleted: boolean };

const material = (color: string, roughness = 0.82) =>
  new THREE.MeshStandardMaterial({ color, roughness });

export class CraneMission {
  group = new THREE.Group();
  crane!: THREE.Group;
  ship!: THREE.Group;
  nodes = new Map<string, THREE.Object3D>();
  cargo: Cargo[] = [];
  held: Cargo | null = null;
  candidate: Cargo | null = null;
  count = 0;
  required = 5;
  justCompleted = false;
  completed = false;
  cargoGrounded = false;
  slew = Math.PI / 2;
  boom = THREE.MathUtils.degToRad(43);
  extension = 0;
  ropeLength = 0.8;
  target = { x: 6.1, z: 7.8, radius: 3.1 };
  targetPads: THREE.Mesh[] = [];
  occupiedPads = new Set<number>();
  private rope!: THREE.Object3D;
  private ropeFrame!: THREE.Object3D;
  private hook!: THREE.Object3D;
  private attach!: THREE.Object3D;
  private telescope: THREE.Object3D[] = [];
  private originalCargo = new Map<THREE.Object3D, THREE.Matrix4>();

  async load() {
    this.group.name = "RiversideCraneMission";
    this.buildEnvironment();
    const [crane, ship] = await Promise.all([
      new GLTFLoader().loadAsync(craneUrl),
      new GLTFLoader().loadAsync(shipUrl),
    ]);
    this.crane = crane.scene;
    this.ship = ship.scene;
    this.crane.name = "TruckCraneRuntime";
    this.ship.name = "CargoShipRuntime";
    this.crane.position.set(0, 0, 4.2);
    this.ship.position.set(0, -0.05, -4.2);
    this.group.add(this.crane, this.ship);
    this.crane.traverse((o) => {
      this.nodes.set(o.name, o);
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.ship.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.rope = this.node("WireRope");
    this.ropeFrame = this.node("J_RopeVertical");
    this.hook = this.node("J_Hook");
    this.attach = this.node("A_CargoAttach");
    this.telescope = [1, 2, 3].map((i) => this.node(`J_Telescope_${i}`));
    for (let i = 1; i <= this.required; i++) {
      const root = this.ship.getObjectByName(`Cargo_${i}`);
      let grab: THREE.Object3D | undefined;
      root?.traverse((o) => {
        if (!grab && o.name.startsWith("A_GrabPoint")) grab = o;
      });
      if (!root || !grab) throw new Error(`货船缺少 Cargo_${i} 抓取节点`);
      root.visible = true;
      // The source material is shared between crates; clone it so only the
      // crate under the hook glows.
      root.traverse((o) => {
        o.visible = true;
        if (o instanceof THREE.Mesh)
          o.material = Array.isArray(o.material)
            ? o.material.map((m) => m.clone())
            : o.material.clone();
      });
      root.updateMatrixWorld(true);
      this.originalCargo.set(root, root.matrix.clone());
      this.cargo.push({ root, grab, delivered: false });
    }
    this.pose();
    return this;
  }

  private node(name: string) {
    const node = this.nodes.get(name);
    if (!node) throw new Error("起重机模型缺少部件 " + name);
    return node;
  }

  private buildEnvironment() {
    const bank = material("#9bac83"),
      road = material("#596465"),
      line = material("#e8d9a6"),
      bark = material("#745d43"),
      foliage = [material("#355f46"), material("#49755a"), material("#668765")];
    cuboid(this.group, 0, -0.16, 8, 80, 0.3, 16, bank);
    cuboid(this.group, 0, -0.12, 13.2, 80, 0.18, 5.2, road);
    for (let x = -36; x <= 36; x += 5)
      cuboid(this.group, x, 0.005, 13.2, 2.5, 0.025, 0.12, line);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 18, 48, 12),
      new THREE.MeshPhysicalMaterial({
        color: "#4f93a0",
        roughness: 0.24,
        metalness: 0.08,
        transparent: true,
        opacity: 0.82,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.1, -5.2);
    water.receiveShadow = true;
    water.userData.water = true;
    this.group.add(water);
    cuboid(this.group, 0, 0.28, 0.25, 80, 0.55, 0.45, material("#a7a38f"));
    for (let x = -38; x <= 38; x += 2.4)
      cuboid(this.group, x, 0.17, 0.12, 1.15, 0.16, 0.62, material("#c8c1a7"));
    for (let i = 0; i < 46; i++) {
      const x = -39 + ((i * 5.37) % 78),
        z = 17 + (i % 4) * 2.15,
        h = 2.1 + (i % 3) * 0.35;
      cuboid(this.group, x, h / 2, z, 0.24, h, 0.24, bark);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), foliage[i % 3]);
      crown.position.set(x, h + 0.65, z);
      crown.scale.set(1, 1.25, 1);
      crown.castShadow = true;
      this.group.add(crown);
    }
    const padMaterial = new THREE.MeshStandardMaterial({
      color: "#79b39b",
      emissive: "#173f31",
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.8,
      roughness: 0.7,
    });
    const padPositions = [[4.5, 7], [6.1, 7], [7.7, 7], [5.3, 8.6], [6.9, 8.6]];
    for (let i = 0; i < this.required; i++) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.035, 1.42), padMaterial.clone());
      pad.name = `UnloadPad_${i + 1}`;
      pad.position.set(padPositions[i][0], 0.025, padPositions[i][1]);
      pad.receiveShadow = true;
      this.group.add(pad);
      this.targetPads.push(pad);
    }
  }

  pose() {
    this.node("J_Slew").rotation.y = this.slew;
    this.node("J_BoomPitch").rotation.z = this.boom;
    const section = 0.6 + this.extension / 3;
    this.telescope.forEach((o) => (o.position.x = section));
    this.crane.updateMatrixWorld(true);
    // Keep the rope vertical although the hook frame inherits both slew and boom.
    const parentWorld = this.ropeFrame.parent!.getWorldQuaternion(new THREE.Quaternion());
    this.ropeFrame.quaternion.copy(parentWorld.invert());
    this.hook.position.y = -this.ropeLength;
    this.rope.position.y = -this.ropeLength / 2;
    this.rope.scale.y = this.ropeLength / 4.2;
    this.crane.updateMatrixWorld(true);
  }

  step(inputs: Map<string, number>, dt: number): CraneStepResult {
    this.slew += (inputs.get("joint0") || 0) * 0.42 * dt;
    this.boom = THREE.MathUtils.clamp(
      this.boom - (inputs.get("joint1") || 0) * 0.25 * dt,
      THREE.MathUtils.degToRad(15),
      THREE.MathUtils.degToRad(75),
    );
    this.extension = THREE.MathUtils.clamp(
      this.extension - (inputs.get("joint2") || 0) * 1.35 * dt,
      0,
      6,
    );
    this.ropeLength = THREE.MathUtils.clamp(
      this.ropeLength + (inputs.get("joint3") || 0) * 1.6 * dt,
      0.8,
      10,
    );
    this.pose();
    this.clampHeldCargoToSurface();
    const ropeOrigin = this.ropeFrame.getWorldPosition(new THREE.Vector3());
    this.ropeLength = Math.min(this.ropeLength, Math.max(0.8, ropeOrigin.y - 0.92));
    this.pose();
    this.updateInteraction();
    const result = { count: this.count, justCompleted: this.justCompleted };
    this.justCompleted = false;
    return result;
  }

  private supportHeightAt(x: number, z: number) {
    // Cargo ship deck, solid river bank, then the water surface.
    if (x > -7.3 && x < 7.3 && z > -6.8 && z < -1.6) return 1.4;
    return z >= 0 ? 0.02 : -0.08;
  }

  private clampHeldCargoToSurface() {
    this.cargoGrounded = false;
    if (!this.held) return;
    const bounds = new THREE.Box3().setFromObject(this.held.root),
      center = bounds.getCenter(new THREE.Vector3()),
      support = this.supportHeightAt(center.x, center.z) + 0.015;
    if (bounds.min.y > support) return;
    this.ropeLength = Math.max(0.8, this.ropeLength - (support - bounds.min.y));
    this.pose();
    this.cargoGrounded = true;
  }

  private updateInteraction() {
    const hook = this.attach.getWorldPosition(new THREE.Vector3());
    let candidate: Cargo | null = null,
      best = 0.62;
    if (!this.held)
      for (const cargo of this.cargo) {
        if (cargo.delivered) continue;
        const distance = cargo.grab.getWorldPosition(new THREE.Vector3()).distanceTo(hook);
        if (distance < best) {
          best = distance;
          candidate = cargo;
        }
      }
    if (candidate !== this.candidate) {
      this.setCargoGlow(this.candidate, false);
      this.candidate = candidate;
      this.setCargoGlow(this.candidate, true);
    }
    this.targetPads.forEach((pad, i) => {
      const active = Boolean(this.held && this.nearPad(i));
      const m = pad.material as THREE.MeshStandardMaterial;
      m.color.set(active ? "#66d58a" : "#79b39b");
      m.emissiveIntensity = active ? 1.2 : 0.25;
    });
  }

  private setCargoGlow(cargo: Cargo | null, enabled: boolean) {
    cargo?.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.emissive.set(enabled ? "#f1a928" : "#000000");
          m.emissiveIntensity = enabled ? 1.15 : 0;
        }
      }
    });
  }

  private nearPad(index: number) {
    if (this.occupiedPads.has(index)) return false;
    if (!this.held) return false;
    const hook = this.attach.getWorldPosition(new THREE.Vector3()),
      pad = this.targetPads[index].position;
    return Math.hypot(hook.x - pad.x, hook.z - pad.z) < 0.78 && hook.y < 1.75;
  }

  get canGrab() {
    return Boolean(this.candidate);
  }

  get canRelease() {
    return Boolean(this.held);
  }

  toggleGrab() {
    if (!this.held && this.candidate) {
      this.held = this.candidate;
      this.setCargoGlow(this.held, false);
      this.candidate = null;
      this.attach.attach(this.held.root);
      this.held.root.position.set(0, -1.22, 0);
      this.held.root.quaternion.identity();
      this.held.root.scale.set(1, 1, 1);
      this.held.root.updateMatrixWorld(true);
      this.clampHeldCargoToSurface();
      return "grabbed" as const;
    }
    if (!this.held) return "unavailable" as const;
    const index = this.targetPads.findIndex((_, i) => this.nearPad(i));
    if (index < 0) return "invalid-release" as const;
    const cargo = this.held;
    this.group.attach(cargo.root);
    cargo.root.position.set(this.targetPads[index].position.x, 0.05, this.targetPads[index].position.z);
    cargo.root.quaternion.identity();
    cargo.root.scale.set(1, 1, 1);
    cargo.delivered = true;
    this.occupiedPads.add(index);
    this.held = null;
    this.cargoGrounded = false;
    this.count++;
    if (this.count === this.required && !this.completed) {
      this.completed = true;
      this.justCompleted = true;
    }
    return "released" as const;
  }

  resetCargo() {
    if (!this.held) return false;
    const cargo = this.held;
    this.ship.add(cargo.root);
    const matrix = this.originalCargo.get(cargo.root)!;
    matrix.decompose(cargo.root.position, cargo.root.quaternion, cargo.root.scale);
    this.held = null;
    this.candidate = null;
    this.pose();
    return true;
  }
}
