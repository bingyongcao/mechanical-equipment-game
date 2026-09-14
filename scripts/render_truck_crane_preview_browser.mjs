import { chromium } from "@playwright/test";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "assets", "truck-crane", "truck-crane-preview.png");
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });

await page.goto("http://127.0.0.1:5173");
await page.setContent(`<!doctype html>
<style>
  html,body { margin:0; width:100%; height:100%; overflow:hidden; background:linear-gradient(#66737b 0%,#899398 46%,#c4c2ba 100%); }
  canvas { display:block; width:100%; height:100%; }
</style>
<script type="module">
import * as THREE from "/node_modules/three/build/three.module.js";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer.setSize(1600,1100,false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.VSMShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.AgXToneMapping;
renderer.toneMappingExposure=1.05;
document.body.append(renderer.domElement);

const scene=new THREE.Scene();
const model=(await new GLTFLoader().loadAsync("/assets/truck-crane/truck-crane.glb")).scene;
scene.add(model);
const node=(name)=>model.getObjectByName(name);
node("J_BoomPitch").rotation.z=THREE.MathUtils.degToRad(43);
for(const name of ["J_Telescope_1","J_Telescope_2","J_Telescope_3"]) node(name).position.x=.6;
node("J_Hook").position.y=-2.4;
node("WireRope").position.y=-1.2;
node("WireRope").scale.y=2.4/4.2;
const ropeFrame=node("J_RopeVertical");
model.updateMatrixWorld(true);
ropeFrame.quaternion.copy(ropeFrame.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
model.updateMatrixWorld(true);

const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x858b89,roughness:.72,metalness:.03}));
floor.rotation.x=-Math.PI/2;
floor.position.y=-.02;
floor.receiveShadow=true;
scene.add(floor);

scene.add(new THREE.HemisphereLight(0xb9cee0,0x595448,1.45));
function sun(color,intensity,position,castsShadow=false){const light=new THREE.DirectionalLight(color,intensity);light.position.set(...position);light.castShadow=castsShadow;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-12;light.shadow.camera.right=12;light.shadow.camera.top=12;light.shadow.camera.bottom=-12;light.shadow.bias=-.0003;light.shadow.radius=6;scene.add(light);}
sun(0xffdcae,4.0,[4,12,8],true);
sun(0xbad8ff,2.0,[-8,7,-5]);
sun(0xffddb0,2.5,[-5,9,8]);

const box=new THREE.Box3().setFromObject(model);
const center=box.getCenter(new THREE.Vector3());
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
camera.position.copy(center).add(new THREE.Vector3(12,8.5,14));
camera.lookAt(center.x,center.y-.9,center.z);
camera.updateMatrixWorld(true);
const inverse=camera.matrixWorld.clone().invert();
const corners=[];
for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(inverse));
const minX=Math.min(...corners.map(v=>v.x)),maxX=Math.max(...corners.map(v=>v.x));
const minY=Math.min(...corners.map(v=>v.y)),maxY=Math.max(...corners.map(v=>v.y));
const aspect=1600/1100;
const height=Math.max(maxY-minY,(maxX-minX)/aspect)*.72;
camera.top=height/2;camera.bottom=-height/2;camera.left=-height*aspect/2;camera.right=height*aspect/2;
camera.updateProjectionMatrix();
renderer.render(scene,camera);
window.__previewReady=true;
</script>`);

await page.waitForFunction(() => window.__previewReady === true);
await page.locator("canvas").screenshot({ path: output });
await browser.close();
console.log(output);
