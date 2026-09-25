import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VehicleBodyStyles, readVehicleBodyStyle } from '../sources/Game/World/VehicleBodyStyles.js'

// Actual committed gameplay model, with image decoding omitted for headless tests.
const raw = fs.readFileSync(new URL('../static/vehicle/default.glb', import.meta.url))
const length = raw.readUInt32LE(12), document = JSON.parse(raw.subarray(20, 20 + length))
document.buffers[0].uri = `data:application/octet-stream;base64,${raw.subarray(28 + length).toString('base64')}`
document.materials = document.materials.map(material => ({ name: material.name }))
delete document.images; delete document.textures
delete document.extensionsUsed; delete document.extensionsRequired
globalThis.ProgressEvent ??= class { constructor(type, values) { Object.assign(this, values); this.type = type } }
const model = (await new GLTFLoader().parseAsync(JSON.stringify(document), '')).scene
const chassis = model.children.find(child => /^chassis/.test(child.name))
const painted = chassis.children.find(child => /^bodyPainted/.test(child.name))
const wheel = model.children.find(child => /^wheelContainer/.test(child.name))
assert(chassis && painted && wheel, 'upstream vehicle contract')
chassis.position.set(0,0,0); chassis.rotation.set(0,0,0)
// These are the exact runtime connections; the skin does not create new wheels.
for(const [x,z] of [[.9,.75],[.9,-.75],[-.9,.75],[-.9,-.75]])
{
    const clone=wheel.clone(true); clone.position.set(x,-.88,z)
    if(z>0)clone.rotation.y=Math.PI
    chassis.add(clone)
}
const digest = geometry =>
{
    const hash=createHash('sha256')
    for(const attr of Object.values(geometry.attributes)) hash.update(Buffer.from(attr.array.buffer,attr.array.byteOffset,attr.array.byteLength))
    if(geometry.index) hash.update(Buffer.from(geometry.index.array.buffer))
    return hash.digest('hex')
}
let builds=0
const styles = new VehicleBodyStyles(chassis,painted,()=>
{
    builds++
    return { paint:new THREE.MeshBasicMaterial({color:'#c9b58d'}), details:new THREE.MeshBasicMaterial({vertexColors:true}) }
})
const hidden=new Set(styles.h9.map(item=>item.object))
const protectedObjects=[]
chassis.traverse(object=>
{
    if(!hidden.has(object)) protectedObjects.push({object,parent:object.parent,
        transform:[...object.position,...object.quaternion,...object.scale],visible:object.visible,
        geometry:object.geometry,material:object.material,digest:object.isMesh?digest(object.geometry):null})
})
const baselineBox=new THREE.Box3().setFromObject(chassis)
assert.equal(styles.changeTo('unknown'),false)
assert.equal(styles.shas,null)
assert.equal(readVehicleBodyStyle(),'h9')
const saved=new Map()
globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)}
for(let i=0;i<80;i++)
{
    const id=i%2===0?'shas':'h9'
    assert(styles.changeTo(id))
    assert.equal(styles.current,id)
    assert.equal(readVehicleBodyStyle(),id)
    for(const {object,visible} of styles.h9) assert.equal(object.visible,id==='h9'&&visible)
    assert.equal(styles.shas.visible,id==='shas')
    for(const entry of protectedObjects)
    {
        const o=entry.object
        assert.equal(o.parent,entry.parent,o.name)
        assert.deepEqual([...o.position,...o.quaternion,...o.scale],entry.transform,o.name)
        assert.equal(o.visible,entry.visible,o.name)
        assert.equal(o.geometry,entry.geometry,o.name);assert.equal(o.material,entry.material,o.name)
        if(o.isMesh)assert.equal(digest(o.geometry),entry.digest,o.name)
    }
}
assert.equal(builds,1,'reuse one body and two materials across repeated selections')
let triangles=0
styles.shas.traverse(child=>
{
    if(!child.isMesh)return
    const p=child.geometry.attributes.position,n=child.geometry.attributes.normal
    triangles+=p.count/3
    assert([...p.array,...n.array].every(Number.isFinite))
    for(let i=0;i<n.count;i++)assert(Math.abs(new THREE.Vector3().fromBufferAttribute(n,i).length()-1)<1e-4)
    assert.equal(child.geometry.groups.length,0)
})
assert(triangles<5000,`lightweight body: ${triangles}`)
assert.equal(styles.shas.children.length,2)
chassis.updateMatrixWorld(true)
const bodyBox=new THREE.Box3().setFromObject(styles.shas)
assert(baselineBox.containsBox(bodyBox),'new body stays within existing vehicle bounds')

// Rays from the emitting surfaces must reach outside without the new body
// covering any of the unchanged lamps (including the roof brake light).
styles.changeTo('shas')
let lampRays=0
const raycaster=new THREE.Raycaster()
for(const {object} of protectedObjects)
{
    if(!object.isMesh||! /^(headlights|backLights|stopLights|blinker)/.test(object.name))continue
    const geometry=object.geometry,p=geometry.attributes.position,indices=geometry.index?.array
    const count=indices?.length??p.count
    for(let i=0;i<count;i+=3)
    {
        const a=new THREE.Vector3().fromBufferAttribute(p,indices?indices[i]:i).applyMatrix4(object.matrixWorld)
        const b=new THREE.Vector3().fromBufferAttribute(p,indices?indices[i+1]:i+1).applyMatrix4(object.matrixWorld)
        const c=new THREE.Vector3().fromBufferAttribute(p,indices?indices[i+2]:i+2).applyMatrix4(object.matrixWorld)
        const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize()
        const center=a.clone().add(b).add(c).multiplyScalar(1/3).addScaledVector(normal,.0001)
        raycaster.set(center,normal)
        const hits=raycaster.intersectObject(styles.shas,true)
        assert.equal(hits.length,0,`${object.name} triangle ${i/3} covered by ${hits[0]?.object.name}`)
        lampRays++
    }
}
// Storage failure cannot break body selection or driving startup.
globalThis.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}
assert.equal(readVehicleBodyStyle(),'h9');assert(styles.changeTo('shas'))
const geometries=styles.shas.children.map(m=>m.geometry),materials=styles.shas.children.map(m=>m.material)
let disposed=0
for(const resource of [...geometries,...materials])resource.addEventListener('dispose',()=>disposed++)
styles.destroy();assert.equal(disposed,4);assert.equal(styles.shas,null)
for(const {object,visible} of styles.h9)assert.equal(object.visible,visible)
console.log(JSON.stringify({bodyTriangles:triangles,bodyDraws:2,protectedObjects:protectedObjects.length,
    originalBoundsUnchanged:true,unobstructedLampTriangles:lampRays,repeatedSwitches:80,storageFailureHandled:true}))
