# Sheep pen

The pen sits west of the circuit straight, south of the rest house. Its centre is
`(-55.5, 0, -13.7)` in world metres; its 4.8 m gate opens east towards the street.
The map location **حظيرة الأغنام** uses the `sheepPen` respawn outside the gate.

`SheepPenSite.js` defines placement and terrain clearing. `SheepPenModel.js`
builds the fence, shade, troughs, hay and ten sheep. The animals use two shared,
static poses (standing and grazing), including two smaller lambs.

The model uses the game's lighting, fog and reveal material, vertex colours and
no image textures. It has 7,848 rendered triangles, three mesh draws before
shadow passes, one material and 25 fixed cuboid colliders. It adds no tick loop.

`SheepPen.js` runs before the floor, vegetation and area constructors. It flattens
the site with a feathered edge, removes five intersecting vegetation references
from the current map, and opens the circuit boundary collider at the approach.
The asphalt and other activity geometry are preserved.

Validation: module syntax, actual map resource integration, terrain bounds,
day/night map overlay, and geometric clearance for a 3.0 × 2.04 m vehicle passed.
Driving and appearance in a browser remain to be checked.
