// World metres, +Y up. The open gate faces the western straight of the circuit.
export const REST_HOUSE = Object.freeze({
    position: [-72.8, 0.03, -49.1], scale: 0.58, yaw: Math.PI / 2,
    bounds: [-72.8, -44.496, -63.716, -40.516],
    entrance: [-76.512, -72.8, -51.072, -47.128],
    feather: 1.5
})

export const siteRects = [REST_HOUSE.bounds, REST_HOUSE.entrance]
// Dry, clear the surrounding infield too, without deleting the time-machine
// area or changing the racing asphalt. These include the ponds behind the site.
export const landscapeRects = [[-69, -49, -77, -62], [-73.5, -44, -70, -36], [-69, -49, -40, -33.5]]
export const groundRects = [...siteRects, ...landscapeRects]

export function landscapeContains(x, z, padding = 0) {
    return groundRects.some(([x0, x1, z0, z1]) =>
        x >= x0 - padding && x <= x1 + padding && z >= z0 - padding && z <= z1 + padding)
}

export function siteContains(x, z, padding = 0) {
    return siteRects.some(([x0, x1, z0, z1]) =>
        x >= x0 - padding && x <= x1 + padding && z >= z0 - padding && z <= z1 + padding)
}

export function flattenWeight(x, z) {
    return Math.max(...groundRects.map(([x0, x1, z0, z1]) => {
        const distance = Math.max(x0 - x, x - x1, z0 - z, z - z1, 0)
        const t = Math.min(1, distance / REST_HOUSE.feather)
        return 1 - t * t * (3 - 2 * t)
    }))
}
