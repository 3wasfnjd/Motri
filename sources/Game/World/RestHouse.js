import { clearGeometry } from './RestHouseClearing.js'
import { styleRestHouse } from './RestHouseStyle.js'
import * as THREE from 'three/webgpu'
import { Fn, max, smoothstep } from 'three/tsl'
import { Game } from '../Game.js'
import { REST_HOUSE, siteRects, groundRects, landscapeRects, landscapeContains, flattenWeight } from './RestHouseSite.js'

export class RestHouse {
    constructor() {
        this.game = Game.getInstance()
        this.cleared = { vegetation: 0, props: 0, triangles: 0 }
        // Prepare resources before Floor, Scenery and the instanced prop constructors.
        this.prepareTerrain()
        this.clearReferences()
        this.clearScenery(this.game.resources.sceneryModel.scene)
        this.clearScenery(this.game.resources.areasModel.scene)
        this.addModel()
    }

    prepareTerrain() {
        const geometry = this.game.resources.terrainModel.scene.children[0].geometry
        const positions = geometry.attributes.position
        for(let i = 0; i < positions.count; i++)
            positions.setY(i, positions.getY(i) * (1 - flattenWeight(positions.getX(i), positions.getZ(i))))
        positions.needsUpdate = true
        geometry.computeVertexNormals()
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()
        // Same plateau and feather for the GPU terrain and its physical heightfield.
        this.game.terrain.restHouseMaskNode = Fn(([p]) => {
            const masks = groundRects.map(([x0, x1, z0, z1]) => {
                const distance = max(max(p.x.negate().add(x0), p.x.sub(x1)), max(p.y.negate().add(z0), p.y.sub(z1)))
                return smoothstep(0, REST_HOUSE.feather, distance).oneMinus()
            })
            return masks.reduce((a, b) => max(a, b))
        })
    }

    clearReferences() {
        const resources = this.game.resources
        for(const key of ['bushesReferences', 'flowersReferencesModel', 'birchTreesReferencesModel', 'oakTreesReferencesModel', 'cherryTreesReferencesModel']) {
            const scene = resources[key]?.scene
            if(!scene) continue
            scene.updateMatrixWorld(true)
            for(const ref of [...scene.children]) {
                const p = ref.getWorldPosition(new THREE.Vector3())
                const scale = ref.getWorldScale(new THREE.Vector3())
                const radius = (key.includes('Trees') ? 3.5 : key.includes('bushes') ? 1.5 : 0.5) * Math.max(scale.x, scale.z)
                if(landscapeContains(p.x, p.z, radius)) { scene.remove(ref); this.cleared.vegetation++ }
            }
        }
        for(const key of ['bricksModel', 'fencesModel', 'benchesModel', 'poleLightsModel', 'lanternsModel']) {
            const scene = resources[key]?.scene
            if(!scene) continue
            scene.updateMatrixWorld(true)
            for(const ref of [...scene.children]) {
                const box = new THREE.Box3().setFromObject(ref)
                if(this.intersectsSite(box, 0.4)) { scene.remove(ref); this.cleared.props++ }
            }
        }
    }

    intersectsSite(box, padding = 0) {
        return !box.isEmpty() && siteRects.some(([x0, x1, z0, z1]) =>
            box.max.x >= x0 - padding && box.min.x <= x1 + padding &&
            box.max.z >= z0 - padding && box.min.z <= z1 + padding)
    }

    clearScenery(scene) {
        scene.updateMatrixWorld(true)
        const rectangles = siteRects.map(([x0, x1, z0, z1]) => [x0 - 0.15, x1 + 0.15, z0 - 0.15, z1 + 0.15])
        scene.traverse(mesh => {
            if(!mesh.isMesh || /^refRoad/i.test(mesh.name)) return
            if(!mesh.geometry?.attributes.position || !this.intersectsSite(new THREE.Box3().setFromObject(mesh), 0.15)) return
            this.cleared.triangles += clearGeometry(mesh, rectangles)
        })
    }

    addModel() {
        const scene = this.game.resources.restHouseModel.scene
        scene.position.fromArray(REST_HOUSE.position)
        scene.rotation.set(0, REST_HOUSE.yaw, 0)
        scene.scale.setScalar(REST_HOUSE.scale)
        scene.updateMatrixWorld(true)
        this.root = scene.getObjectByName('RestHouse_Root')
        this.shapes = JSON.parse(this.root.userData.collision_boxes_json)
        const worldRotation = this.root.getWorldQuaternion(new THREE.Quaternion())
        const scale = this.root.getWorldScale(new THREE.Vector3())
        const collider = (shape, category) => ({
            shape: 'cuboid', category,
            parameters: shape.size.map((n, i) => n * scale.getComponent(i) * 0.5),
            position: this.root.localToWorld(new THREE.Vector3().fromArray(shape.center)),
            quaternion: worldRotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), shape.rotationY || 0))
        })
        const ground = [
            { center: [5.2, -0.15, 24.4], size: [40, 0.3, 48.8] },
            { center: [0, -0.15, -3.2], size: [6.8, 0.3, 6.4] }
        ]
        styleRestHouse(scene)
        this.game.objects.add({ model: scene, updateMaterials: false })
        this.physical = this.game.objects.add(null, {
            type: 'fixed', friction: 0.7, restitution: 0,
            colliders: [...this.shapes.map(s => collider(s, 'object')), ...ground.map(s => collider(s, 'floor'))]
        }).physical
        const spawn = this.root.localToWorld(new THREE.Vector3(0, 0, -5.5))
        spawn.y += 3
        this.game.respawns.items.set('restHouse', { name: 'restHouse', position: spawn, rotation: 0 })
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
        ctx.save()
        ctx.translate(384, 384)
        ctx.scale(k, k)
        // Replace stale pond/tree symbols on the original static map too.
        ctx.fillStyle = night ? '#746039' : '#dbaa66'
        for(const [x0, x1, z0, z1] of landscapeRects) ctx.fillRect(x0, z0, x1 - x0, z1 - z0)
        ctx.fillStyle = night ? '#7f7050' : '#e7cd98'
        for(const [x0, x1, z0, z1] of siteRects) ctx.fillRect(x0, z0, x1 - x0, z1 - z0)
        for(const s of this.shapes) {
            const p = this.root.localToWorld(new THREE.Vector3().fromArray(s.center))
            ctx.save()
            ctx.translate(p.x, p.z)
            ctx.rotate(-REST_HOUSE.yaw - (s.rotationY || 0))
            ctx.fillStyle = night ? '#a3977c' : '#f5e6c5'
            ctx.fillRect(-s.size[0] * REST_HOUSE.scale / 2, -s.size[2] * REST_HOUSE.scale / 2, s.size[0] * REST_HOUSE.scale, s.size[2] * REST_HOUSE.scale)
            ctx.restore()
        }
        ctx.restore()
    }
}
