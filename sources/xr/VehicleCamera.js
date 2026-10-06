import * as THREE from 'three/webgpu'
import { CHASE_OFFSET, DRIVER_EYE, vehicleCameraPose } from './math.js'

// Real-car cockpit proportions in metres, relative to the driver's eye.
export const STEERING_WHEEL = { diameter: 0.37, rim: 0.032, ahead: 0.42, below: 0.27, rake: 23 * Math.PI / 180, lock: 2.4 }
// The cluster sits in the opening between the rim top and the spokes (≈ -20°).
const CLUSTER = { width: 0.24, ahead: 0.62, below: 0.225 }

// Orient a part in the car frame (x forward, y up, z right) so that its face
// looks back at the driver, tilted up by `tilt`.
function facingDriver(object, tilt) {
    const normal = new THREE.Vector3(-Math.cos(tilt), Math.sin(tilt), 0)
    const up = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0)
    object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), up, normal))
}

export class VehicleCamera {
    constructor(game) {
        this.game = game
        this.mode = 'driver'
        this.position = new THREE.Vector3()
        this.heading = new THREE.Quaternion()
        this.headOffset = new THREE.Vector3()
        this.up = new THREE.Vector3(0, 1, 0)
        this.reset()
        // The car's own body is the cockpit: its roof, pillars, beltline and hood
        // stay visible from the seat. Only the wheel and cluster are added, in the
        // car's frame, drawn after the body so the beltline cannot cover them.
        this.cabin = new THREE.Group()
        this.cabin.visible = false
        game.scene.add(this.cabin)
        const material = color => new THREE.MeshBasicNodeMaterial({ color, depthTest: false })
        const leather = material(0x1c2326), trim = material(0x7d8b8a), hubColor = material(0x2c3639)
        const add = (parent, mesh, order) => { mesh.renderOrder = order; mesh.frustumCulled = false; parent.add(mesh); return mesh }

        const eye = DRIVER_EYE
        this.column = new THREE.Group()
        this.column.position.set(eye.x + STEERING_WHEEL.ahead, eye.y - STEERING_WHEEL.below, eye.z)
        facingDriver(this.column, STEERING_WHEEL.rake)
        this.cabin.add(this.column)
        this.wheel = new THREE.Group()
        this.column.add(this.wheel)
        const radius = STEERING_WHEEL.diameter / 2
        add(this.wheel, new THREE.Mesh(new THREE.TorusGeometry(radius - STEERING_WHEEL.rim / 2, STEERING_WHEEL.rim / 2, 10, 48), leather), 95)
        for(const angle of [0, Math.PI, Math.PI * 3 / 2]) {
            const spoke = add(this.wheel, new THREE.Mesh(new THREE.BoxGeometry(radius - 0.03, 0.03, 0.012), trim), 96)
            spoke.position.set(Math.cos(angle) * (radius / 2 + 0.01), Math.sin(angle) * (radius / 2 + 0.01), -0.01)
            spoke.rotation.z = angle
        }
        const hub = add(this.wheel, new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.035, 24), hubColor), 97)
        hub.rotation.x = Math.PI / 2
        hub.position.z = -0.005
        // Top-centre marker shows the wheel's rotation at a glance.
        add(this.wheel, new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.036), trim), 96).position.set(0, radius - STEERING_WHEEL.rim / 2, 0)

        this.canvas = document.createElement('canvas')
        this.canvas.width = 512; this.canvas.height = 160
        this.texture = new THREE.CanvasTexture(this.canvas)
        this.texture.colorSpace = THREE.SRGBColorSpace
        this.texture.generateMipmaps = false
        this.texture.minFilter = THREE.LinearFilter
        this.display = add(this.cabin, new THREE.Mesh(new THREE.PlaneGeometry(CLUSTER.width, CLUSTER.width * 160 / 512),
            new THREE.MeshBasicNodeMaterial({ map: this.texture, toneMapped: false, depthTest: false })), 94)
        this.display.position.set(eye.x + CLUSTER.ahead, eye.y - CLUSTER.below, eye.z)
        facingDriver(this.display, Math.atan2(CLUSTER.below, CLUSTER.ahead))
        this.lastSpeed = -1
        this.updateSpeed(0)
    }

    reset() { this.initialized = false }

    // The exterior is never hidden: from the seat, its front faces form the
    // windshield frame, headliner and hood. Only the cockpit parts toggle.
    setCabinVisible(visible) {
        this.cabin.visible = visible
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
        const orientation = vehicle.quaternion || null
        const pose = vehicleCameraPose(vehicle.position, vehicle.forward, this.mode, lookYaw, orientation)
        const snap = !this.initialized || this.position.distanceTo(pose.position) > 10
        if(snap) { this.position.copy(pose.position); this.heading.copy(pose.heading) }
        else if(this.mode === 'driver') {
            // Filter suspension chatter only. Head tracking is never filtered.
            this.position.x = pose.position.x; this.position.z = pose.position.z
            this.position.y += (pose.position.y - this.position.y) * (1 - Math.exp(-dt * 24))
            this.heading.copy(pose.heading)
        } else {
            this.heading.slerp(pose.heading, 1 - Math.exp(-dt * 8))
            const target = CHASE_OFFSET.clone().applyQuaternion(this.heading).add(vehicle.position)
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
        if(this.mode === 'driver') {
            // The cockpit shares the filtered eye anchor and the car's attitude,
            // so it stays aligned with the dashboard without head motion.
            const carOrientation = orientation || new THREE.Quaternion().setFromAxisAngle(this.up, Math.atan2(-vehicle.forward.z, vehicle.forward.x))
            this.cabin.quaternion.copy(carOrientation)
            this.cabin.position.copy(this.position).sub(DRIVER_EYE.clone().applyQuaternion(carOrientation))
        }
        // Positive steering turns left: counter-clockwise from the driver's seat.
        this.wheel.rotation.z = steering * STEERING_WHEEL.lock
        this.updateSpeed(vehicle.xzSpeed)
    }
}
