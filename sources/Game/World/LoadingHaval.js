import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Tiny loading-only H9 silhouette. +X forward, +Y up; no downloads or physics.
export function createLoadingHaval() {
    const parts = []
    const add = (geometry, x, y, z, tint) => {
        geometry.translate(x, y, z)
        const c = new THREE.Color(tint), count = geometry.attributes.position.count
        const colors = new Float32Array(count * 3)
        for(let i = 0; i < count; i++) c.toArray(colors, i * 3)
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        parts.push(geometry)
    }
    const box = (x, y, z, w, h, d, tint) => add(new THREE.BoxGeometry(w, h, d), x, y, z, tint)
    const graphite = '#777b80', glass = '#203540', trim = '#262a2e'
    box(0, .17, 0, .72, .18, .32, graphite)
    box(-.07, .315, 0, .49, .18, .30, graphite)
    box(.19, .267, 0, .015, .105, .264, glass)
    box(-.323, .31, 0, .012, .11, .25, glass)
    for(const side of [-1, 1]) {
        for(const [x, width] of [[.10, .13], [-.055, .14], [-.218, .13]])
            box(x, .323, side * .153, width, .105, .008, glass)
        box(-.07, .417, side * .126, .44, .018, .018, trim)
        box(.17, .29, side * .185, .062, .044, .057, graphite)
        box(-.015, .097, side * .18, .45, .025, .035, trim)
        for(const x of [-.235, .235]) {
            const tire = new THREE.CylinderGeometry(.092, .092, .055, 12)
            tire.rotateX(Math.PI / 2)
            add(tire, x, .094, side * .169, '#15191d')
            const rim = new THREE.CylinderGeometry(.051, .051, .058, 10)
            rim.rotateX(Math.PI / 2)
            add(rim, x, .094, side * .172, '#8b949b')
        }
        box(-.366, .21, side * .132, .01, .10, .025, '#c94649')
        const lamp = new THREE.CylinderGeometry(.033, .033, .012, 12)
        lamp.rotateZ(Math.PI / 2)
        add(lamp, .37, .213, side * .117, '#e7f5ff')
    }
    box(.366, .205, 0, .012, .088, .165, trim)
    for(const y of [.18, .204, .228]) box(.375, y, 0, .008, .007, .16, '#abb4bc')
    box(.364, .125, 0, .028, .038, .32, trim)
    box(-.365, .125, 0, .028, .038, .32, trim)
    box(-.394, .248, -.03, .065, .167, .162, graphite)
    const geometry = mergeGeometries(parts)
    parts.forEach(part => part.dispose())
    const material = new THREE.MeshBasicNodeMaterial({ vertexColors: true })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'Intro_HavalH9_ProgressMarker'
    return mesh
}

export function updateLoadingHaval(marker, center, progress, radius, scale = 1) {
    const angle = Math.max(0, Math.min(1, progress)) * Math.PI * 2
    marker.position.set(center.x - Math.sin(angle) * radius * scale,
        .025 * scale, center.z + Math.cos(angle) * radius * scale)
    marker.rotation.y = Math.PI - angle
    marker.scale.setScalar(scale)
}
