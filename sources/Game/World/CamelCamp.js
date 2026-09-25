import * as THREE from 'three/webgpu'
import { attribute, Fn, smoothstep, vec2 } from 'three/tsl'
import { Game } from '../Game.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { CAMEL_CAMP, camelPlacements, camelCampContains, camelCampFlattenWeight } from './CamelCampSite.js'
import { CamelCampModel } from './CamelCampModel.js'

export class CamelCamp {
    constructor() {
        this.game = Game.getInstance()
        this.cleared = { vegetation: 0 }
        // Prepare the same circular patch for the rendered floor and heightfield.
        // Existing area models, exhibition panels and road geometry are untouched.
        this.prepareTerrain()
        this.clearVegetation()
        const material = new MeshDefaultMaterial({ colorNode: attribute('color', 'vec3'), hasWater: false })
        material.name = 'CamelCamp_GamePalette'
        this.model = new CamelCampModel(material)
        this.root = this.model.root
        this.game.objects.add({ model: this.root, updateMaterials: false })
        this.physical = this.game.objects.add(null, {
            type: 'fixed', friction: .65, restitution: 0, colliders: this.model.colliders
        }).physical
        this.game.respawns.items.set('camelCamp', {
            name: 'camelCamp', position: new THREE.Vector3(...CAMEL_CAMP.respawn), rotation: Math.PI / 2
        })
        this.time = 0; this.accumulator = 0
        this.game.ticker.events.on('tick', () => this.update(), 11)
    }

    prepareTerrain() {
        const geometry = this.game.resources.terrainModel.scene.children[0].geometry
        const p = geometry.attributes.position
        for(let i = 0; i < p.count; i++)
            p.setY(i, p.getY(i) * (1 - camelCampFlattenWeight(p.getX(i), p.getZ(i))))
        p.needsUpdate = true
        geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
        this.game.terrain.camelCampMaskNode = Fn(([p]) => {
            const distance = p.sub(vec2(CAMEL_CAMP.center[0], CAMEL_CAMP.center[2])).length()
            return smoothstep(CAMEL_CAMP.radius, CAMEL_CAMP.radius + CAMEL_CAMP.feather, distance).oneMinus()
        })
    }

    clearVegetation() {
        for(const key of ['bushesReferences', 'flowersReferencesModel', 'birchTreesReferencesModel', 'oakTreesReferencesModel', 'cherryTreesReferencesModel']) {
            const scene = this.game.resources[key]?.scene
            if(!scene) continue
            scene.updateMatrixWorld(true)
            for(const ref of [...scene.children]) {
                const p = ref.getWorldPosition(new THREE.Vector3()), scale = ref.getWorldScale(new THREE.Vector3())
                const radius = (key.includes('Trees') ? 3.5 : key.includes('bushes') ? 1.5 : .5) * Math.max(scale.x, scale.z)
                if(camelCampContains(p.x, p.z, radius)) { scene.remove(ref); this.cleared.vegetation++ }
            }
        }
    }

    update() {
        const p = this.game.player.position
        if(Math.hypot(p.x - CAMEL_CAMP.center[0], p.z - CAMEL_CAMP.center[2]) > 50) return
        const dt = Math.max(0, Math.min(this.game.ticker.delta, .1))
        this.time += dt; this.accumulator += dt
        if(this.accumulator < 1 / 30) return
        this.accumulator %= 1 / 30
        this.model.pose(this.time)
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
        ctx.translate(CAMEL_CAMP.center[0], CAMEL_CAMP.center[2])
        ctx.fillStyle = night ? '#786342' : '#deb77c'
        ctx.beginPath(); ctx.arc(0, 0, CAMEL_CAMP.radius, 0, Math.PI * 2); ctx.fill()
        const [tx, tz] = CAMEL_CAMP.tent, [wx, wz] = CAMEL_CAMP.tanker
        ctx.fillStyle = '#423b34'; ctx.fillRect(tx - 3.17, tz - 2.17, 6.34, 4.34)
        ctx.fillStyle = '#d0b992'
        for(const x of [-2.6, -.5, 1.5]) ctx.fillRect(tx + x, tz - 2.17, .2, 4.34)
        ctx.fillStyle = '#e2ddd0'; ctx.fillRect(wx - 1.1, wz - 3, 2.2, 6.2)
        ctx.fillStyle = '#65a5b0'; ctx.fillRect(wx - .85, wz + 2.1, 1.7, .4)
        ctx.fillStyle = night ? '#ab8353' : '#c79961'
        for(const c of camelPlacements) {
            ctx.beginPath(); ctx.ellipse(c.x, c.z, .46 * c.size, 1.1 * c.size, -c.yaw, 0, Math.PI * 2); ctx.fill()
        }
        ctx.restore()
    }
}
