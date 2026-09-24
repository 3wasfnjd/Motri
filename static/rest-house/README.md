# Motri2 rest house

Exterior rest-house asset from the approved reference-based model, exported with its gates open. Embedded texture: 512 x 512. Draco GLB: 83,164 bytes, 10,636 triangles, 17 primitives, 5 materials. The existing game Draco loader handles this asset.

Placement is defined in `sources/Game/World/RestHouseSite.js`: uniform scale 0.6, gate at (-73.6, 0.03, -47), yaw +90 degrees. The gate faces the western circuit straight. Final footprint: 29.28 x 24 world units. Clear gate opening is approximately 3.03 units; the existing vehicle is approximately 2.04 units wide. Vehicle dimensions and mechanics are unchanged.

`RestHouse` runs before terrain physics and instanced scenery construction. It flattens both the terrain heightfield and shader height, masks grass, removes overlapping vegetation/prop references, and clips combined scenery/circuit geometry only inside the site and entrance. This also opens the invisible circuit rail at the entrance. Asphalt road geometry is preserved. Cleanup runs once at loading, not per frame.

Collision: 64 exported wall/building/gate/landscaping cuboids plus two ground slabs, transformed with the asset. No full-site solid box blocking the courtyard. Map label: الاستراحة. Respawn: `restHouse`, on the entrance apron facing inward.

Validation performed against main b3666cb:

- Three.js GLTFLoader with actual Draco decoding: successful.
- glTF validator: zero errors or warnings (Draco produces informational unsupported-extension notices; decoded separately).
- 326 terrain vertices on the plateau have zero height.
- 14 existing vegetation references removed; no separate bench/fence/brick/light instances overlap the footprint.
- 74 intersecting triangles clipped while retaining their portions outside the clearing.
- 3,427 remaining triangles from combined overlapping scene bounds checked: none intersect the site or entrance.
- Asphalt road geometry remains the identical resource object.
- 66 collision descriptions created and entrance respawn transformed correctly.
- Existing 3.0 x 2.04 vehicle envelope sampled at 532 positions along the suggested interior route: no exported obstacle intersections. This is geometric clearance, not steering-radius validation.
- Modified JavaScript passes syntax checks.

Not performed: browser/WebGPU rendering, live driving, or mobile frame-rate measurement. Real-world building dimensions are estimated from the supplied references.
