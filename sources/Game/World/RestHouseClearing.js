import * as THREE from 'three/webgpu'

// Subtract rectangles from combined meshes without removing long triangles
// beyond the site. Interpolate every attribute at newly cut edges.
export function clearGeometry(mesh, rectangles) {
    const g = mesh.geometry, index = g.index, position = g.attributes.position
    const boxes = rectangles.map(([x0, x1, z0, z1]) => new THREE.Box3(
        new THREE.Vector3(x0, -100, z0), new THREE.Vector3(x1, 100, z1)))
    const names = Object.keys(g.attributes), data = Object.fromEntries(names.map(n => [n, []]))
    const groups = [], triangle = new THREE.Triangle()
    let changed = 0, vertices = 0
    const makeVertex = id => ({
        world: new THREE.Vector3().fromBufferAttribute(position, id).applyMatrix4(mesh.matrixWorld),
        values: Object.fromEntries(names.map(n => {
            const a = g.attributes[n]
            return [n, Array.from({ length: a.itemSize }, (_, j) => a.getComponent(id, j))]
        }))
    })
    const interpolate = (a, b, t) => ({
        world: a.world.clone().lerp(b.world, t),
        values: Object.fromEntries(names.map(n => [n, a.values[n].map((v, i) => v + (b.values[n][i] - v) * t)]))
    })
    const split = (polygon, axis, boundary, sign) => {
        const inside = [], outside = []
        for(let i = 0; i < polygon.length; i++) {
            const a = polygon[i], b = polygon[(i + 1) % polygon.length]
            const da = (a.world[axis] - boundary) * sign, db = (b.world[axis] - boundary) * sign
            ;(da >= 0 ? inside : outside).push(a)
            if((da >= 0) !== (db >= 0)) {
                const v = interpolate(a, b, da / (da - db))
                inside.push(v); outside.push(v)
            }
        }
        return [inside, outside]
    }
    const ranges = g.groups.length ? g.groups : [{ start: 0, count: index ? index.count : position.count, materialIndex: 0 }]
    for(const group of ranges) {
        const start = vertices
        for(let i = group.start; i < group.start + group.count; i += 3) {
            const original = [0, 1, 2].map(j => makeVertex(index ? index.getX(i + j) : i + j))
            triangle.set(...original.map(v => v.world))
            let pieces = [original]
            if(boxes.some(box => box.intersectsTriangle(triangle))) {
                changed++
                for(const [x0, x1, z0, z1] of rectangles) {
                    const remaining = []
                    for(const piece of pieces) {
                        let inside = piece
                        for(const [axis, boundary, sign] of [['x', x0, 1], ['x', x1, -1], ['z', z0, 1], ['z', z1, -1]]) {
                            if(inside.length < 3) break
                            const [next, outside] = split(inside, axis, boundary, sign)
                            if(outside.length >= 3) remaining.push(outside)
                            inside = next
                        }
                    }
                    pieces = remaining
                }
            }
            for(const polygon of pieces) for(let j = 1; j < polygon.length - 1; j++) {
                const face = [polygon[0], polygon[j], polygon[j + 1]]
                triangle.set(...face.map(v => v.world))
                if(triangle.getArea() < 1e-10) continue
                for(const v of face) for(const n of names) data[n].push(...v.values[n])
                vertices += 3
            }
        }
        groups.push({ start, count: vertices - start, materialIndex: group.materialIndex })
    }
    if(!changed) return 0
    const result = new THREE.BufferGeometry()
    for(const n of names) result.setAttribute(n, new THREE.Float32BufferAttribute(data[n], g.attributes[n].itemSize))
    result.setIndex(Array.from({ length: vertices }, (_, i) => i))
    for(const group of groups) result.addGroup(group.start, group.count, group.materialIndex)
    if(result.attributes.normal) result.normalizeNormals()
    result.computeBoundingBox(); result.computeBoundingSphere()
    mesh.geometry = result
    return changed
}
