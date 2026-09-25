# حوش الغنم

The pen sits west of the circuit straight, south of the rest house. Its centre is
`(-55.5, 0, -13.7)` in world metres; its 4.8 m gate opens east towards the street.
The map location **حوش الغنم** uses the `sheepPen` respawn outside the gate.

`SheepPenSite.js` defines placement and terrain clearing. `SheepPenModel.js`
builds the fence, shade, troughs, hay and ten sheep, including two smaller lambs.
`SheepPenMotion.js` gives each animal independent short walks, standing pauses and
grazing. Shared head and leg instances animate looking, lowering the head and a
walking gait. Sheep choose clear routes around the fence, shade posts, hay and
feeders, keep apart, and step away from an approaching vehicle. The open gate's
eastern approach stays clear.

The model uses the game's lighting, fog and reveal material, vertex colours and
no image textures. It still has 7,848 rendered triangles and one material. Four
mesh batches cover the fixed scenery, bodies, heads and forty shared leg instances.
The existing 25 cuboid colliders are split into 15 static props and 10 kinematic
sheep bodies, which follow the visible sheep. Motion and instance updates run at
no more than 20 Hz and sleep beyond 45 m. No skeletal rigs or textures are added.

`SheepPen.js` runs before the floor, vegetation and area constructors. It flattens
the site with a feathered edge, removes five intersecting vegetation references
from the current map, and opens the circuit boundary collider at the approach.
The asphalt and other activity geometry are preserved.

Validation: module syntax, actual map resource integration, terrain bounds,
day/night map overlay, and geometric clearance for a 3.0 × 2.04 m vehicle passed.
Driving and appearance in a browser remain to be checked.

Animation regression (after installing the game dependencies):

```sh
node --experimental-wasm-modules --loader ./scripts/camel-camp-test-loader.mjs scripts/test-sheep-pen-motion.mjs
```

This exercises two minutes of independent movement for all ten sheep, a vehicle
approach, fence/feeder/other-sheep avoidance, moving legs, planted idle hooves,
head motion, geometric bounds and ground clearance. The actual game physics and
Rapier WASM verify collider/visual synchronisation at 30 and 144 Hz, the 20 Hz
animation cap, distance sleep/resume and unchanged collider counts. The loader
only substitutes browser bootstrap/material dependencies for this Node test.
