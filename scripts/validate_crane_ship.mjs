import fs from 'node:fs';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3,Vector3} from 'three';
const report={};
for(const name of ['truck-crane','cargo-ship']) {
 const path=`assets/${name}/${name}.glb`, b=fs.readFileSync(path);
 const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const root=gltf.scene; root.updateMatrixWorld(true);
 const required=name==='truck-crane'?['TruckCrane','J_Slew','J_BoomPitch','J_Telescope_1','J_Telescope_2','J_Telescope_3','J_RopeVertical','J_Hook','WireRope','A_CargoAttach']:['CargoShip',...Array.from({length:5},(_,i)=>`Cargo_${i+1}`)];
 for(const n of required) assert(root.getObjectByName(n),`Missing ${n}`);
 let meshes=0,triangles=0;
 root.traverse(o=>{if(o.isMesh){meshes++;const p=o.geometry.attributes.position;for(const x of p.array) assert(Number.isFinite(x));triangles+=(o.geometry.index?.count??p.count)/3;}});
 const size=new Box3().setFromObject(root).getSize(new Vector3()).toArray();
 assert(size.every(x=>x>0&&x<30));
 if(name==='truck-crane') {
  const j=root.getObjectByName('J_Slew'),h=root.getObjectByName('J_Hook');
  const before=h.getWorldPosition(new Vector3()); j.rotation.y+=.3;root.updateMatrixWorld(true);
  assert(h.getWorldPosition(new Vector3()).distanceTo(before)>.1,'Slew must move hook');
  assert.equal(root.getObjectByName('J_Telescope_3').parent.name,'J_Telescope_2');
 } else {
  for(let i=1;i<=5;i++) assert(root.getObjectByName(`Cargo_${i}`).children.some(o=>o.name.startsWith('A_GrabPoint')));
 }
 report[name]={bytes:b.length,meshes,triangles,size,requiredNodesPassed:true,finiteGeometry:true};
}
fs.writeFileSync('assets/truck-crane/validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
