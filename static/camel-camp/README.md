# Motri camel camp

Six original stylized dromedaries occupy the unused circular clearing north of
Career, labelled **قاعة العرض** in Arabic. The camp is centred at `(26, 0, -21)`,
with an 8.6 m sand radius and a 0.8 m terrain blend. It has three standing adults,
one standing calf and two kneeling adults, an open-front striped goat-hair tent,
a six-wheel water tanker, and a drinking trough connected by a hose.

The **مراح الإبل** map marker places the vehicle on the open southern apron at
`(26, 3, -14.2)`. Existing roads, the exhibition panels and other activity geometry
are preserved. Four overlapping vegetation references are removed before their
visual/physics instances are created. Terrain rendering and collision use the same
circular flattening region; the outer edge blends into the existing ground.

`CamelCampModel.js` builds the geometry with the game's shared lighting, shadows,
fog and reveal material. There are 9,836 rendered triangles, 4,708 source geometry
triangles, five draw batches, one material and twelve simple fixed colliders.
There are no runtime textures or external model downloads. Only the shared neck/head
instance buffer changes at 30 Hz, providing gentle independent idle motion; bodies
and feet stay fixed. Animation sleeps when the vehicle is more than 50 m away.
The truck is scenery, not a new drivable vehicle.

Run `node scripts/test-camel-camp.mjs` after installing the game's dependencies.
Geometry, six head poses, stationary feet, the spawn and 81 samples along a
3.0 x 2.04 m vehicle approach are checked. Integration was also exercised against
the repository's actual terrain, scenery, area and planting assets: original
scenery/area geometry stayed unchanged, 104 camp terrain vertices were flat,
11 terrain heights changed, and the rest of the terrain was preserved. Map drawing
was checked in day/night modes. The actual ticker updates nearby camels and sleeps
when distant. Syntax checks pass. No live browser driving or mobile frame-rate
measurement was possible in the GPU-less inspection environment.

The image below is a neutral render of the generated geometry, not an in-game capture.
It is for documentation and is not loaded by the game.

![Camel camp geometry preview](preview.webp)
