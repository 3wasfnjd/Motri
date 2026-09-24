import * as THREE from 'three/webgpu'
import { brandGlyphs } from './LandingBrandGlyphs.js'

export const LANDING_BRAND = 'ABODEN GAMES'

// Replace only the dynamic name letters, before Area creates their physics.
// Both compressed and uncompressed area resources use these reference names.
export function replaceLandingBrand(model) {
    const old = model.children.filter(child => /^refLettersPhysicalDynamic/i.test(child.name))
    if(!old.length) return model
    const anchor = old[0].position.clone(), rotation = old[0].quaternion.clone(), inverse = rotation.clone().invert()
    let left = Infinity, right = -Infinity, bottom = Infinity, height = 0, depth = 0
    for(const letter of old) {
        letter.geometry.computeBoundingBox()
        const b = letter.geometry.boundingBox, p = letter.position.clone().sub(anchor).applyQuaternion(inverse)
        left = Math.min(left, p.x + b.min.x); right = Math.max(right, p.x + b.max.x)
        bottom = Math.min(bottom, letter.position.y + b.min.y)
        height = Math.max(height, b.max.y - b.min.y)
        depth = Math.max(depth, b.max.z - b.min.z)
    }
    const parts = []
    for(const character of LANDING_BRAND) {
        if(character === ' ') { parts.push({ width: .48 }); continue }
        const path = new THREE.ShapePath()
        for(const [op, ...p] of brandGlyphs[character]) {
            if(op === 'moveTo') path.moveTo(...p)
            else if(op === 'lineTo') path.lineTo(...p)
            else if(op === 'curveTo') path.bezierCurveTo(...p)
            else if(op === 'closePath') path.currentPath.closePath()
        }
        const geometry = new THREE.ExtrudeGeometry(path.toShapes(false), {
            depth: depth / height, steps: 1, curveSegments: 5,
            bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 1
        })
        geometry.computeBoundingBox()
        const size = geometry.boundingBox.getSize(new THREE.Vector3())
        geometry.center()
        parts.push({ character, geometry, size, width: size.x })
    }
    const gap = .10, total = parts.reduce((sum, p) => sum + p.width, 0) + gap * (parts.length - 1)
    const scale = Math.min(height / Math.max(...parts.filter(p => p.size).map(p => p.size.y)), (right - left) / total)
    const material = new THREE.MeshStandardMaterial({ color: '#f1c982', roughness: .85, metalness: 0 })
    material.name = 'landingAbodenLetters'
    let cursor = (left + right - total * scale) / 2, index = 0
    for(const part of parts) {
        if(part.geometry) {
            part.geometry.scale(scale, scale, scale)
            const letter = new THREE.Mesh(part.geometry, material)
            letter.name = `refLettersPhysicalDynamic${100 + index++}`
            letter.userData.mass = old[0].userData.mass ?? .2
            letter.userData.brandCharacter = part.character
            letter.position.copy(new THREE.Vector3(cursor + part.width * scale / 2, 0, 0).applyQuaternion(rotation).add(anchor))
            letter.position.y = bottom + part.size.y * scale / 2
            letter.quaternion.copy(rotation)
            const collider = new THREE.Object3D()
            collider.name = 'cuboid'
            collider.scale.copy(part.size).multiplyScalar(scale)
            letter.add(collider)
            model.add(letter)
        }
        cursor += (part.width + gap) * scale
    }
    for(const letter of old) model.remove(letter)
    return model
}
