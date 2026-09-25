import { buildPickupVehicleBody } from './PickupVehicleBody.js'

export function buildShasVehicleBody(paintMaterial, detailMaterial)
{
    return buildPickupVehicleBody(paintMaterial, detailMaterial, 'shas')
}
