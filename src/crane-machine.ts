import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import modelUrl from "../assets/truck-crane/truck-crane.glb?url";

const Y = new THREE.Vector3(0, 1, 0);

export class CraneMachine {
  root = new THREE.Group();
  model!: THREE.Group;
  nodes = new Map<string, THREE.Object3D>();
  originals = new Map<THREE.Material, THREE.Color>();
  annotationNodes: { text: string; node: THREE.Object3D }[] = [];
  annotationParts = new Map<string, THREE.Object3D>();
  angles = [0, THREE.MathUtils.degToRad(43), 0, 0.8];
  selected = "";
  private rope!: THREE.Object3D;
  private ropeFrame!: THREE.Object3D;
  private hook!: THREE.Object3D;
  private telescope: THREE.Object3D[] = [];

  async load() {
    const gltf = await new GLTFLoader().loadAsync(modelUrl);
    this.model = gltf.scene;
    this.root.add(this.model);
    this.model.traverse((o) => {
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
    this.rope = this.node("WireRope");
    this.ropeFrame = this.node("J_RopeVertical");
    this.hook = this.node("J_Hook");
    this.telescope = [1, 2, 3].map((i) => this.node(`J_Telescope_${i}`));
    const annotations: [string, string, string][] = [
      ["底盘与支腿", "Chassis", "Chassis"],
      ["回转平台", "UpperPlatform", "J_Slew"],
      ["吊臂系统", "Boom_Main", "J_BoomPitch"],
      ["起升机构", "WinchDrum", "WinchDrum"],
      ["钢丝绳与吊钩", "HookBlock", "J_Hook"],
      ["操作室", "OperatorCab", "OperatorCab"],
    ];
    for (const [text, anchorName, partName] of annotations) {
      const mesh = this.node(anchorName),
        part = this.node(partName),
        center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()),
        anchor = new THREE.Object3D();
      anchor.name = `Annotation_${text}`;
      mesh.add(anchor);
      anchor.position.copy(mesh.worldToLocal(center));
      part.userData.part_label = text;
      this.annotationParts.set(text, part);
      this.annotationNodes.push({ text, node: anchor });
    }
    this.model.traverse((o) => {
      if (/^(Outrigger|SupportPad|Chassis)/.test(o.name))
        o.userData.part_label = "底盘与支腿";
    });
    this.reset();
  }

  node(name: string) {
    const node = this.nodes.get(name);
    if (!node) throw new Error("起重机模型缺少部件 " + name);
    return node;
  }

  reset() {
    this.angles = [0, THREE.MathUtils.degToRad(43), 0, 0.8];
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.pose();
  }

  step(inputs: Map<string, number>, dt: number) {
    this.angles[0] += (inputs.get("joint0") || 0) * 0.42 * dt;
    this.angles[1] = THREE.MathUtils.clamp(
      this.angles[1] - (inputs.get("joint1") || 0) * 0.25 * dt,
      THREE.MathUtils.degToRad(15),
      THREE.MathUtils.degToRad(75),
    );
    this.angles[2] = THREE.MathUtils.clamp(
      this.angles[2] - (inputs.get("joint2") || 0) * 1.35 * dt,
      0,
      6,
    );
    this.angles[3] = THREE.MathUtils.clamp(
      this.angles[3] + (inputs.get("joint3") || 0) * 1.6 * dt,
      0.8,
      10,
    );
    this.pose();
  }

  pose() {
    this.node("J_Slew").quaternion.setFromAxisAngle(Y, this.angles[0]);
    this.node("J_BoomPitch").rotation.z = this.angles[1];
    const section = 0.6 + this.angles[2] / 3;
    this.telescope.forEach((o) => (o.position.x = section));
    this.model.updateMatrixWorld(true);
    const parentWorld = this.ropeFrame.parent!.getWorldQuaternion(new THREE.Quaternion());
    this.ropeFrame.quaternion.copy(parentWorld.invert());
    this.hook.position.y = -this.angles[3];
    this.rope.position.y = -this.angles[3] / 2;
    this.rope.scale.y = this.angles[3] / 4.2;
    this.model.updateMatrixWorld(true);
  }

  highlight(label: string) {
    this.selected = label;
    for (const [m, color] of this.originals)
      (m as THREE.MeshStandardMaterial).emissive.copy(color);
    const part = this.annotationParts.get(label);
    part?.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m instanceof THREE.MeshStandardMaterial) m.emissive.set("#80500a");
    });
  }
}
