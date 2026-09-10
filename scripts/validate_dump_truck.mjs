import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';

const dir = new URL('../assets/dump-truck/', import.meta.url);
const buffer = fs.readFileSync(new URL('dump-truck.glb', dir));
const config = JSON.parse(fs.readFileSync(new URL('dump-truck.physics.json', dir), 'utf8'));
const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
gltf.scene.updateMatrixWorld(true);
for (const name of ['DumpTruck', 'J_Tipper', 'J_Tailgate']) assert.ok(gltf.scene.getObjectByName(name), name);
const bounds = new THREE.Box3().setFromObject(gltf.scene);
assert.ok(Math.abs(bounds.min.y) < .03, 'Tires rest at zero');
assert.ok(bounds.max.x - bounds.min.x > 6 && bounds.max.x - bounds.min.x < 8);
let triangles = 0, meshes = 0;
gltf.scene.traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; }});
const {innerMin: min, innerMax: max} = config.bed;
const capacity = min.reduce((v, x, i) => v * (max[i] - x), 1);
assert.ok(Math.abs(capacity - config.bed.capacityM3) < 1e-9);
assert.ok(Math.abs(capacity * .8 - config.bed.targetVolumeM3) < 1e-9);
// Ensure exported visual walls match collision boxes in the loading pose.
for (const c of config.colliders) {
  const node = gltf.scene.getObjectByName(c.name);
  assert.ok(node, c.name);
  const box = new THREE.Box3().setFromObject(node);
  const center = box.getCenter(new THREE.Vector3()).toArray();
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(.5).toArray();
  for (let i=0;i<3;i++) {
    assert.ok(Math.abs(center[i]-c.center[i]) < .002, `${c.name} center ${i}`);
    assert.ok(Math.abs(half[i]-c.halfExtents[i]) < .002, `${c.name} extent ${i}`);
  }
}
await RAPIER.init();
const world = new RAPIER.World({x:0,y:-9.81,z:0});
world.timestep=1/120;
for (const c of config.colliders) world.createCollider(RAPIER.ColliderDesc.cuboid(...c.halfExtents).setTranslation(...c.center).setFriction(.7));
const bodies=[];
for (let x=0;x<8;x++) for (let z=0;z<4;z++) {
  const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-2.7+x*.48,3.6,-.8+z*.5).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.ball(.07).setFriction(.7).setRestitution(.02),b); bodies.push(b);
}
for(let i=0;i<720;i++) world.step();
for (const b of bodies) {
  const p=b.translation();
  assert.ok(p.x>min[0] && p.x<max[0] && p.z>min[2] && p.z<max[2]);
  assert.ok(p.y>min[1] && p.y<min[1]+.15, 'Open top and solid bottom');
}
// Fire projectiles against all four walls, below the rim.
for (const [vx,vz] of [[6,0],[-6,0],[0,6],[0,-6]]) {
  const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-1,2.3,0).setLinvel(vx,0,vz).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.ball(.07).setRestitution(.02),b);
  for(let i=0;i<240;i++) world.step();
  const p=b.translation(); assert.ok(p.x>min[0] && p.x<max[0] && p.z>min[2] && p.z<max[2], 'Side wall retains projectile');
}
world.free();
const report={passed:true,bytes:buffer.length,meshes,triangles,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},capacityM3:capacity,targetVolumeM3:config.bed.targetVolumeM3,dropBodies:32,wallTests:4,scope:'Asset loading and rigid-body container validation only; not sand simulation or 80% gameplay completion.'};
fs.writeFileSync(new URL('validation.json',dir),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
