import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TowerMachine, batchTowerAsset, materialNames } from "./tower-machine";
import { disposeGroup } from "./environment";
import environmentUrl from "../assets/tower-construction/site-environment/site-environment.glb?url";
import buildingUrl from "../assets/tower-construction/construction-building/construction-building.glb?url";
import floorUrl from "../assets/tower-construction/floor-module/floor-module.glb?url";
import residentialUrl from "../assets/tower-construction/residential-building/residential-building.glb?url";
import rebarUrl from "../assets/tower-construction/rebar-bundle/rebar-bundle-unit.glb?url";
import brickUrl from "../assets/tower-construction/brick-pallet/brick-pallet-unit.glb?url";
import boardUrl from "../assets/tower-construction/gypsum-stack/gypsum-stack-unit.glb?url";

export type TowerCargo = {
  root: THREE.Group;
  grab: THREE.Vector3;
  bounds: THREE.Box3;
  type: number;
  index: number;
  delivered: boolean;
  original: THREE.Vector3;
};
type Obstacle = { box: THREE.Box3; name: string };
const box = (
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) =>
  new THREE.Box3(
    new THREE.Vector3(x - w / 2, y, z - d / 2),
    new THREE.Vector3(x + w / 2, y + h, z + d / 2),
  );
const overlapsXZ = (a: THREE.Box3, b: THREE.Box3, epsilon = 0.002) =>
  a.max.x > b.min.x + epsilon &&
  a.min.x < b.max.x - epsilon &&
  a.max.z > b.min.z + epsilon &&
  a.min.z < b.max.z - epsilon;

function materialLabel(text: string, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = '700 72px "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 256, 64);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = "MaterialName";
  return mesh;
}

export class TowerMission {
  group = new THREE.Group();
  machine = new TowerMachine();
  building!: THREE.Group;
  floorTemplate!: THREE.Group;
  roof!: THREE.Object3D;
  pads: THREE.Object3D[] = [];
  cargo: TowerCargo[] = [];
  held: TowerCargo | null = null;
  candidate: TowerCargo | null = null;
  received = [false, false, false];
  count = 0;
  required = 5;
  completed = false;
  phase: "loading" | "clearance" | "building" | "complete" = "loading";
  growth = 0;
  growingFloor: THREE.Group | null = null;
  cargoGrounded = false;
  blockedReason = "";
  target = { x: 12, z: -3, radius: 5 };
  private staticObstacles: Obstacle[] = [];
  private disposed = false;
  private glow: TowerCargo | null = null;
  get roofY() {
    return 6.05 + this.count * 3;
  }
  get slew() {
    return this.machine.slew;
  }
  get radius() {
    return this.machine.radius;
  }
  get ropeLength() {
    return this.machine.ropeLength;
  }
  get attach() {
    return this.machine.node("A_CargoAttach");
  }
  get remaining() {
    return [0, 1, 2].map(
      (t) => this.cargo.filter((c) => c.type === t && !c.delivered).length,
    );
  }
  get canGrab() {
    return this.phase === "loading" && !!this.candidate;
  }
  get canRelease() {
    return !!this.held;
  }
  get status() {
    if (this.phase === "complete")
      return "7 层楼栋建成！可以观察成果或重新开始。";
    if (this.phase === "building") return "材料齐备，正在建造新楼层…";
    if (this.phase === "clearance")
      return "三种材料已就位，请把吊钩升到楼顶上方的安全高度。";
    if (this.blockedReason) return this.blockedReason;
    if (this.held)
      return `正在吊运${materialNames[this.held.type]}，请放到楼顶同名区域。`;
    return this.candidate
      ? `${materialNames[this.candidate.type]}已对准，可以抓取。`
      : "对准料垛最上层的黄色吊环，抓取后先升高。";
  }

  async load() {
    const loader = new GLTFLoader();
    // Settle all loads so a failed request cannot strand a late-loaded GPU asset.
    const results = await Promise.allSettled([
      this.machine.load(false),
      ...[
        environmentUrl,
        buildingUrl,
        floorUrl,
        residentialUrl,
        rebarUrl,
        brickUrl,
        boardUrl,
      ].map((url) => loader.loadAsync(url)),
    ]);
    const failure = results.find((r) => r.status === "rejected");
    if (failure) {
      disposeGroup(this.machine.root);
      for (const r of results.slice(1))
        if (r.status === "fulfilled" && "scene" in r.value)
          disposeGroup(r.value.scene);
      throw (failure as PromiseRejectedResult).reason;
    }
    const assets = results
      .slice(1)
      .map(
        (r) =>
          (
            r as PromiseFulfilledResult<
              Awaited<ReturnType<GLTFLoader["loadAsync"]>>
            >
          ).value.scene,
      );
    assets.forEach(batchTowerAsset);
    const [environment, building, floor, residential, ...units] = assets;
    this.group.name = "TowerConstructionMission";
    this.group.add(environment, this.machine.root, building);
    this.machine.root.position.y = 0.05;
    this.machine.slew = Math.atan2(-10, 10);
    this.machine.radius = Math.hypot(10, 10);
    this.machine.pose();
    this.building = building;
    building.position.set(12, 0.05, -3);
    this.floorTemplate = floor;
    floor.visible = false;
    this.group.add(floor);
    this.roof = building.getObjectByName("RoofWorkPlatform")!;
    this.pads = ["REBAR", "BRICK", "BOARD"].map((n) =>
      building.getObjectByName(`UnloadPad_${n}`)!,
    );
    this.pads.forEach((pad, i) => {
      pad.traverse((o) => {
        if (o.name.startsWith("PadLabel")) o.visible = false;
      });
      const label = materialLabel(materialNames[i], 2.5, 0.62);
      label.rotation.x = -Math.PI / 2;
      label.position.set(0, 0.075, 0.95);
      pad.add(label);
      const bay = environment.getObjectByName(
        `StorageBay_${["REBAR", "BRICK", "BOARD"][i]}`,
      )!;
      bay.traverse((o) => {
        if (o.name.startsWith("StorageLabel")) o.visible = false;
      });
      const sign = materialLabel(materialNames[i], 2.05, 0.48);
      sign.position.set(0, 1, -1.744);
      bay.add(sign);
    });
    for (const [x, z] of [
      [-22, -15],
      [-6, -17],
      [16, -18],
      [-23, 8],
    ]) {
      const home = residential.clone(true);
      home.position.set(x, 0.05, z);
      this.group.add(home);
      this.staticObstacles.push({
        box: box(x, 0.05, z, 13, 20.4, 12.4),
        name: "楼栋",
      });
    }
    this.staticObstacles.push(
      { box: box(0, 0.05, 0, 2.1, 29.8, 2.1), name: "塔身" },
      { box: box(0, 0.05, 0, 5, 0.7, 5), name: "基座" },
    );
    units.forEach((unit, t) => {
      const marker = (() => {
        let a: THREE.Object3D | undefined;
        unit.traverse((o) => {
          if (o.name.startsWith("A_GrabPoint")) a = o;
        });
        return a!;
      })();
      unit.updateMatrixWorld(true);
      const grab = marker.getWorldPosition(new THREE.Vector3());
      const bounds = new THREE.Box3().setFromObject(unit);
      const pitch = [1.247, 1.487, 1.147][t];
      for (let i = 0; i < 5; i++) {
        const root = unit.clone(true);
        const mats = new Map<THREE.Material, THREE.Material>();
        root.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            const clone = (m: THREE.Material) => {
              if (!mats.has(m)) mats.set(m, m.clone());
              return mats.get(m)!;
            };
            o.material = Array.isArray(o.material)
              ? o.material.map(clone)
              : clone(o.material);
          }
        });
        root.name = `TowerCargo_${t}_${i}`;
        root.position.set(5 + t * 5, 0.05 + i * pitch, 10);
        this.group.add(root);
        this.cargo.push({
          root,
          grab: grab.clone(),
          bounds: bounds.clone(),
          type: t,
          index: i,
          delivered: false,
          original: root.position.clone(),
        });
      }
    });
    // Source geometries are shared by clones. Keep their owning templates for disposal.
    const templates = new THREE.Group();
    templates.visible = false;
    templates.add(residential, ...units);
    this.group.add(templates);
    this.group.updateMatrixWorld(true);
    this.updateInteraction();
    return this;
  }
  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      disposeGroup(this.group);
    }
  }
  private cargoBox(c: TowerCargo) {
    return c.bounds.clone().translate(c.root.position);
  }
  private movingBox() {
    const p = this.attach.getWorldPosition(new THREE.Vector3());
    return this.held
      ? this.cargoBox(this.held)
      : box(p.x, p.y - 0.07, p.z, 0.35, 1.4, 0.35);
  }
  private obstacles(): Obstacle[] {
    const y = this.roofY;
    const result: Obstacle[] = [
      ...this.staticObstacles,
      { box: box(12, 0.05, -3, 12, y - 0.05, 10), name: "施工楼栋" },
    ];
    for (const z of [-7.85, 1.85])
      result.push({ box: box(12, y, z, 11.9, 0.98, 0.08), name: "楼顶护栏" });
    for (const x of [6.15, 17.85])
      result.push({ box: box(x, y, -3, 0.08, 0.98, 9.8), name: "楼顶护栏" });
    for (const c of this.cargo)
      if (c !== this.held && c.root.visible)
        result.push({ box: this.cargoBox(c), name: "物料" });
    return result;
  }
  private syncHeld() {
    if (this.held)
      this.held.root.position
        .copy(this.attach.getWorldPosition(new THREE.Vector3()))
        .sub(this.held.grab);
    this.group.updateMatrixWorld(true);
  }
  private intersects(a: THREE.Box3, obstacle: Obstacle) {
    return (
      overlapsXZ(a, obstacle.box) &&
      a.min.y < obstacle.box.max.y - 0.004 &&
      a.max.y > obstacle.box.min.y + 0.004
    );
  }
  private lowerToSurface() {
    const b = this.movingBox();
    let support = 0.05;
    for (const o of this.obstacles())
      if (overlapsXZ(b, o.box) && b.max.y >= o.box.max.y - 0.01)
        support = Math.max(support, o.box.max.y);
    if (b.min.y < support + 0.012) {
      this.machine.ropeLength = Math.max(
        2,
        this.machine.ropeLength - (support + 0.012 - b.min.y),
      );
      this.machine.pose();
      this.syncHeld();
    }
    this.cargoGrounded =
      !!this.held && this.movingBox().min.y <= support + 0.025;
  }
  step(inputs: Map<string, number>, dt: number) {
    let justCompleted = false,
      justBuilt = false;
    this.blockedReason = "";
    if (this.disposed) return { count: this.count, justCompleted, justBuilt };
    if (this.phase === "building") {
      this.growth = Math.min(1, this.growth + dt / 1.25);
      this.growingFloor!.scale.y = Math.max(0.001, this.growth);
      this.roof.position.y = 6 + this.count * 3 + this.growth * 3;
      if (this.growth === 1) {
        this.count++;
        this.received =
          this.count === 5 ? [true, true, true] : [false, false, false];
        this.growingFloor = null;
        this.phase = this.count === 5 ? "complete" : "loading";
        this.completed = this.count === 5;
        justCompleted = this.completed;
        justBuilt = true;
      }
      this.group.updateMatrixWorld(true);
    } else {
      // Resolve each axis separately and sweep the carried box between nearby poses.
      // Substeps also bound externally supplied dt (tests use the same controller).
      const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (let i = 0; i < steps; i++)
        for (const action of ["joint3", "joint0", "joint2"]) {
          const sign = inputs.get(action) || 0;
          if (!sign) continue;
          const old = [
            this.machine.slew,
            this.machine.radius,
            this.machine.ropeLength,
          ];
          const before = this.movingBox();
          this.machine.step(new Map([[action, sign]]), dt / steps);
          this.syncHeld();
          if (action === "joint3") this.lowerToSurface();
          const after = this.movingBox();
          const swept = before.clone().union(after);
          const hit = this.obstacles().find(
            (o) => this.intersects(swept, o) && !this.intersects(before, o),
          );
          if (hit) {
            [this.machine.slew, this.machine.radius, this.machine.ropeLength] =
              old;
            this.machine.pose();
            this.syncHeld();
            this.blockedReason = `前方是${hit.name}，请先升高吊物再移动。`;
          }
        }
      this.lowerToSurface();
      // Include the new floor's guardrails, not only the concrete slab.
      if (
        this.phase === "clearance" &&
        this.attach.getWorldPosition(new THREE.Vector3()).y > this.roofY + 4.2
      )
        this.beginGrowth();
    }
    this.updateInteraction();
    return { count: this.count, justCompleted, justBuilt };
  }
  private beginGrowth() {
    this.phase = "building";
    this.growth = 0;
    for (const c of this.cargo) if (c.delivered) c.root.visible = false;
    const floor = this.floorTemplate.clone(true);
    floor.visible = true;
    floor.position.set(12, this.roofY, -3);
    floor.scale.y = 0.001;
    this.group.add(floor);
    this.growingFloor = floor;
  }
  private top(c: TowerCargo) {
    return (
      !c.delivered &&
      !this.cargo.some(
        (other) =>
          other.type === c.type &&
          !other.delivered &&
          other !== this.held &&
          other.index > c.index,
      )
    );
  }
  padPosition(type: number) {
    return this.pads[type].getWorldPosition(new THREE.Vector3());
  }
  private validPad(type: number) {
    if (!this.held || this.received[type] || this.held.type !== type)
      return false;
    let surface: THREE.Object3D | undefined;
    this.pads[type].traverse((o) => {
      if (!surface && o.name.includes("PadSurface")) surface = o;
    });
    if (!surface) return false;
    const b = this.cargoBox(this.held),
      target = new THREE.Box3().setFromObject(surface),
      c = b.getCenter(new THREE.Vector3());
    // The visible coloured pad is the drop target. Requiring the bundle's
    // centre to be inside it keeps neighbouring material types distinct while
    // allowing a practical amount of overhang for the long rebar bundle.
    const centerOnPad =
      c.x >= target.min.x &&
      c.x <= target.max.x &&
      c.z >= target.min.z &&
      c.z <= target.max.z;
    return (
      centerOnPad &&
      Math.abs(b.min.y - this.roofY) < 0.13
    );
  }
  private setGlow(c: TowerCargo | null, on: boolean) {
    c?.root.traverse((o) => {
      if (o instanceof THREE.Mesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (m instanceof THREE.MeshStandardMaterial) {
            m.emissive.set(on ? "#bd7814" : "#000000");
            m.emissiveIntensity = on ? 0.7 : 0;
          }
    });
  }
  private updateInteraction() {
    this.candidate = null;
    if (!this.held && this.phase === "loading") {
      const p = this.attach.getWorldPosition(new THREE.Vector3());
      let best = 0.52;
      for (const c of this.cargo) {
        if (!this.top(c) || this.received[c.type]) continue;
        const distance = c.root.position.clone().add(c.grab).distanceTo(p);
        if (distance < best) {
          best = distance;
          this.candidate = c;
        }
      }
    }
    if (this.glow !== this.candidate) {
      this.setGlow(this.glow, false);
      this.glow = this.candidate;
      this.setGlow(this.glow, true);
    }
    this.pads.forEach((pad, i) =>
      pad.traverse((o) => {
        if (o instanceof THREE.Mesh && o.name.includes("PadSurface")) {
          const m = o.material as THREE.MeshStandardMaterial;
          m.emissive.set(
            this.validPad(i)
              ? "#409c4c"
              : this.received[i]
                ? "#184422"
                : "#000000",
          );
        }
      }),
    );
  }
  toggleGrab() {
    if (this.phase !== "loading") return "unavailable" as const;
    if (!this.held) {
      this.updateInteraction();
      if (!this.candidate) return "unavailable" as const;
      const c = this.candidate;
      this.held = c;
      this.candidate = null;
      this.setGlow(this.glow, false);
      this.glow = null;
      this.syncHeld();
      this.lowerToSurface();
      return "grabbed" as const;
    }
    const c = this.held;
    if (!this.validPad(c.type)) return "invalid-release" as const;
    const p = this.padPosition(c.type);
    const center = c.bounds.getCenter(new THREE.Vector3());
    c.root.position.set(
      p.x - center.x,
      this.roofY + 0.015 - c.bounds.min.y,
      p.z - center.z,
    );
    c.delivered = true;
    this.received[c.type] = true;
    this.held = null;
    this.cargoGrounded = false;
    if (this.received.every(Boolean)) this.phase = "clearance";
    this.updateInteraction();
    return "released" as const;
  }
  resetCargo() {
    if (!this.held || this.phase !== "loading") return false;
    this.held.root.position.copy(this.held.original);
    this.held = null;
    this.cargoGrounded = false;
    this.updateInteraction();
    return true;
  }
}
