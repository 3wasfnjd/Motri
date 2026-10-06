import * as THREE from 'three/webgpu'
import { vehicleCameraPose } from './math.js'

export class VehicleCamera {
    constructor(scene) {
        this.mode = 'driver'
        this.cabin = new THREE.Group()
        this.cabin.visible = false
        scene.add(this.cabin)
        const dark = new THREE.MeshBasicNodeMaterial({ color: 0x202b2b })
        const trim = new THREE.MeshBasicNodeMaterial({ color: 0x536461 })
        const box = (size, position, material = dark) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
            mesh.position.set(...position)
            this.cabin.add(mesh)
            return mesh
        }
        // Compact cabin in vehicle coordinates: -Z forward, driver's seat left.
        box([1.08, 0.13, 0.22], [0, 0.16, -0.43])
        box([0.24, 0.065, 0.025], [-0.32, 0.24, -0.33], trim)
        this.wheel = new THREE.Group()
        this.wheel.position.set(-0.32, 0.22, -0.24)
        this.cabin.add(this.wheel)
        this.wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 8, 32), dark))
        for(const angle of [0, Math.PI / 2]) {
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.016, 0.018), trim)
            spoke.rotation.z = angle
            this.wheel.add(spoke)
        }
    }

    update(vehicle, headOrigin, rig, lookYaw, steering) {
        const pose = vehicleCameraPose(vehicle.position, vehicle.forward, this.mode, lookYaw)
        rig.quaternion.copy(pose.rotation)
        rig.position.copy(pose.position).sub(headOrigin.clone().applyQuaternion(pose.rotation))
        this.cabin.visible = this.mode === 'driver'
        this.cabin.position.copy(vehicle.position)
        this.cabin.quaternion.copy(pose.heading)
        this.wheel.rotation.z = -steering * 0.6
    }
}
