import * as THREE from 'three/webgpu'
import { attribute, texture, uv } from 'three/tsl'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'

// Vertex colours preserve the tent's stripes and foliage variation while using
// the same diffuse light, coloured shadows, fog and reveal as the rest of Motri2.
export const restHousePalette = {
    RH_Walls: ['#f5e6c5'], RH_Pergola: ['#f5e6c5'],
    RH_Roofs: ['#c9ac7d'], RH_Ground: ['#dbaa66'], RH_Lawn: ['#769543'],
    RH_BlueRailings: ['#42888f'], RH_DoorPanels: ['#394d55'],
    RH_Gate_Left: ['#38484e', '#53696c'], RH_Gate_Right: ['#38484e', '#53696c'],
    RH_Glass: ['#344c59'], RH_WindowFrames: ['#3e555d', '#d3c5a8'],
    RH_Foliage: ['#709333', '#88aa3e', '#a3bc4e', '#bdd16b'],
    RH_TreeTrunks: ['#997041'], RH_RoofTanks: ['#cee0d2', '#e1ecd9'],
    RH_Tent: ['#65594c', '#91816a', '#d8b983', '#efd39c'],
    RH_Basins: ['#779677', '#bda577', '#ded0a7']
}

export function recolorRestHouse(scene) {
    scene.traverse(mesh => {
        if(!mesh.isMesh || !mesh.geometry.attributes.color) return
        const colors = mesh.geometry.attributes.color
        const palette = (restHousePalette[mesh.name] || ['#e5cfaa']).map(hex => new THREE.Color(hex))
        const shades = []
        for(let i = 0; i < colors.count; i++) shades.push((colors.getX(i) + colors.getY(i) + colors.getZ(i)) / 3)
        const levels = [...new Set(shades.map(v => Math.round(v * 1000)))].sort((a, b) => a - b)
        for(let i = 0; i < colors.count; i++) {
            const rank = levels.indexOf(Math.round(shades[i] * 1000))
            const c = palette[Math.round(rank / Math.max(1, levels.length - 1) * (palette.length - 1))]
            colors.setXYZ(i, c.r, c.g, c.b)
        }
        colors.needsUpdate = true
    })
}

export function styleRestHouse(scene, pavingTexture) {
    recolorRestHouse(scene)
    const painted = new MeshDefaultMaterial({ colorNode: attribute('color', 'vec3'), hasWater: false })
    // Original UVs repeat every 1.7 local metres; enlarge the tile for readable slabs.
    const paving = new MeshDefaultMaterial({ colorNode: texture(pavingTexture, uv().mul(.35)).rgb, hasWater: false })
    paving.map = pavingTexture
    painted.name = 'RestHouse_GamePalette'
    paving.name = 'RestHouse_GamePaving'
    scene.traverse(mesh => {
        if(mesh.isMesh) mesh.material = mesh.geometry.attributes.color ? painted : paving
    })
}
