import { buildPickupVehicleBody } from './PickupVehicleBody.js'

export function buildDatsunVehicleBody(paintMaterial, detailMaterial)
{
    return buildPickupVehicleBody(paintMaterial, detailMaterial, 'datsun')
}
