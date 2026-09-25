import * as THREE from 'three/webgpu'
import { attribute, Fn, max, smoothstep } from 'three/tsl'
import { Game } from '../Game.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { clearGeometry } from './RestHouseClearing.js'
import { SHEEP_PEN, FEED_PICKUP, sheepPenRects, sheepPenContains, sheepPenFlattenWeight } from './SheepPenSite.js'
import { buildSheepPenModel } from './SheepPenModel.js'
import { SheepPenMotion } from './SheepPenMotion.js'

export class SheepPen {
    constructor() {
        this.game = Game.getInstance()
        this.cleared = { vegetation: 0, props: 0, triangles: 0 }
        // Run before Floor physics and the shared vegetation/prop constructors.
        this.prepareTerrain()
        this.clearReferences()
        this.clearScenery(this.game.resources.sceneryModel.scene)
        this.clearScenery(this.game.resources.areasModel.scene)
        const material = new MeshDefaultMaterial({ colorNode: attribute('color', 'vec3'), hasWater: false })
        material.name = 'SheepPen_GamePalette'
        const { root, colliders, flock } = buildSheepPenModel(material)
        this.root = root
        this.colliders = colliders
        this.flock = flock
        this.motion = new SheepPenMotion(colliders)
        this.game.objects.add({ model: root, updateMaterials: false })
        this.physical = this.game.objects.add(null, {
            type: 'fixed', friction: .7, restitution: 0, colliders: colliders.filter(c => c.sheepIndex === undefined)
        }).physical
        this.sheepBodies = colliders.filter(c => c.sheepIndex !== undefined).map(c => this.game.objects.add(null, {
            type: 'kinematicPositionBased', position: c.position, rotation: c.quaternion,
            friction: .7, restitution: 0,
            colliders: [{ shape: c.shape, category: c.category, parameters: c.parameters }]
        }).physical.body)
        this.time = 0; this.accumulator = 0
        this.position = new THREE.Vector3(); this.rotation = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0)
        this.carLocal = { x: 0, z: 0 }
        // Set kinematic targets before Physics (priority 3) consumes this frame.
        this.game.ticker.events.on('tick', () => this.update(), 2)
        this.game.respawns.items.set('sheepPen', {
            name: 'sheepPen', position: new THREE.Vector3(-45.2, 3, -13.7), rotation: Math.PI
        })

        // Local sheep-pen ambience. Independent from the world playlist/music.
        this.ambientSound = this.game.audio.register({
            group: 'sheepPenAmbient',
            path: 'sounds/sheepPen/sheep-pen-ambient.mp3',
            autoplay: true,
            loop: true,
            volume: .14,
            positions: new THREE.Vector3(...SHEEP_PEN.center),
            distanceFade: 17
        })
    }

    update() {
        const p = this.game.player.position
        const [x0, x1, z0, z1] = SHEEP_PEN.bounds
        const inside = p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1 && p.y >= 0 && p.y < 3
        if(inside && !this.wasInsideAchievementZone)
            this.game.achievements.setProgress('sheepPenVisit', 1)
        this.wasInsideAchievementZone = inside
        if(Math.hypot(p.x - SHEEP_PEN.center[0], p.z - SHEEP_PEN.center[2]) > 45) return
        const dt = Math.max(0, Math.min(this.game.ticker.delta, .1))
        this.time += dt; this.accumulator += dt
        if(this.accumulator < 1 / 20) return
        const car = this.game.physicalVehicle?.chassis.physical.body.translation() ?? p
        this.carLocal.x = car.x - SHEEP_PEN.center[0]; this.carLocal.z = car.z - SHEEP_PEN.center[2]
        this.motion.update(this.accumulator, car.y < 4 ? this.carLocal : null)
        this.accumulator = 0
        this.flock.pose(this.motion.states, this.time)
        for(let i = 0; i < this.sheepBodies.length; i++) {
            const s = this.motion.states[i]
            this.position.set(SHEEP_PEN.center[0] + s.x, .60 * s.size, SHEEP_PEN.center[2] + s.z)
            this.rotation.setFromAxisAngle(this.up, s.yaw)
            this.sheepBodies[i].setNextKinematicTranslation(this.position)
            this.sheepBodies[i].setNextKinematicRotation(this.rotation)
        }
    }

    prepareTerrain() {
        const geometry = this.game.resources.terrainModel.scene.children[0].geometry
        const p = geometry.attributes.position
        for(let i = 0; i < p.count; i++)
            p.setY(i, p.getY(i) * (1 - sheepPenFlattenWeight(p.getX(i), p.getZ(i))))
        p.needsUpdate = true
        geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
        this.game.terrain.sheepPenMaskNode = Fn(([p]) => {
            const masks = sheepPenRects.map(([x0, x1, z0, z1]) => {
                const distance = max(max(p.x.negate().add(x0), p.x.sub(x1)), max(p.y.negate().add(z0), p.y.sub(z1)))
                return smoothstep(0, SHEEP_PEN.feather, distance).oneMinus()
            })
            return masks.reduce((a, b) => max(a, b))
        })
    }

    intersects(box, padding = 0) {
        return !box.isEmpty() && sheepPenRects.some(([x0, x1, z0, z1]) =>
            box.max.x >= x0 - padding && box.min.x <= x1 + padding &&
            box.max.z >= z0 - padding && box.min.z <= z1 + padding)
    }

    clearReferences() {
        for(const key of ['bushesReferences', 'flowersReferencesModel', 'birchTreesReferencesModel', 'oakTreesReferencesModel', 'cherryTreesReferencesModel']) {
            const scene = this.game.resources[key]?.scene
            if(!scene) continue
            scene.updateMatrixWorld(true)
            for(const ref of [...scene.children]) {
                const p = ref.getWorldPosition(new THREE.Vector3()), scale = ref.getWorldScale(new THREE.Vector3())
                const radius = (key.includes('Trees') ? 3.5 : key.includes('bushes') ? 1.5 : .5) * Math.max(scale.x, scale.z)
                if(sheepPenContains(p.x, p.z, radius)) { scene.remove(ref); this.cleared.vegetation++ }
            }
        }
        for(const key of ['bricksModel', 'fencesModel', 'benchesModel', 'poleLightsModel', 'lanternsModel']) {
            const scene = this.game.resources[key]?.scene
            if(!scene) continue
            scene.updateMatrixWorld(true)
            for(const ref of [...scene.children]) {
                if(this.intersects(new THREE.Box3().setFromObject(ref), .2)) { scene.remove(ref); this.cleared.props++ }
            }
        }
    }

    clearScenery(scene) {
        scene.updateMatrixWorld(true)
        scene.traverse(mesh => {
            // Keep the asphalt and gameplay reference markers intact.
            if(!mesh.isMesh || /^ref/i.test(mesh.name) || !mesh.geometry?.attributes.position) return
            if(this.intersects(new THREE.Box3().setFromObject(mesh)))
                this.cleared.triangles += clearGeometry(mesh, sheepPenRects)
        })
    }

    drawMap(container, night = false) {
        if(!this.mapCanvas) {
            this.mapCanvas = document.createElement('canvas')
            this.mapCanvas.width = this.mapCanvas.height = 768
            Object.assign(this.mapCanvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1' })
            container.append(this.mapCanvas)
        }
        const ctx = this.mapCanvas.getContext('2d'), k = 768 / this.game.terrain.size
        ctx.clearRect(0, 0, 768, 768)
        ctx.save(); ctx.translate(384, 384); ctx.scale(k, k)
        ctx.fillStyle = night ? '#77613e' : '#d9b475'
        for(const [x0, x1, z0, z1] of sheepPenRects) ctx.fillRect(x0, z0, x1 - x0, z1 - z0)
        ctx.translate(SHEEP_PEN.center[0], SHEEP_PEN.center[2])
        const truckX = FEED_PICKUP.center[0] - SHEEP_PEN.center[0], truckZ = FEED_PICKUP.center[2] - SHEEP_PEN.center[2]
        ctx.fillStyle = '#eeeadd'; ctx.fillRect(truckX - .90, truckZ - 2.30, 1.80, 4.60)
        ctx.fillStyle = '#3c5960'; ctx.fillRect(truckX - .70, truckZ + .25, 1.40, .35)
        for(let row = 0; row < 3; row++) for(let side = 0; side < 2; side++) {
            ctx.fillStyle = (row + side) % 3 === 0 ? '#d3b465' : '#84934f'
            ctx.fillRect(truckX - .71 + side * .72, truckZ - 2.24 + row * .60, .69, .56)
        }
        ctx.strokeStyle = night ? '#b4996f' : '#91613b'; ctx.lineWidth = .25
        ctx.beginPath(); ctx.moveTo(7.5, -2.4); ctx.lineTo(7.5, -5.3); ctx.lineTo(-7.5, -5.3)
        ctx.lineTo(-7.5, 5.3); ctx.lineTo(7.5, 5.3); ctx.lineTo(7.5, 2.4); ctx.stroke()
        ctx.fillStyle = night ? '#496466' : '#719394'; ctx.fillRect(-6.925, -4.75, 5.65, 3.9)
        ctx.fillStyle = night ? '#c4b998' : '#eee8cf'
        for(const s of this.motion.states) {
            ctx.beginPath(); ctx.ellipse(s.x, s.z, .36 * s.size, .56 * s.size, -s.yaw, 0, Math.PI * 2); ctx.fill()
        }
        ctx.restore()
    }
}
