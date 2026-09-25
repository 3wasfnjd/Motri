import * as THREE from 'three/webgpu'
import { attribute } from 'three/tsl'
import { Game } from '../Game.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { RestHousePoultryMotion } from './RestHousePoultryMotion.js'
import { RestHousePoultryModel } from './RestHousePoultryModel.js'

export class RestHousePoultry {
    constructor(houseRoot) {
        this.game = Game.getInstance()
        const scale = houseRoot.getWorldScale(new THREE.Vector3()).x
        // Retain tree trunk metadata, which the house's render/physics setup filters out.
        const shapes = JSON.parse(houseRoot.userData.collision_boxes_json)
        this.motion = new RestHousePoultryMotion(shapes, scale)
        const material = new MeshDefaultMaterial({ colorNode: attribute('color', 'vec3'), hasWater: false })
        material.name = 'RestHouse_Poultry_GamePalette'
        this.model = new RestHousePoultryModel(material, this.motion)
        this.root = this.model.root
        houseRoot.getWorldPosition(this.root.position)
        houseRoot.getWorldQuaternion(this.root.quaternion)
        this.game.objects.add({ model: this.root, updateMaterials: false })
        this.root.updateMatrixWorld(true)
        this.inverse = this.root.matrixWorld.clone().invert()
        const [x0, x1, z0, z1] = this.motion.bounds
        this.centre = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2).applyMatrix4(this.root.matrixWorld)
        this.car = new THREE.Vector3()
        this.carVelocity = new THREE.Vector3()
        this.inverseRotation = this.root.quaternion.clone().invert()
        this.accumulator = 0
        this.game.ticker.events.on('tick', () => this.update(), 11)
    }

    update() {
        // The birds are decorative and never create road-blocking rigid bodies.
        // Freeze outside the local view to avoid background CPU/GPU updates.
        const player = this.game.player.position
        if(Math.hypot(player.x - this.centre.x, player.z - this.centre.z) > 45) return
        this.car.copy(player).applyMatrix4(this.inverse)
        const vehicle = this.game.physicalVehicle
        // PhysicsVehicle.velocity is displacement per frame, not metres/second.
        this.carVelocity.copy(vehicle?.velocity || { x: 0, y: 0, z: 0 })
            .multiplyScalar(1 / Math.max(this.game.ticker.delta, 1 / 240))
            .applyQuaternion(this.inverseRotation)
        this.car.vx = this.carVelocity.x
        this.car.vz = this.carVelocity.z
        const nearGround = this.car.y < 3.5 && this.car.y > -1
        this.accumulator += Math.min(Math.max(this.game.ticker.delta, 0), .1)
        let changed = false
        while(this.accumulator >= 1 / 30) {
            this.motion.update(1 / 30, nearGround ? this.car : null)
            this.accumulator -= 1 / 30; changed = true
        }
        if(changed) this.model.pose()
    }
}
