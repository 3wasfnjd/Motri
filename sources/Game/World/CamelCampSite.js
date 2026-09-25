// The unused circular clearing north of Career (the Arabic "قاعة العرض").
// World metres, +Y up. Keep its southern approach clear of the exhibition panels.
export const CAMEL_CAMP = Object.freeze({
    center: [26, 0, -21], radius: 8.6, feather: .8,
    tent: [-1.3, -5.1], tanker: [5.2, -2.5],
    respawn: [26, 3, -14.2]
})

export const camelPlacements = [
    { name: 'Camel_01', x: -5.4, z: -.4, yaw: .5, size: 1.03, seated: false },
    { name: 'Camel_02', x: -2.8, z: 1.2, yaw: -.4, size: .96, seated: false },
    { name: 'Camel_03', x: 4.8, z: 1.6, yaw: -1.2, size: 1, seated: false },
    { name: 'Camel_Calf', x: 5, z: 4.8, yaw: -1.8, size: .68, seated: false },
    { name: 'Camel_Resting_01', x: -4.2, z: 4.6, yaw: .25, size: 1, seated: true },
    { name: 'Camel_Resting_02', x: 1.2, z: -.5, yaw: -1.5, size: .97, seated: true }
]

export function camelCampContains(x, z, padding = 0) {
    return Math.hypot(x - CAMEL_CAMP.center[0], z - CAMEL_CAMP.center[2]) <= CAMEL_CAMP.radius + padding
}

export function camelCampFlattenWeight(x, z) {
    const distance = Math.hypot(x - CAMEL_CAMP.center[0], z - CAMEL_CAMP.center[2])
    const t = Math.max(0, Math.min(1, (distance - CAMEL_CAMP.radius) / CAMEL_CAMP.feather))
    return 1 - t * t * (3 - 2 * t)
}
