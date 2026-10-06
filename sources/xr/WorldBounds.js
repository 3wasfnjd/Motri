import * as THREE from 'three/webgpu'
import { WORLD_CENTER, WORLD_SPAN } from './math.js'

// Fixed perimeter and safety floor. Neither follows the vehicle.
export class XRWorldBounds {
    constructor(game) {
        this.game = game
        this.minX = WORLD_CENTER.x - WORLD_SPAN / 2 + 1
        this.maxX = WORLD_CENTER.x + WORLD_SPAN / 2 - 1
        this.minZ = WORLD_CENTER.z - WORLD_SPAN / 2 + 1
        this.maxZ = WORLD_CENTER.z + WORLD_SPAN / 2 - 1
        this.group = new THREE.Group()
        this.group.name = 'XR_World_Perimeter'
        game.scene.add(this.group)
        this.bodies = []
        const addBody = (x, y, z, hx, hy, hz) => this.bodies.push(game.physics.getPhysical({ type: 'fixed', position: new THREE.Vector3(x, y, z), friction: .5, restitution: 0, colliders: [{ shape: 'cuboid', parameters: [hx, hy, hz], category: 'floor' }] }).body)
        const material = new THREE.MeshBasicNodeMaterial({ color: '#877354' })
        for(const [x, z, hx, hz] of [[this.minX, WORLD_CENTER.z, 1, WORLD_SPAN / 2], [this.maxX, WORLD_CENTER.z, 1, WORLD_SPAN / 2], [WORLD_CENTER.x, this.minZ, WORLD_SPAN / 2, 1], [WORLD_CENTER.x, this.maxZ, WORLD_SPAN / 2, 1]]) {
            addBody(x, 10, z, hx, 30, hz)
            const rail = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 1.2, hz * 2), material)
            rail.position.set(x, -.2, z)
            this.group.add(rail)
        }
        addBody(WORLD_CENTER.x, game.water.depthElevation - .5, WORLD_CENTER.z, WORLD_SPAN / 2, .5, WORLD_SPAN / 2)
    }

    update() {
        const p = this.game.physicalVehicle.position
        if(p.y < -8 || p.x < this.minX - 2 || p.x > this.maxX + 2 || p.z < this.minZ - 2 || p.z > this.maxZ + 2) {
            const spawn = this.game.respawns.getClosest(p)
            this.game.physicalVehicle.moveTo(spawn.position, spawn.rotation)
            this.game.xr?.vehicleCamera.reset()
        }
    }
}
