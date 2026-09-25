import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { VehicleUnderglow } from '../sources/Game/World/VehicleUnderglow.js'
import { vehicleUnderglow } from '../sources/Game/Materials/VehicleUnderglowNode.js'

const chassis = new THREE.Group()
const glow = new VehicleUnderglow(chassis)
const wheels = [[.9,.75],[.9,-.75],[-.9,.75],[-.9,-.75]].map(([x,z]) => ({
    inContact: true, contactPoint: new THREE.Vector3(x,0,z),
}))
const vehicle = { position: new THREE.Vector3(0,1.2,0), quaternion: new THREE.Quaternion(), wheels: { items: wheels } }
const snapshot = JSON.stringify(vehicle)
glow.update(vehicle)
assert.equal(JSON.stringify(vehicle), snapshot, 'visual effect must not change vehicle physics')
assert.equal(vehicleUnderglow.strength.value,1.8)
assert(vehicleUnderglow.center.value.length() < 1e-6)
assert.equal(glow.geometry.index.count / 3,48)
assert.equal(chassis.children.length,1)
assert.equal(glow.strips.castShadow,false)

// Rotated vehicle on a raised ramp: the field must follow both height and heading.
const ramp = new THREE.Quaternion().setFromEuler(new THREE.Euler(0,.7,.3,'YXZ'))
const offset = new THREE.Vector3(12,4,-7)
for(const wheel of wheels) wheel.contactPoint.applyQuaternion(ramp).add(offset)
vehicle.position.set(0,1.2,0).applyQuaternion(ramp).add(offset)
vehicle.quaternion.copy(ramp)
glow.update(vehicle)
assert(vehicleUnderglow.center.value.distanceTo(offset) < 1e-6)
const up = new THREE.Vector3(0,1,0).applyQuaternion(ramp)
assert(vehicleUnderglow.normal.value.distanceTo(up) < 1e-6)
assert(Math.abs(vehicleUnderglow.forward.value.dot(up)) < 1e-6)
assert(Math.abs(vehicleUnderglow.right.value.dot(up)) < 1e-6)
assert(Math.abs(vehicleUnderglow.forward.value.dot(vehicleUnderglow.right.value)) < 1e-6)

// Airborne state and teleport must not leave the previous ground patch active.
for(const wheel of wheels) wheel.inContact = false
glow.update(vehicle)
assert.equal(vehicleUnderglow.strength.value,0)
vehicle.position.y += 10
wheels[0].inContact = true
glow.update(vehicle)
assert.equal(vehicleUnderglow.strength.value,0)
vehicle.position.y -= 10
glow.update(vehicle)
assert.equal(vehicleUnderglow.strength.value,.9)
vehicle.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI)
glow.update(vehicle)
assert.equal(vehicleUnderglow.strength.value,0)
vehicle.quaternion.copy(ramp)
chassis.visible = false
glow.update(vehicle)
assert.equal(vehicleUnderglow.strength.value,0)

let disposed = 0
glow.geometry.addEventListener('dispose',()=>disposed++)
glow.material.addEventListener('dispose',()=>disposed++)
glow.destroy()
assert.equal(disposed,2)
assert.equal(chassis.children.length,0)
console.log({triangles:48,draws:1,extraTextures:0,physicsUnchanged:true,rampHeadingAndHeight:true,airborneAndRespawn:true,cleanup:true})
