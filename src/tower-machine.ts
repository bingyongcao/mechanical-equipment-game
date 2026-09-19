import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import modelUrl from "../assets/tower-construction/tower-crane/tower-crane.glb?url";
export const materialNames = ["钢筋", "砖头", "石膏板"] as const;

// Preserve motion/annotation groups while batching their static, untextured parts.
export function batchTowerAsset(root: THREE.Object3D) {
  const parents: THREE.Object3D[] = [];
  root.traverse((o) => parents.push(o));
  for (const parent of parents) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (
        !(child instanceof THREE.Mesh) ||
        Array.isArray(child.material) ||
        child.children.length
      )
        continue;
      const batch = batches.get(child.material) || [];
      batch.push(child);
      batches.set(child.material, batch);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((mesh) => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.index
          ? mesh.geometry.toNonIndexed()
          : mesh.geometry.clone();
        for (const key of Object.keys(geometry.attributes))
          if (key !== "position" && key !== "normal")
            geometry.deleteAttribute(key);
        return geometry.applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${parent.name}_Batch_${material.name}`;
      meshes.forEach((m) => m.removeFromParent());
      parent.add(mesh);
    }
  }
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

export class TowerMachine {
  root = new THREE.Group();
  model!: THREE.Group;
  nodes = new Map<string, THREE.Object3D>();
  originals = new Map<THREE.Material, THREE.Color>();
  annotationNodes: { text: string; node: THREE.Object3D }[] = [];
  annotationParts = new Map<string, THREE.Object3D>();
  selected = "";
  slew = 0;
  radius = 11;
  ropeLength = 2;

  async load(annotations = true) {
    this.model = (await new GLTFLoader().loadAsync(modelUrl)).scene;
    this.root.add(this.model);
    batchTowerAsset(this.model);
    this.model.traverse((o) => this.nodes.set(o.name, o));
    const parts = [
      ["塔吊基座", "Base"],
      ["塔身", "TowerMast"],
      ["附着杆", "BuildingAttachments"],
      ["塔吊回转机构", "SlewPlatform"],
      ["塔吊驾驶室", "OperatorCab"],
      ["水平吊臂", "Jib"],
      ["平衡臂", "CounterJib"],
      ["塔吊配重", "Counterweights"],
      ["塔帽与拉杆", "JibTieRods"],
      ["变幅小车", "J_Trolley"],
      ["起重吊钩", "J_Hook"],
    ];
    if (annotations)
      for (const [text, name] of parts) {
        const part = this.node(name);
        // Separate materials by semantic part so highlight doesn't light the whole crane.
        const copies = new Map<THREE.Material, THREE.Material>();
        part.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const clone = (m: THREE.Material) => {
            if (!copies.has(m)) copies.set(m, m.clone());
            return copies.get(m)!;
          };
          o.material = Array.isArray(o.material)
            ? o.material.map(clone)
            : clone(o.material);
        });
        part.userData.part_label = text;
        const anchor = new THREE.Object3D();
        const bounds = new THREE.Box3();
        if (name === "J_Trolley") {
          // The rope and hook descend from the trolley but aren't its label anchor.
          for (const child of part.children)
            if (child instanceof THREE.Mesh) bounds.expandByObject(child);
        } else bounds.setFromObject(part);
        const center = bounds.getCenter(new THREE.Vector3());
        part.add(anchor);
        anchor.position.copy(part.worldToLocal(center));
        this.annotationNodes.push({ text, node: anchor });
        this.annotationParts.set(text, part);
      }
    this.model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m instanceof THREE.MeshStandardMaterial)
          this.originals.set(m, m.emissive.clone());
    });
    this.reset();
    return this;
  }
  node(name: string) {
    const node = this.nodes.get(name);
    if (!node) throw new Error(`塔吊缺少节点 ${name}`);
    return node;
  }
  reset() {
    this.slew = 0;
    this.radius = 11;
    this.ropeLength = 2;
    this.pose();
  }
  pose() {
    this.node("J_Slew").rotation.y = this.slew;
    this.node("J_Trolley").position.x = this.radius;
    this.node("J_Hook").position.y = -this.ropeLength;
    this.node("J_Rope").scale.y = this.ropeLength / 17;
    this.root.updateMatrixWorld(true);
  }
  step(inputs: Map<string, number>, dt: number) {
    this.slew =
      THREE.MathUtils.euclideanModulo(
        this.slew + (inputs.get("joint0") || 0) * 0.32 * dt + Math.PI,
        Math.PI * 2,
      ) - Math.PI;
    this.radius = THREE.MathUtils.clamp(
      this.radius - (inputs.get("joint2") || 0) * 3 * dt,
      2.4,
      23,
    );
    this.ropeLength = THREE.MathUtils.clamp(
      this.ropeLength + (inputs.get("joint3") || 0) * 4 * dt,
      2,
      28.5,
    );
    this.pose();
  }
  highlight(label: string) {
    this.selected = label;
    for (const [m, color] of this.originals)
      (m as THREE.MeshStandardMaterial).emissive.copy(color);
    this.annotationParts.get(label)?.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m instanceof THREE.MeshStandardMaterial) m.emissive.set("#80500a");
    });
  }
}
