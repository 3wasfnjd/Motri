import * as THREE from 'three/webgpu'
import { vehicleCameraPose } from './math.js'

export class VehicleCamera {
    constructor(game) {
        this.game = game
        this.mode = 'driver'
        this.position = new THREE.Vector3()
        this.heading = new THREE.Quaternion()
        this.headOffset = new THREE.Vector3()
        this.up = new THREE.Vector3(0, 1, 0)
        this.reset()
        this.cabin = new THREE.Group()
        this.cabin.visible = false
        game.scene.add(this.cabin)
        const dark = new THREE.MeshBasicNodeMaterial({ color: 0x172328 })
        const trim = new THREE.MeshBasicNodeMaterial({ color: 0x667977 })
        const leather = new THREE.MeshBasicNodeMaterial({ color: 0x34434a })
        const box = (size, position, material = dark) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
            mesh.position.set(...position)
            this.cabin.add(mesh)
            return mesh
        }
        // Dashboard, lower cowl, narrow pillars and hood. All are in metres;
        // opaque exterior glazing is hidden only while sitting in the cabin.
        box([1.25, 0.12, 0.32], [0, 0.13, -0.48], leather)
        box([1.25, 0.025, 0.025], [0, 0.2, -0.36], trim)
        box([1.35, 0.08, 0.85], [0, -0.03, -1.05], trim)
        box([0.035, 0.7, 0.045], [-0.69, 0.42, -0.63], leather)
        box([0.035, 0.7, 0.045], [0.69, 0.42, -0.63], leather)
        this.wheel = new THREE.Group()
        this.wheel.position.set(-0.32, 0.21, -0.25)
        this.cabin.add(this.wheel)
        this.wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 8, 36), dark))
        for(const angle of [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6]) {
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.016, 0.018), trim)
            spoke.position.set(Math.cos(angle) * 0.052, Math.sin(angle) * 0.052, 0)
            spoke.rotation.z = angle
            this.wheel.add(spoke)
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.028, 16), leather)
        hub.rotation.x = Math.PI / 2
        this.wheel.add(hub)
        this.canvas = document.createElement('canvas')
        this.canvas.width = 512; this.canvas.height = 160
        this.texture = new THREE.CanvasTexture(this.canvas)
        this.texture.colorSpace = THREE.SRGBColorSpace
        this.texture.generateMipmaps = false
        this.texture.minFilter = THREE.LinearFilter
        const display = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.094), new THREE.MeshBasicNodeMaterial({ map: this.texture, toneMapped: false }))
        display.position.set(-0.32, 0.26, -0.36)
        this.cabin.add(display)
        this.lastSpeed = -1
        this.updateSpeed(0)
    }

    reset() { this.initialized = false }

    setCabinVisible(visible) {
        this.cabin.visible = visible
        const body = this.game.world.visualVehicle.parts.chassis
        if(visible && this.exteriorVisible === undefined) this.exteriorVisible = body.visible
        if(visible) body.visible = false
        else if(this.exteriorVisible !== undefined) { body.visible = this.exteriorVisible; this.exteriorVisible = undefined }
    }

    updateSpeed(speed) {
        const value = Math.round(speed * 3.6)
        if(value === this.lastSpeed) return
        this.lastSpeed = value
        const ctx = this.canvas.getContext('2d')
        ctx.fillStyle = '#101d22'; ctx.fillRect(0, 0, 512, 160)
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = '#d8edc9'; ctx.font = '600 78px system-ui'; ctx.fillText(String(value), 256, 66)
        ctx.fillStyle = '#96abae'; ctx.font = '20px system-ui'; ctx.fillText('MOTRI   ·   KM/H', 256, 130)
        this.texture.needsUpdate = true
    }

    update(vehicle, headOrigin, rig, lookYaw, steering, dt = 1 / 72) {
        const pose = vehicleCameraPose(vehicle.position, vehicle.forward, this.mode, lookYaw)
        const snap = !this.initialized || this.position.distanceTo(pose.position) > 10
        if(snap) { this.position.copy(pose.position); this.heading.copy(pose.heading) }
        else if(this.mode === 'driver') {
            // Filter suspension chatter only. Head tracking is never filtered.
            this.position.x = pose.position.x; this.position.z = pose.position.z
            this.position.y += (pose.position.y - this.position.y) * (1 - Math.exp(-dt * 24))
            this.heading.copy(pose.heading)
        } else {
            this.heading.slerp(pose.heading, 1 - Math.exp(-dt * 8))
            const target = new THREE.Vector3(0, 2.1, 5).applyQuaternion(this.heading).add(vehicle.position)
            this.position.lerp(target, 1 - Math.exp(-dt * 12))
        }
        this.initialized = true
        if(this.mode === 'chase') {
            // Collision probe ignores the car's own body and sensors.
            const origin = vehicle.position.clone().add(new THREE.Vector3(0, 0.7, 0))
            const direction = this.position.clone().sub(origin)
            const distance = direction.length()
            direction.normalize()
            const R = this.game.RAPIER
            const hit = this.game.physics.world.castRay(new R.Ray(origin, direction), distance, true,
                R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, vehicle.chassis.physical.body)
            if(hit) this.position.copy(origin).addScaledVector(direction, Math.max(0.15, hit.timeOfImpact - 0.25))
        }
        this.headingYaw = new THREE.Euler().setFromQuaternion(this.heading, 'YXZ').y
        rig.quaternion.copy(this.heading).multiply(new THREE.Quaternion().setFromAxisAngle(this.up, lookYaw))
        this.headOffset.copy(headOrigin).applyQuaternion(rig.quaternion)
        rig.position.copy(this.position).sub(this.headOffset)
        this.setCabinVisible(this.mode === 'driver')
        this.cabin.position.copy(this.mode === 'driver' ? this.position : pose.position)
        // Cabin uses the same filtered car anchor as the eye, without head motion.
        this.cabin.position.sub(new THREE.Vector3(-0.32, 0.43, -0.02).applyQuaternion(pose.heading))
        this.cabin.quaternion.copy(pose.heading)
        this.wheel.rotation.z = -steering * 0.75
        this.updateSpeed(vehicle.xzSpeed)
    }
}
