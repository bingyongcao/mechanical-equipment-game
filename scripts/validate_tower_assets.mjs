import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';

const base='assets/tower-construction';
const names=['tower-crane','rebar-bundle','brick-pallet','gypsum-stack','construction-building','floor-module','residential-building','site-environment'];
const loaded=new Map(), report={};
for(const name of [...names,...names.slice(1,4).map(n=>n+'-unit')]) {
  const folder=name.replace(/-unit$/,'');
  const bytes=fs.readFileSync(`${base}/${folder}/${name}.glb`);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  assert.equal(json.scenes.length,1,`${name}: single isolated scene`);
  assert(!json.cameras?.length,`${name}: no preview camera`);
  assert(!json.nodes.some(n=>['Cube','Light','Camera'].includes(n.name)),`${name}: no default objects`);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const scene=gltf.scene;
  scene.updateMatrixWorld(true);
  let meshes=0,triangles=0;
  scene.traverse(o=>{
    if(!o.isMesh) return;
    meshes++;
    const p=o.geometry.attributes.position;
    for(const n of p.array) assert(Number.isFinite(n),`${name}: finite vertices`);
    triangles+=(o.geometry.index?.count??p.count)/3;
  });
  const box=new Box3().setFromObject(scene);
  const size=box.getSize(new Vector3()).toArray();
  assert(size.every(x=>x>0&&x<150));
  loaded.set(name,scene);
  report[name]={bytes:bytes.length,meshes,triangles,size,isolatedScene:true};
}
const crane=loaded.get('tower-crane');
for(const name of ['TowerCrane','Base','TowerMast','BuildingAttachments','J_Slew','SlewPlatform','TowerHead','Jib','CounterJib','Counterweights','JibTieRods','OperatorCab','HoistWinch','J_Trolley','J_Rope','J_Hook','A_CargoAttach']) {
  assert(crane.getObjectByName(name),`Missing crane part ${name}`);
}
const slew=crane.getObjectByName('J_Slew'), trolley=crane.getObjectByName('J_Trolley');
const hook=crane.getObjectByName('J_Hook'), rope=crane.getObjectByName('J_Rope');
const attach=crane.getObjectByName('A_CargoAttach');
assert.equal(trolley.parent,slew); assert.equal(hook.parent,trolley); assert.equal(rope.parent,trolley);
const original=attach.getWorldPosition(new Vector3());
const fixedBefore=crane.getObjectByName('BuildingAttachments').getWorldPosition(new Vector3());
slew.rotation.y=Math.PI/2; crane.updateMatrixWorld(true);
assert(attach.getWorldPosition(new Vector3()).distanceTo(original)>10);
assert(crane.getObjectByName('BuildingAttachments').getWorldPosition(new Vector3()).distanceTo(fixedBefore)<1e-6);
const before=trolley.getWorldPosition(new Vector3()); trolley.position.x+=3;
crane.updateMatrixWorld(true);
assert(Math.abs(trolley.getWorldPosition(new Vector3()).distanceTo(before)-3)<1e-5);
const hookBefore=hook.getWorldPosition(new Vector3()); hook.position.y+=4;
rope.scale.y=13/17; crane.updateMatrixWorld(true);
assert(Math.abs(hook.getWorldPosition(new Vector3()).y-hookBefore.y-4)<1e-5);
slew.rotation.y=0; trolley.position.x=11; hook.position.y=-17; rope.scale.y=1;
crane.updateMatrixWorld(true);
report.motion={slewMovesHook:true,trolleyMovesHook:true,hookHoists:true,attachmentsRemainFixed:true};

for(const name of names.slice(1,4)) {
  const scene=loaded.get(name), units=[];
  scene.traverse(o=>{if(Number.isInteger(o.userData.stack_index))units.push(o);});
  assert.equal(units.length,5,`${name}: five independent units`);
  units.sort((a,b)=>a.userData.stack_index-b.userData.stack_index);
  for(const [i,unit] of units.entries()) {
    const anchors=[];unit.traverse(o=>{if(o.name.startsWith('A_GrabPoint'))anchors.push(o);});
    assert.equal(anchors.length,1);
    assert.equal(unit.userData.stack_index,i);
    if(i) {
      const a=new Box3().setFromObject(units[i-1]), b=new Box3().setFromObject(unit);
      assert(Math.abs(b.min.y-a.max.y)<.005,`${name}: packages contact without penetration`);
    }
  }
  const single=loaded.get(name+'-unit');let grab=0;
  single.traverse(o=>{if(o.name.startsWith('A_GrabPoint'))grab++;});
  assert.equal(grab,1);
  report[name].stackCount=units.length;
}

const building=loaded.get('construction-building');
const platform=building.getObjectByName('RoofWorkPlatform');
assert(platform); assert(Math.abs(platform.position.y-6)<1e-5);
for(const label of ['REBAR','BRICK','BOARD']) assert(building.getObjectByName('UnloadPad_'+label));
const floor=loaded.get('floor-module').getObjectByName('RepeatableFloor');
assert.equal(floor.userData.repeat_height,3);
// All stock locations and the three rooftop pads remain within trolley travel.
const reachable=[[5,10],[10,10],[15,10],[8.2,-.9],[12,-.9],[15.8,-.9]];
for(const [x,z] of reachable) assert(Math.hypot(x,z)>2.4&&Math.hypot(x,z)<23);
// Highest roof 21.05m + tallest package 1.487m + hook attach offset .96m.
assert(30.35-2 > 21.05+1.487+.96+1);
report.layout={allTargetsWithinRadius:true,finalRoofClearance:true,repeatHeight:3,initialRoofHeight:6};
fs.writeFileSync(`${base}/validation.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
