import * as THREE from 'three/webgpu'
import { attribute, Fn, max, smoothstep } from 'three/tsl'
import { Game } from '../Game.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { clearGeometry } from './RestHouseClearing.js'
import { SHEEP_PEN, sheepPenRects, sheepPenContains, sheepPenFlattenWeight } from './SheepPenSite.js'
import { buildSheepPenModel, sheepPlacements } from './SheepPenModel.js'

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
        const { root, colliders } = buildSheepPenModel(material)
        this.root = root
        this.colliders = colliders
        this.game.objects.add({ model: root, updateMaterials: false })
        this.physical = this.game.objects.add(null, {
            type: 'fixed', friction: .7, restitution: 0, colliders
        }).physical
        this.game.respawns.items.set('sheepPen', {
            name: 'sheepPen', position: new THREE.Vector3(-45.2, 3, -13.7), rotation: Math.PI
        })
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
        ctx.strokeStyle = night ? '#b4996f' : '#91613b'; ctx.lineWidth = .25
        ctx.beginPath(); ctx.moveTo(7.5, -2.4); ctx.lineTo(7.5, -5.3); ctx.lineTo(-7.5, -5.3)
        ctx.lineTo(-7.5, 5.3); ctx.lineTo(7.5, 5.3); ctx.lineTo(7.5, 2.4); ctx.stroke()
        ctx.fillStyle = night ? '#496466' : '#719394'; ctx.fillRect(-6.925, -4.75, 5.65, 3.9)
        ctx.fillStyle = night ? '#c4b998' : '#eee8cf'
        for(const s of sheepPlacements) {
            ctx.beginPath(); ctx.ellipse(s.x, s.z, .36 * s.size, .56 * s.size, -s.yaw, 0, Math.PI * 2); ctx.fill()
        }
        ctx.restore()
    }
}
