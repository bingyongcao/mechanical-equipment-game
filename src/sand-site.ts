import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { cuboid } from "./environment";
import truckUrl from "../assets/dump-truck/dump-truck.glb?url";
export const TRUCK = { x: 0, y: 0, z: -13.6 };
export const SAND_WALLS = [
  { center: [0, 0.65, -11.6], half: [14.5, 0.65, 0.15] },
  { center: [0, 0.65, 11.6], half: [14.5, 0.65, 0.15] },
  { center: [-14.5, 0.65, 0], half: [0.15, 0.65, 11.6] },
  { center: [14.5, 0.65, 0], half: [0.15, 0.65, 11.6] },
];
export async function buildSandSite() {
  const group = new THREE.Group();
  group.name = "IndustrialSandYard";
  const mat = (c: string) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const ground = mat("#abb3a5"),
    road = mat("#61696a"),
    wall = mat("#b9b6a6"),
    stripe = mat("#e5ac50");
  cuboid(group, 0, -0.12, 0, 150, 0.2, 150, ground);
  cuboid(group, 0, -0.035, -15.3, 80, 0.05, 6, road);
  cuboid(group, 0, -0.035, 15.3, 80, 0.05, 6, road);
  for (const x of [-18, 18]) cuboid(group, x, -0.035, 0, 6, 0.05, 32, road);
  for (let x = -38; x < 40; x += 4)
    for (const z of [-16, 16])
      cuboid(group, x, 0, z, 1.8, 0.012, 0.12, mat("#e0ddbf"));
  for (const w of SAND_WALLS) {
    cuboid(
      group,
      w.center[0],
      w.center[1],
      w.center[2],
      w.half[0] * 2,
      w.half[1] * 2,
      w.half[2] * 2,
      wall,
    );
    cuboid(
      group,
      w.center[0],
      1.32,
      w.center[2],
      w.half[0] * 2,
      0.05,
      w.half[2] * 2,
      stripe,
    );
  }
  const walls = mat("#c2c6bd"),
    roof = mat("#758780"),
    door = mat("#5c7275");
  for (const z of [-24, 25])
    for (const x of [-24, -10, 5, 23]) {
      cuboid(group, x, 1.65, z, 10, 3.3, 8, walls);
      cuboid(group, x, 3.35, z, 10.5, 0.2, 8.5, roof);
      for (const offset of [-2.5, 2.5])
        cuboid(
          group,
          x + offset,
          1.2,
          z + (z < 0 ? 4.01 : -4.01),
          2.6,
          2.4,
          0.035,
          door,
        );
      for (const offset of [-3, 0, 3])
        cuboid(
          group,
          x + offset,
          2.8,
          z + (z < 0 ? 4.04 : -4.04),
          1.8,
          0.4,
          0.05,
          mat("#b0ccd0"),
        );
    }
  const truck = (await new GLTFLoader().loadAsync(truckUrl)).scene;
  truck.name = "SandTruck";
  truck.position.set(TRUCK.x, TRUCK.y, TRUCK.z);
  truck.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  group.add(truck);
  return { group, target: { x: -1, z: TRUCK.z, radius: 1 } };
}
