import fs from 'node:fs';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3,Vector3} from 'three';
import {createH9Adapter} from './motri2_h9.js';
const path=process.argv[2]||'Haval_H9_Motri2.glb';
const b=fs.readFileSync(path);
const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const a=createH9Adapter(gltf.scene);
const scene=gltf.scene;
const before={};scene.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))before[m.name]=m.color.getHexString();});
a.setBodyColor('#aa1122');
let painted=0;scene.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material)){
 if(m.name==='Mat_Body_MatteGrey'){assert.equal(m.color.getHexString(),'aa1122');painted++;}
 else assert.equal(m.color.getHexString(),before[m.name]);
}});
a.setBodyColor('#626467');
const canvas={width:1024,height:226};a.setPlateCanvases(canvas);
for(const p of a.plates){assert(p.material.map);assert.equal(p.material.map.flipY,false);assert.equal(p.geometry.attributes.uv.count,4);}
assert(!a.root.getObjectByName('H9_LicensePlate_Front').material.map);
const centers={};a.root.updateMatrixWorld(true);
for(const [name,o] of Object.entries(a.wheels))centers[name]=o.getWorldPosition(new Vector3());
let tests=0,maxDrift=0;
for(const degrees of [-30,0,30])for(let angle=0;angle<=360;angle+=15){
 a.setSteeringRadians(degrees*Math.PI/180);a.setTravelMeters(angle*Math.PI/180*a.radius);a.root.updateMatrixWorld(true);
 for(const [name,o] of Object.entries(a.wheels)){const drift=o.getWorldPosition(new Vector3()).distanceTo(centers[name]);maxDrift=Math.max(maxDrift,drift);assert(drift<1e-6);}
 tests++;
}
a.setSteeringRadians(0);a.setTravelMeters(0);a.root.updateMatrixWorld(true);
const bounds={};for(const [name,o] of Object.entries(a.wheels)){
 const bb=new Box3().setFromObject(o);bounds[name]={min:bb.min.toArray(),max:bb.max.toArray(),dimensions:bb.getSize(new Vector3()).toArray()};assert(Math.abs(bb.min.y)<1e-6);
}
for(const name of ['FL','FR','RL','RR']){
 a.setWheelVerticalOffset(name,.06);a.root.updateMatrixWorld(true);assert(Math.abs(a.wheels[name].getWorldPosition(new Vector3()).y-centers[name].y-.06)<1e-6);a.setWheelVerticalOffset(name,0);
}
let triangles=0,primitives=0;const materials=new Set();scene.traverse(o=>{if(o.isMesh){primitives++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;[].concat(o.material).forEach(m=>materials.add(m.name));}});
assert(triangles>=20000&&triangles<=40000);
assert.equal(gltf.animations.length,0);
const report={threejs_load:'PASS',triangles,render_primitives:primitives,materials:[...materials],body_color_isolation:'PASS',painted_primitives:painted,license_plate_texture_assignment:'PASS',license_plate_uvs:'PASS',pose_tests:tests,wheel_center_max_drift_m:maxDrift,wheel_bounds:bounds,suspension_offset_adapter:'PASS',animations:gltf.animations.length,limitations:['No WebGL rendering or on-device performance benchmark in this check.','Motri2 source repository was not supplied or modified.','Blender studio renders provide visual verification.']};
fs.writeFileSync('three_validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
