// World metres, +Y up. The open gate faces the western straight of the circuit.
export const REST_HOUSE = Object.freeze({
    position: [-73.6, 0.03, -47], scale: 0.6, yaw: Math.PI / 2,
    bounds: [-73.6, -44.32, -62.12, -38.12],
    entrance: [-77.44, -73.6, -49.04, -44.96],
    feather: 1.5
})

export const siteRects = [REST_HOUSE.bounds, REST_HOUSE.entrance]

export function siteContains(x, z, padding = 0) {
    return siteRects.some(([x0, x1, z0, z1]) =>
        x >= x0 - padding && x <= x1 + padding && z >= z0 - padding && z <= z1 + padding)
}

export function flattenWeight(x, z) {
    return Math.max(...siteRects.map(([x0, x1, z0, z1]) => {
        const distance = Math.max(x0 - x, x - x1, z0 - z, z - z1, 0)
        const t = Math.min(1, distance / REST_HOUSE.feather)
        return 1 - t * t * (3 - 2 * t)
    }))
}
