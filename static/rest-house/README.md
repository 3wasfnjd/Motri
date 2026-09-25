# Motri rest house

Exterior-only rest house with an open vehicle entrance. Placement stays at (-72.8, 0.03, -49.1), scale 0.58 and yaw +90 degrees; the gate faces the western circuit straight. Real-world dimensions are estimated from the reference images.

## Marked layout update

The layout follows the user's annotated overhead image, `C93B4B99-4B78-4CE5-A748-56EF24D39BAF.jpeg`:

- Blue: connected stone paths around the gardens, pergola, front courtyard and rear-right corner. The paving is a triangulated planar union, avoiding overlapping strips. Existing shallow terraces retain their textured tops.
- Dark green: a flat lawn beside the tent seating, using `RH_Lawn` and the shared game palette material.
- Light green: additional world-oak planting. There are 46 shared oak instances; trees conflicting with the new paths were moved into adjacent planting areas.
- Red: the separate rear-right building, its roof/window details and `rear_right_block` collider are removed. Boundary walls remain.

The obsolete baked garden foliage/trunk meshes are removed from the asset. Trees are instantiated by `RestHousePlanting.js` from the retained planting metadata. The GLB has 6,471 triangles, 16 mesh primitives and 4 source materials; its compressed size is 72,392 bytes. Oak geometry is shared with the world and is not duplicated into this GLB.

`RestHouseStyle.js` supplies two shared game materials using the world's lighting, shadows and fog. The paving and terraces use `stone-paving.webp` (512 x 512, 44,628 bytes); the small original embedded stone tile is a standalone fallback. The lawn reuses the vertex-colour material, with no new texture or grass-blade geometry. The GLB resource URL is versioned as `rest-house-layout-v2` to invalidate the previous model cache.

## Placement and collision

`RestHouse` runs before terrain physics and instanced scenery construction. It flattens terrain, clears overlapping vegetation/props and clips intersecting combined scenery inside the established site/apron. Surrounding pond depressions are dry. The existing circuit asphalt, jump ramp, functional area props and vehicle mechanics are preserved.

The model metadata contains 33 static obstacle descriptions and 46 tree planting references. After planting, runtime physics uses the 33 obstacles and two existing ground slabs. The 46 garden oaks retain their visuals and shadows but have `noCollision` references, so `Trees.setPhysical()` creates no rigid bodies for them. Trees elsewhere in the world keep their collisions. The main gate opening is approximately 2.93 world units; the existing vehicle is approximately 2.04 units wide. The `restHouseVisit` achievement remains active. Respawn is `restHouse` on the entrance apron.

## Verification

- Three.js GLTFLoader decoded the actual Draco asset successfully; all attributes are finite, indices valid and new ground faces point upward.
- All static collision descriptions except the removed building are unchanged.
- 201 samples of the existing 3.0 x 2.04 world-unit vehicle envelope clear the gate and central drive.
- Marked paving connections were checked geometrically, including the shallow raised terraces. This does not assert that every pedestrian path accommodates the car.
- No triangles from the removed building remain in its former volume.
- glTF validation: zero errors or warnings; Draco extension information is checked separately by decoding.
- Changed JavaScript passes syntax checks. No browser/WebGPU drive test or mobile frame-rate measurement was performed.

## Moving poultry

Four hens and two roosters roam the large inner garden, inside the path loop.
`RestHousePoultryMotion.js` defines separate home-garden and travel bounds in asset
coordinates. Calm walking and feeding stay on the dirt patch. Fleeing can cross
every side of that patch and use the open paths and grounds throughout the compound;
only buildings, basins, trunk positions, other birds and the compound perimeter
limit escape. The birds have no physical colliders and never block the vehicle.
An explicit flee state interrupts feeding within 4.3 world metres of the vehicle
or its predicted path. Birds run at roughly 2.1–2.36 m/s, steer around nearby
obstacles instead of waiting for a complete random route, and stay alert for
2.4 seconds after the threat leaves. The vehicle's frame displacement is converted
to metres per second and rotated into garden coordinates before prediction.

Escaped birds wait at a safe position while the car occupies the garden or its
1.8-metre margin. After it clears for 2.4 seconds, birds walk back to available
garden positions. `RestHousePoultryNavigation.js` caches static clearance on a small
0.4-metre grid and finds return routes only when needed. A simplified record of
each bird's actual escape route handles narrow gaps beside the terrace steps.
Blocked return routes are replanned, and a renewed vehicle approach interrupts
returning immediately. This does not change vehicle physics or tree collisions.

The procedural models have articulated heads and alternating legs, with larger
red combs and green tails on the roosters. Five instanced batches share one game
palette material: 4,224 rendered triangles, 1,284 shared geometry triangles, no
textures and no rigid bodies. Motion updates at 30 Hz and sleeps when the player
is more than 45 world metres from the garden **after all escaped birds have returned**.
Instance render bounds cover the entire travel area so birds remain visible outside
the dirt patch. Models use world-unit dimensions, while placement follows the rest
house's position, rotation and scale.

A five-minute deterministic simulation verified all six birds moving independently,
pecking, staying within bounds and avoiding static obstacles/one another. Vehicle
avoidance, articulated transforms and the actual ticker/distance-culling integration
were also checked. The flee fix additionally passed 96 approach cases (all six
birds, eight directions, two distances) and eight moving-car passes. These checks
reproduced 52 low-motion cases in the old behaviour; every revised approach caused
at least 1.36 m of movement in 2.5 seconds without feeding near the car. The actual
tree-physics constructor produced zero garden colliders and retained outside-tree
colliders. A live cloud-browser attempt could not initialize WebGPU or WebGL, so
in-game driving and visual behaviour remain unverified there.

The expanded escape/return behaviour passes `node scripts/test-rest-house-poultry.mjs`
using the shipped collision metadata: eight parked-car scenarios take all six birds
outside the old rectangle, collectively crossing all four sides; all birds return
after removal of the car and resume garden-only roaming. Four further chase scenarios
check the wider grounds and interruption of return trips. Static obstacles and bird
separation are checked throughout. The real ticker wrapper was also exercised with
a car beyond 45 metres: birds finished returning, then slept; expanded mesh bounds
included their escaped positions. These are simulation checks, not a mobile frame-rate
or live driving test.
