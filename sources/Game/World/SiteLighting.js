import * as THREE from 'three/webgpu'
import { color, float, uv, vec4 } from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Game } from '../Game.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { CAMEL_CAMP } from './CamelCampSite.js'
import {
    CAMP_LIGHT_CARTS, CART_SCALE, REST_HOUSE_LIGHT_POLES, REST_HOUSE_LIGHT_STRINGS,
    STRING_HEIGHT, BULB_DROP, BULB_RADIUS, stringPoint
} from './SiteLightingLayout.js'

// Reuse loaded world assets, and register the garden references BEFORE PoleLights
// builds its shared batches. No extra downloads, point lights or shadow maps.
export class SiteLighting {
    constructor(restHouseRoot) {
        this.game = Game.getInstance()
        this.carts = []
        this.switchable = []
        this.poolPlacements = []
        this.onMaterial = this.game.materials.getFromName('emissiveOrangeRadialGradient')
        this.offMaterial = new MeshDefaultMaterial({ colorNode: color('#ded5b2'), hasWater: false })
        this.cableMaterial = new MeshDefaultMaterial({ colorNode: color('#353933'), hasWater: false })

        this.addCampCarts()
        this.addGardenPoles(restHouseRoot)
        this.addStrings()
        this.addLightPools()
        this.game.dayCycles.events.on('night', inInterval => this.setNight(inInterval))
        this.setNight(this.game.dayCycles.intervalEvents.get('night').inInterval)
    }

    addCampCarts() {
        // The original behindTheScene area stays disabled. Clone only its light
        // generator; never mutate its geometry, children, visibility or colliders.
        let source
        this.game.resources.areasModel.scene.traverse(child => {
            if(!source && /^lightGeneratorPhysicalDynamic/i.test(child.name)) source = child
        })
        if(!source) return

        for(const placement of CAMP_LIGHT_CARTS) {
            const cart = source.clone(true)
            cart.name = placement.name
            cart.position.set(0, 0, 0)
            cart.rotation.set(0, placement.yaw, 0)
            cart.scale.setScalar(CART_SCALE)
            cart.updateMatrixWorld(true)
            const box = new THREE.Box3().setFromObject(cart)
            cart.position.set(CAMEL_CAMP.center[0] + placement.x,
                CAMEL_CAMP.center[1] + .012 - box.min.y, CAMEL_CAMP.center[2] + placement.z)
            cart.visible = true

            // Authored collider nodes are local to the scaled cart. Objects' GLB
            // helper assumes unit scale, so apply that scale explicitly here.
            const colliders = []
            for(const child of [...cart.children]) {
                if(/^cuboid/i.test(child.name)) {
                    colliders.push({ shape: 'cuboid', category: 'object',
                        parameters: child.scale.toArray().map(value => value * CART_SCALE / 2),
                        position: child.position.clone().multiplyScalar(CART_SCALE),
                        quaternion: child.quaternion.clone() })
                    child.removeFromParent()
                }
            }
            this.game.objects.add({ model: cart }, {
                type: 'fixed', position: cart.position, rotation: cart.quaternion, colliders
            })
            cart.traverse(child => {
                if(child.isMesh && /^emissive/i.test(child.name)) {
                    child.castShadow = false
                    this.switchable.push(child)
                }
            })
            this.carts.push(cart)
            // Aim both original lamp faces (+local Z) towards the camp.
            const pool = new THREE.Vector3(0, 0, 3.5).applyQuaternion(cart.quaternion).add(cart.position)
            pool.y = CAMEL_CAMP.center[1] + .027
            this.poolPlacements.push({ position: pool, radius: [2.8, 3.7], yaw: placement.yaw })
        }
    }

    addGardenPoles(root) {
        this.poles = []
        if(!root) return
        const scene = this.game.resources.poleLightsModel.scene
        const source = scene.children[0]
        if(!source) return
        const template = source.clone(true)
        template.position.set(0, 0, 0)
        template.rotation.set(0, 0, 0)
        template.updateMatrixWorld(true)
        const baseY = new THREE.Box3().setFromObject(template).min.y
        root.updateWorldMatrix(true, false)

        REST_HOUSE_LIGHT_POLES.forEach(([x, z], i) => {
            const ground = root.localToWorld(new THREE.Vector3(x, .025, z))
            const ref = new THREE.Object3D()
            ref.name = `RestHouse_LightPole_${i + 1}`
            ref.position.copy(ground)
            ref.position.y -= baseY
            // PoleLights uses the existing geometry, physics, fireflies and night
            // switch for these references, in the same two world mesh batches.
            scene.add(ref)
            this.poles.push({ reference: ref, ground })
            this.poolPlacements.push({ position: ground.clone().add(new THREE.Vector3(0, .022, 0)),
                radius: [1.15, 1.15], yaw: 0 })
        })
    }

    addStrings() {
        if(this.poles.length !== REST_HOUSE_LIGHT_POLES.length) return
        const parts = [], bulbPositions = [], axis = new THREE.Vector3(0, 1, 0)
        const segment = (a, b, radius) => {
            const delta = b.clone().sub(a)
            const g = new THREE.CylinderGeometry(radius, radius, delta.length(), 4, 1, true)
            g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axis, delta.normalize()))
            g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
            parts.push(g)
        }
        this.stringEndpoints = []
        for(const [start, end] of REST_HOUSE_LIGHT_STRINGS) {
            const a = this.poles[start].ground.clone().add(new THREE.Vector3(0, STRING_HEIGHT, 0))
            const b = this.poles[end].ground.clone().add(new THREE.Vector3(0, STRING_HEIGHT, 0))
            this.stringEndpoints.push([a, b])
            for(let i = 0; i < 16; i++) segment(stringPoint(a, b, i / 16), stringPoint(a, b, (i + 1) / 16), .014)
            const count = Math.max(3, Math.floor(a.distanceTo(b) / .85))
            for(let i = 0; i < count; i++) {
                const top = stringPoint(a, b, (i + .5) / count)
                const bottom = top.clone().add(new THREE.Vector3(0, -BULB_DROP, 0))
                segment(top, bottom, .023)
                bulbPositions.push(bottom)
            }
        }
        const geometry = mergeGeometries(parts, false)
        parts.forEach(part => part.dispose())
        geometry.computeBoundingSphere()
        this.cables = new THREE.Mesh(geometry, this.cableMaterial)
        this.cables.name = 'RestHouse_FestoonCables'
        this.game.scene.add(this.cables)

        this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(BULB_RADIUS, 8, 5),
            this.offMaterial, bulbPositions.length)
        this.bulbs.name = 'RestHouse_FestoonBulbs'
        bulbPositions.forEach((p, i) => this.bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p)))
        this.bulbs.instanceMatrix.needsUpdate = true
        this.bulbs.computeBoundingSphere()
        this.switchable.push(this.bulbs)
        this.game.scene.add(this.bulbs)
    }

    addLightPools() {
        // Soft stylized ground glow, one shared draw. This is not a dynamic light;
        // it avoids per-bulb lighting/shadows on mobile and matches world emissives.
        const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
        const alpha = float(1).sub(uv().sub(.5).length().mul(2)).clamp(0, 1).pow(2).mul(.28)
        const lit = MeshDefaultMaterial.revealDiscardNodeBuilder(this.game, vec4(color('#ffd793'), 1))
        material.outputNode = vec4(lit, alpha)
        material.fog = false
        this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), material, this.poolPlacements.length)
        this.pools.name = 'SiteLighting_NightGroundGlow'
        this.poolPlacements.forEach(({ position, radius, yaw }, i) => {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw, 'YXZ'))
            this.pools.setMatrixAt(i, new THREE.Matrix4().compose(position, q, new THREE.Vector3(...radius, 1)))
        })
        this.pools.instanceMatrix.needsUpdate = true
        this.pools.computeBoundingSphere()
        this.game.scene.add(this.pools)
    }

    setNight(night) {
        for(const mesh of this.switchable) mesh.material = night ? this.onMaterial : this.offMaterial
        this.pools.visible = night
        this.isNight = night
    }
}
