// World metres, +Y up. The open gate faces east, towards the circuit straight.
export const SHEEP_PEN = Object.freeze({
    center: [-55.5, 0, -13.7],
    halfWidth: 7.5, halfDepth: 5.3, gateWidth: 4.8,
    bounds: [-63, -48, -19, -8.4],
    entrance: [-48.3, -42.85, -16.4, -11],
    feather: 1.3
})

// A separate feed-delivery bay south of the open gate, clear of both road bends.
export const FEED_PICKUP = Object.freeze({
    center: [-46.2, 0, -7.5], yaw: 0,
    parking: [-47.6, -44.6, -11.1, -4.5]
})

export const sheepPenRects = [
    [-63.65, -47.45, -19.65, -7.75],
    SHEEP_PEN.entrance,
    FEED_PICKUP.parking
]

export function sheepPenContains(x, z, padding = 0) {
    return sheepPenRects.some(([x0, x1, z0, z1]) =>
        x >= x0 - padding && x <= x1 + padding && z >= z0 - padding && z <= z1 + padding)
}

export function sheepPenFlattenWeight(x, z) {
    return Math.max(...sheepPenRects.map(([x0, x1, z0, z1]) => {
        const distance = Math.max(x0 - x, x - x1, z0 - z, z - z1, 0)
        const t = Math.min(1, distance / SHEEP_PEN.feather)
        return 1 - t * t * (3 - 2 * t)
    }))
}
