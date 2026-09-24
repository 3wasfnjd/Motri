import fs from 'node:fs';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3,Vector3,Quaternion} from 'three';
import {configureRestHouse} from './motri2_rest_house.js';

// Node has no browser bitmap implementation. The PNG is separately decoded
// with Pillow; this shim checks texture wiring, not WebGL texture rendering.
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{
  const b=Buffer.from(await blob.arrayBuffer());
  assert.equal(b.subarray(1,4).toString(),'PNG');
  return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};
};
globalThis.ProgressEvent=class {constructor(type,init){this.type=type;Object.assign(this,init);}};
const path=process.argv[2]||'RestHouse_Motri2.glb';
const data=fs.readFileSync(path);
const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const a=configureRestHouse(gltf.scene);
assert.deepEqual(a.getSpawn().toArray(),[0,0,-5.5]);
let triangles=0,drawCalls=0,lights=0,cameras=0;
const mats=new Set(),textures=new Set();
gltf.scene.traverse(o=>{
  if(o.isLight)lights++;
  if(o.isCamera)cameras++;
  if(o.isMesh){
    drawCalls++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;
    for(const m of [].concat(o.material)){
      mats.add(m.name);assert.equal(m.transparent,false);
      if(m.map){textures.add(m.map.uuid);assert.equal(m.map.image.width,512);assert.equal(m.map.image.height,512);}
    }
  }
});
assert(triangles<=12000);assert(drawCalls<=20);assert.equal(mats.size,5);assert.equal(textures.size,1);
assert.equal(gltf.animations.length,0);assert.equal(lights,0);assert.equal(cameras,0);
const left=new Box3().setFromObject(a.gateLeft),right=new Box3().setFromObject(a.gateRight);
const clear=left.min.x-right.max.x;assert(clear>5.0);
assert(left.max.z<.1&&right.max.z<.1,'Gate leaves must open outside the site.');
const defs=a.getColliders();
for(const [name,obj] of [['Gate_Left',a.gateLeft],['Gate_Right',a.gateRight]]){
  const q=new Quaternion().fromArray(defs.find(x=>x.name===name).quaternion);
  assert(Math.abs(q.dot(obj.getWorldQuaternion(new Quaternion())))>0.999999);
}
const scale=1.5,yaw=.4,position=[7,0,-3];
const b=configureRestHouse(gltf.scene,{scale,yaw,position});
const expect=new Vector3(0,0,-5.5).multiplyScalar(scale).applyAxisAngle(new Vector3(0,1,0),yaw).add(new Vector3(...position));
assert(b.getSpawn().distanceTo(expect)<1e-6);
assert(Math.abs(b.getColliders()[0].size[0]-defs[0].size[0]*scale)<1e-6);
configureRestHouse(gltf.scene);
const report={threejs_structural_load:'PASS',bytes:data.length,triangles,render_primitives:drawCalls,materials:[...mats],textures:textures.size,embedded_image_resolution:[512,512],entrance_clearance_m:clear,gate_collision_alignment:'PASS',placement_helper:'PASS',opaque_materials:'PASS',export_cameras:cameras,export_lights:lights,animations:gltf.animations.length,limitations:['Node bitmap shim verifies texture wiring; PNG pixels are separately decoded by Pillow.','No WebGL, mobile frame-rate or Motri2 driving test performed.','Collider data needs connecting to the game physics engine.']};
fs.writeFileSync('three_validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
