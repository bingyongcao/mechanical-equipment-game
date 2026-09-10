import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import rig from "../assets/excavator/excavator.rig.json";
import physics from "../assets/excavator/excavator.physics.json";
import { rockerAngle, clamp, terrainHeight } from "./logic.mjs";
import modelUrl from "../assets/excavator/excavator.glb?url";
export const jointNames = ["J_Slew", "J_Boom", "J_Stick", "J_Bucket"] as const;
const Y = new THREE.Vector3(0, 1, 0),
  Z = new THREE.Vector3(0, 0, -1);
export class Machine {
  root = new THREE.Group();
  model!: THREE.Group;
  nodes = new Map<string, THREE.Object3D>();
  angles = [0, 0, 0, 0];
  heading = 0;
  supportHeight: ((x: number, z: number) => number) | null = null;
  siteGuard: (() => "ground" | "wall" | "office" | null) | null = null;
  blocked = false;
  blockedReason: "ground" | "wall" | "office" | null = null;
  selected = "";
  scoopAssist = false;
  scoopAssistReady = false;
  colliders = physics.colliders;
  annotationNodes: { text: string; node: THREE.Object3D }[] = [];
  originals = new Map<THREE.Material, THREE.Color>();
  async load() {
    const gltf = await new GLTFLoader().loadAsync(modelUrl);
    this.model = gltf.scene;
    this.root.add(this.model);
    this.model.traverse((o) => {
      this.nodes.set(o.userData.name || o.name, o);
      this.nodes.set(o.name, o);
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m instanceof THREE.MeshStandardMaterial) {
            m.envMapIntensity = 0.85;
            this.originals.set(m, m.emissive.clone());
          }
        }
      }
    });
    // Source labels include one erased during link refinement: recreate that anchor.
    for (const a of rig.annotations)
      this.annotationNodes.push({ text: a.text, node: this.node(a.node) });
    this.annotationNodes.push({
      text: "连杆",
      node: this.node("J_BucketLink"),
    });
    this.pose();
  }
  node(name: string) {
    const n =
      this.nodes.get(name) ||
      this.nodes.get(THREE.PropertyBinding.sanitizeNodeName(name));
    if (!n) throw new Error("模型缺少部件 " + name);
    return n;
  }
  pose() {
    this.root.rotation.y = this.heading;
    jointNames.forEach((n, i) =>
      this.node(n).quaternion.setFromAxisAngle(i === 0 ? Y : Z, this.angles[i]),
    );
    this.node("J_BucketRocker").quaternion.setFromAxisAngle(
      Z,
      rockerAngle(this.angles[3]),
    );
    this.root.updateMatrixWorld(true);
    this.aim(this.node("J_BucketLink"), this.node("Bucket_link_target"));
    for (const h of rig.hydraulics) {
      this.aim(this.node(h.barrel), this.node(h.tip));
      this.aim(this.node(h.rod), this.node(h.base));
    }
    this.root.updateMatrixWorld(true);
  }
  aim(o: THREE.Object3D, target: THREE.Object3D) {
    const direction = target
      .getWorldPosition(new THREE.Vector3())
      .sub(o.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const parentQ = o.parent!.getWorldQuaternion(new THREE.Quaternion());
    // Planar linkage: keep lateral axis parallel to the stick plane.
    const lateral = new THREE.Vector3(0, 0, 1).applyQuaternion(
      this.node("J_Stick").getWorldQuaternion(new THREE.Quaternion()),
    );
    const x = new THREE.Vector3().crossVectors(direction, lateral).normalize();
    const z = new THREE.Vector3().crossVectors(x, direction).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(x, direction, z),
    );
    o.quaternion.copy(parentQ.invert().multiply(q));
    o.updateMatrixWorld(true);
  }
  reset(site = false) {
    this.setScoopAssist(false);
    this.blocked = false;
    this.blockedReason = null;
    this.angles = [0, 0, 0, 0];
    this.heading = 0;
    this.root.position.set(site ? -6 : 0, site ? terrainHeight(-6, 0) : 0, 0);
    this.pose();
  }
  step(inputs: Map<string, number>, dt: number, site: boolean) {
    const rates = [0.38, 0.24, 0.3, 0.42];
    this.blockedReason = null;
    if (!site || [1, 2, 3].some((i) => inputs.get("joint" + i)))
      this.setScoopAssist(false);
    const proposed = this.angles.slice();
    jointNames.forEach((_, i) => {
      const limits = rig.joints[i].limitsDegrees.map((v) =>
        THREE.MathUtils.degToRad(v),
      );
      proposed[i] = clamp(
        this.angles[i] + (inputs.get("joint" + i) || 0) * rates[i] * dt,
        limits[0],
        limits[1],
      );
    });
    if (this.scoopAssist) {
      const target = this.assistTarget();
      const duration = Math.max(
        ...[1, 2, 3].map(
          (i) => Math.abs(target[i] - this.angles[i]) / rates[i],
        ),
      );
      const fraction = duration > 0 ? Math.min(1, dt / duration) : 1;
      for (const i of [1, 2, 3])
        proposed[i] = this.angles[i] + (target[i] - this.angles[i]) * fraction;
    }
    this.moveJoints(proposed, site);
    // A blocked alignment must not trap the machine by suppressing driving.
    if (this.scoopAssist && this.blockedReason) this.setScoopAssist(false);
    if (this.scoopAssist) {
      const target = this.assistTarget();
      this.scoopAssistReady = [1, 2, 3].every(
        (i) => Math.abs(this.angles[i] - target[i]) < 0.002,
      );
    }
    if (site) {
      const pos = this.root.position.clone(),
        heading = this.heading;
      this.heading += (inputs.get("steer") || 0) * 0.48 * dt;
      // Finish lowering before driving into the pile with the assist enabled.
      const drive =
        this.scoopAssist && !this.scoopAssistReady
          ? 0
          : (inputs.get("drive") || 0) * 1.1 * dt;
      this.root.position.x += Math.cos(this.heading) * drive;
      this.root.position.z -= Math.sin(this.heading) * drive;
      this.root.position.y = (this.supportHeight || terrainHeight)(
        this.root.position.x,
        this.root.position.z,
      );
      this.pose();
      const reason = this.poseBlockReason();
      if (reason) {
        this.heading = heading;
        this.root.position.copy(pos);
        this.pose();
        this.blockedReason = reason;
      }
    }
    this.blocked = this.blockedReason !== null;
  }
  setScoopAssist(enabled: boolean) {
    this.scoopAssist = enabled;
    this.scoopAssistReady = false;
  }
  assistTarget() {
    // Neutral stick and a level bucket. Solve boom elevation so the shared
    // cutting-edge skid point sits 18mm above the flat physical ground.
    const offset = this.node("J_Stick")
      .position.clone()
      .add(this.node("J_Bucket").position);
    const pivotY =
      this.node("J_Slew").position.y + this.node("J_Boom").position.y;
    const height = pivotY + rig.bucketGeometry.skidPoint[1] - 0.018;
    const boom =
      Math.asin(clamp(height / Math.hypot(offset.x, offset.y), -1, 1)) +
      Math.atan2(offset.y, offset.x);
    return [this.angles[0], boom, 0, -boom];
  }
  moveJoints(proposed: number[], site: boolean) {
    const old = this.angles.slice();
    this.angles = proposed;
    this.pose();
    const reason = site ? this.poseBlockReason() : null;
    if (!reason) return;
    this.blockedReason = reason;
    // Clip at contact rather than reverting the entire input frame. Driving
    // is handled separately, so holding "lower" cannot freeze a ground-level pass.
    let low = 0,
      high = 1;
    for (let i = 0; i < 10; i++) {
      const t = (low + high) / 2;
      this.angles = old.map((a, j) => a + (proposed[j] - a) * t);
      this.pose();
      if (this.poseBlockReason()) high = t;
      else low = t;
    }
    this.angles = old.map((a, j) => a + (proposed[j] - a) * low);
    this.pose();
  }
  validPose() {
    return this.poseBlockReason() === null;
  }
  poseBlockReason(): "ground" | "wall" | "office" | null {
    if (this.siteGuard) return this.siteGuard();
    const p = new THREE.Vector3();
    // Guard every work-equipment collider vertex against terrain and the enclosure.
    for (const c of this.colliders) {
      const matrix = this.node(c.parent).matrixWorld;
      for (const v of c.vertices) {
        p.fromArray(v).applyMatrix4(matrix);
        // Match the inner faces of the 0.3m wall colliders, with 1cm clearance.
        if (Math.abs(p.x) > 14.34 || Math.abs(p.z) > 11.44) return "wall";
        if (p.y < terrainHeight(p.x, p.z) + 0.004) return "ground";
        if (p.x > -12.1 && p.x < -7.9 && p.z > -9.3 && p.z < -6.7 && p.y < 2.4)
          return "office";
      }
    }
    return null;
  }
  highlight(label: string) {
    this.selected = label;
    for (const [m, c] of this.originals)
      (m as THREE.MeshStandardMaterial).emissive.copy(c);
    // Materials are shared; clone on the selected mesh for local highlight.
    this.model.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.originalMaterials) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          m.dispose();
        o.material = o.userData.originalMaterials;
        delete o.userData.originalMaterials;
      }
    });
    const names: Record<string, string> = {
      动臂: "J_Boom",
      斗杆: "J_Stick",
      铲斗: "J_Bucket",
      连杆: "J_BucketLink",
      驾驶室: "J_Slew",
      履带: "J_Base",
      液压缸: "Boom lift -0.34_barrel",
    };
    const node = names[label] ? this.node(names[label]) : null;
    if (node) {
      const mesh = node.children.find((o) => o instanceof THREE.Mesh) as
        THREE.Mesh | undefined;
      if (mesh) {
        mesh.userData.originalMaterials = mesh.material;
        mesh.material = (
          Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        ).map((m) => {
          const c = m.clone() as THREE.MeshStandardMaterial;
          c.emissive.set("#80500a");
          return c;
        });
      }
    }
  }
  bucketContains(world: THREE.Vector3) {
    const p = this.node("J_Bucket").worldToLocal(world.clone());
    if (Math.abs(p.z) > rig.bucketGeometry.innerHalfWidth) return false;
    // Use the hollow bucket profile rather than a box, which would also
    // include already-unloaded rocks below the mouth when the bucket tips.
    const outline = rig.bucketGeometry.innerProfileXY;
    let inside = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, yi] = outline[i],
        [xj, yj] = outline[j];
      if (
        yi > p.y !== yj > p.y &&
        p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
      )
        inside = !inside;
    }
    return inside;
  }
}
