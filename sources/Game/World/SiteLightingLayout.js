// Camp offsets are world metres. Garden positions use the authored rest-house
// coordinates, before its scale/yaw; the reused lamps retain their world size.
export const CAMP_LIGHT_CARTS = [
    { name: 'CamelCamp_LightCart_Left', x: -6.4, z: -3.1, yaw: Math.PI / 2 },
    { name: 'CamelCamp_LightCart_Right', x: 7.1, z: 1.65, yaw: -Math.PI / 2 }
]
export const CART_SCALE = .9

export const REST_HOUSE_LIGHT_POLES = [
    [4.5, 4], [-4.8, 4], [4.7, 18], [-5.4, 14], [5.3, 29], [18.5, 41.3]
]
export const REST_HOUSE_LIGHT_STRINGS = [[0, 1], [0, 2], [2, 3], [2, 4], [4, 5]]
export const STRING_HEIGHT = 3.30
export const STRING_SAG = .24
export const BULB_DROP = .12
export const BULB_RADIUS = .085

export function stringPoint(a, b, t) {
    return a.clone().lerp(b, t).add({ x: 0, y: -4 * STRING_SAG * t * (1 - t), z: 0 })
}
