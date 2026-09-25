import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { vehicleUnderglow } from '../Materials/VehicleUnderglowNode.js'

export class VehicleUnderglow
{
    constructor(chassis)
    {
        this.chassis = chassis
        this.contacts = []
        this.up = new THREE.Vector3()
        this.a = new THREE.Vector3()
        this.b = new THREE.Vector3()
        this.normal = new THREE.Vector3()
        this.center = new THREE.Vector3()
        this.forward = new THREE.Vector3()
        this.right = new THREE.Vector3()

        const parts = []
        for(const z of [-0.57, 0.57])
            parts.push(new THREE.BoxGeometry(2.18, 0.035, 0.035).translate(0, -0.44, z))
        for(const x of [-1.09, 1.09])
            parts.push(new THREE.BoxGeometry(0.035, 0.035, 1.1).translate(x, -0.44, 0))
        this.geometry = mergeGeometries(parts)
        for(const part of parts) part.dispose()
        this.material = new THREE.MeshBasicNodeMaterial({ color: '#00dfff' })
        this.material.color.multiplyScalar(3)
        this.strips = new THREE.Mesh(this.geometry, this.material)
        this.strips.name = 'Vehicle_Neon_Underglow'
        this.strips.castShadow = false
        this.strips.receiveShadow = false
        chassis.add(this.strips)
    }

    update(vehicle)
    {
        vehicleUnderglow.strength.value = 0
        this.up.set(0, 1, 0).applyQuaternion(vehicle.quaternion)
        if(!this.chassis.visible || this.up.y < 0.35) return

        this.contacts.length = 0
        this.center.set(0, 0, 0)
        for(const wheel of vehicle.wheels.items)
        {
            const point = wheel.contactPoint
            if(wheel.inContact && point && Number.isFinite(point.x + point.y + point.z))
            {
                this.contacts.push(point)
                this.center.add(point)
            }
        }
        // No stale ground projection while airborne or during respawn.
        if(this.contacts.length === 0) return
        this.center.divideScalar(this.contacts.length)
        this.normal.copy(this.up)
        if(this.contacts.length >= 3)
        {
            this.a.subVectors(this.contacts[1], this.contacts[0])
            this.b.subVectors(this.contacts[2], this.contacts[0])
            this.normal.crossVectors(this.a, this.b)
            if(this.normal.lengthSq() < 0.0001) this.normal.copy(this.up)
            else this.normal.normalize()
            if(this.normal.y < 0) this.normal.negate()
        }
        if(this.normal.y < 0.35) return
        // Project the car centre onto the supporting plane, even on two wheels.
        this.a.subVectors(vehicle.position, this.center)
        const height = this.a.dot(this.normal)
        if(height < 0 || height > 2.4) return
        this.center.copy(vehicle.position).addScaledVector(this.normal, -height)
        this.forward.set(1, 0, 0).applyQuaternion(vehicle.quaternion)
        this.forward.addScaledVector(this.normal, -this.forward.dot(this.normal)).normalize()
        this.right.crossVectors(this.forward, this.normal).normalize()
        vehicleUnderglow.center.value.copy(this.center)
        vehicleUnderglow.normal.value.copy(this.normal)
        vehicleUnderglow.forward.value.copy(this.forward)
        vehicleUnderglow.right.value.copy(this.right)
        vehicleUnderglow.strength.value = 1.8 * Math.min(1, this.contacts.length / 2)
    }

    destroy()
    {
        vehicleUnderglow.strength.value = 0
        this.strips.removeFromParent()
        this.geometry.dispose()
        this.material.dispose()
    }
}
