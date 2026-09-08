import * as THREE from "three";
import { terrainHeight, seededRandom } from "./logic.mjs";
const material = (color: string, roughness = 0.8) =>
  new THREE.MeshStandardMaterial({ color, roughness });
export function cuboid(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}
export function terrainGeometry() {
  const g = new THREE.PlaneGeometry(30, 24);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  return g;
}
function texture(type: "windows" | "soil") {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  if (type === "windows") {
    ctx.fillStyle = "#7c959d";
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 10; y < 256; y += 32)
      for (let x = 7; x < 256; x += 32) {
        ctx.fillStyle = (x + y) % 3 ? "#b4ccd0" : "#e9d9b3";
        ctx.fillRect(x, y, 19, 21);
      }
  } else {
    ctx.fillStyle = "#bba780";
    ctx.fillRect(0, 0, 256, 256);
    const rand = seededRandom(45);
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = rand() > 0.5 ? "#b19e7b" : "#c4b38e";
      ctx.fillRect(rand() * 256, rand() * 256, rand() * 2 + 1, rand() * 2 + 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(type === "soil" ? 12 : 1, type === "soil" ? 10 : 2);
  return t;
}
export function showroom() {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    material("#e9e6de"),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  ground.receiveShadow = true;
  group.add(ground);
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(5.2, 5.3, 0.13, 96),
    material("#d8d5cb"),
  );
  platform.position.set(1.4, -0.06, 0);
  platform.receiveShadow = true;
  group.add(platform);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.84, 4.88, 96),
    new THREE.MeshBasicMaterial({ color: "#b9b8aa", side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(1.4, 0.01, 0);
  group.add(ring);
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const tick = cuboid(
      group,
      1.4 + Math.cos(t) * 5.02,
      0.011,
      Math.sin(t) * 5.02,
      0.025,
      0.012,
      i % 4 === 0 ? 0.18 : 0.09,
      material("#b9b6a9"),
    );
    tick.rotation.y = -t + Math.PI / 2;
  }
  return group;
}
export function buildSite(variant = 0) {
  const group = new THREE.Group(),
    rand = seededRandom(40 + variant);
  const soil = new THREE.MeshStandardMaterial({
    map: texture("soil"),
    roughness: 1,
  });
  const terrain = new THREE.Mesh(terrainGeometry(), soil);
  terrain.receiveShadow = true;
  group.add(terrain);
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(250, 250),
    material("#c3d0c8"),
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.45;
  surround.receiveShadow = true;
  group.add(surround);
  const roadmat = material("#69767a"),
    curb = material("#d9ded7"),
    wallmat = material("#d4cdbb"),
    stripe = material("#d99835");
  cuboid(group, 0, -0.22, -16, 72, 0.1, 6, roadmat);
  cuboid(group, 0, -0.22, 16, 72, 0.1, 6, roadmat);
  cuboid(group, -18, -0.22, 0, 6, 0.1, 64, roadmat);
  cuboid(group, 18, -0.22, 0, 6, 0.1, 64, roadmat);
  for (let i = -30; i < 32; i += 4) {
    cuboid(group, i, -0.155, -16, 1.9, 0.01, 0.1, curb);
    cuboid(group, i, -0.155, 16, 1.9, 0.01, 0.1, curb);
  }
  for (let x = -14; x <= 14; x += 2) {
    for (const z of [-11.6, 11.6]) {
      cuboid(group, x, 0.55, z, 1.95, 1.25, 0.22, wallmat);
      cuboid(group, x, 1.23, z, 2, 0.07, 0.27, stripe);
    }
  }
  for (let z = -10; z <= 10; z += 2) {
    for (const x of [-14.5, 14.5]) {
      cuboid(group, x, 0.55, z, 0.22, 1.25, 1.95, wallmat);
      cuboid(group, x, 1.23, z, 0.27, 0.07, 2, stripe);
    }
  }
  const windowTex = texture("windows");
  const buildingMats = ["#acbcc0", "#ced5cf", "#a0b0b5", "#d1c9b8"].map(
    (color) =>
      new THREE.MeshStandardMaterial({ color, map: windowTex, roughness: 0.6 }),
  );
  for (let i = 0; i < 22; i++) {
    let x: number, z: number;
    if (i < 12) {
      x = -29 + (i % 6) * 11.5;
      z = i < 6 ? -25 : 26;
    } else {
      x = i < 17 ? -27 : 28;
      z = -15 + (i % 5) * 9;
    }
    if (i === 9 || i === 10) continue;
    const h = 6 + rand() * 13,
      w = 4 + rand() * 3,
      d = 4 + rand() * 4;
    cuboid(group, x, h / 2 - 0.25, z, w, h, d, buildingMats[i % 4]);
    cuboid(group, x, h - 0.13, z, w + 0.16, 0.24, d + 0.16, curb);
    cuboid(group, x, h + 0.35, z, w * 0.45, 0.7, d * 0.5, material("#b1bab6"));
  }
  // Elliptical stadium with open green playing field and tiered stands.
  const stadium = new THREE.Group();
  stadium.position.set(7, -0.2, 27);
  group.add(stadium);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.RingGeometry(4.8 + i * 0.6, 5.45 + i * 0.6, 64);
    const m = new THREE.Mesh(g, material(i % 2 ? "#dadbd3" : "#b2c5bf"));
    m.rotation.x = -Math.PI / 2;
    m.scale.x = 1.6;
    m.position.y = 0.8 + i * 0.55;
    stadium.add(m);
  }
  const field = new THREE.Mesh(
    new THREE.CircleGeometry(4.75, 64),
    material("#75a982"),
  );
  field.rotation.x = -Math.PI / 2;
  field.scale.x = 1.55;
  field.position.y = 0.2;
  stadium.add(field);
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    cuboid(
      stadium,
      Math.cos(t) * 10.5,
      1,
      Math.sin(t) * 6.5,
      0.18,
      2.5,
      0.18,
      curb,
    );
  }
  const leaves = [
      material("#6e957a"),
      material("#7b9f80"),
      material("#537b69"),
    ],
    bark = material("#887e66");
  for (let i = 0; i < 34; i++) {
    const x = (i % 2 ? -1 : 1) * (20.8 + rand() * 2),
      z = -32 + rand() * 63;
    cuboid(group, x, 0.8, z, 0.17, 1.7, 0.17, bark);
    const tree = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.2, 1),
      leaves[i % 3],
    );
    tree.position.set(x, 2.1, z);
    tree.scale.y = 1.3;
    tree.castShadow = true;
    group.add(tree);
  }
  // Site office, supply pallets, cones and a small service road.
  cuboid(group, -10, 1.1, -8, 4, 2.2, 2.4, material("#e4e4d9"));
  cuboid(group, -10, 2.23, -8, 4.15, 0.12, 2.55, material("#657a75"));
  for (const x of [-11.2, -9.7])
    cuboid(group, x, 1.4, -6.78, 0.9, 0.6, 0.04, material("#718c91"));
  cuboid(group, -8.6, 0.9, -6.76, 0.65, 1.8, 0.05, material("#62756e"));
  for (let i = 0; i < 5; i++) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.58, 16),
      material("#ed9343"),
    );
    cone.position.set(6 + i * 0.75, 0.29, -7);
    cone.castShadow = true;
    group.add(cone);
    cuboid(
      group,
      6 + i * 0.75,
      0.04,
      -7,
      0.38,
      0.07,
      0.38,
      material("#49524d"),
    );
  }
  const target = variant
    ? { x: 3, z: -4.6, radius: 2.1 }
    : { x: 3, z: 4.6, radius: 2.1 };
  const marker = new THREE.Mesh(
    new THREE.CircleGeometry(target.radius, 64),
    new THREE.MeshBasicMaterial({
      color: "#79b39b",
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(target.x, 0.025, target.z);
  group.add(marker);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(target.radius - 0.045, target.radius + 0.045, 64),
    new THREE.MeshBasicMaterial({ color: "#386f5a", side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(marker.position);
  ring.position.y += 0.006;
  group.add(ring);
  for (let i = 0; i < 4; i++) {
    const t = (i * Math.PI) / 2;
    cuboid(
      group,
      target.x + Math.cos(t) * target.radius,
      0.25,
      target.z + Math.sin(t) * target.radius,
      0.09,
      0.5,
      0.09,
      stripe,
    );
  }
  return { group, target };
}
export function disposeGroup(group: THREE.Group) {
  const materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  for (const m of materials) {
    for (const v of Object.values(m))
      if (v instanceof THREE.Texture) textures.add(v);
    m.dispose();
  }
  textures.forEach((t) => t.dispose());
  group.removeFromParent();
}
