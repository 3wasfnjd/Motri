# Motri2 rest house

The revised placement moves the gate 0.8 units inward and 2.1 units north, with a 3.3% size reduction to increase clearance from the jump ramp and the time-machine area. The ramp resource is now untouched by the clearing pass.

Style: `RestHouseStyle.js` supplies two shared materials using Motri2's MeshDefaultMaterial. Vertex colours are explicitly connected to its shader; this avoids the generic material conversion dropping the model's original colour attributes. Ivory walls, warm sand, teal trim and bright green foliage use the game's lighting, shadows and fog. Paving uses a clean solid colour instead of the original stone texture. The original embedded PNG remains in the small GLB but is not sampled at runtime.

The surrounding infield's pond depressions are filled to Y=0 in the physical heightfield and terrain shader (water remains at Y=-0.3). Vegetation in that clearing is removed before instancing. Functional area props remain. The map overlay also replaces old pond/tree symbols.

Exterior rest-house asset from the approved reference-based model, exported with its gates open. Embedded texture: 512 x 512. Draco GLB: 83,164 bytes, 10,636 triangles, 17 primitives, 5 materials. The existing game Draco loader handles this asset.

Placement is defined in `sources/Game/World/RestHouseSite.js`: uniform scale 0.58, gate at (-72.8, 0.03, -49.1), yaw +90 degrees. The gate faces the western circuit straight. Final footprint: 28.304 x 23.2 world units. Clear gate opening is approximately 2.93 units; the existing vehicle is approximately 2.04 units wide. Vehicle dimensions and mechanics are unchanged.

`RestHouse` runs before terrain physics and instanced scenery construction. It flattens both the terrain heightfield and shader height, masks grass, removes overlapping vegetation/prop references, and clips combined scenery/circuit geometry only inside the site and entrance. This also opens the invisible circuit rail at the entrance. Asphalt road geometry is preserved. Cleanup runs once at loading, not per frame.

Collision: 64 exported wall/building/gate/landscaping cuboids plus two ground slabs, transformed with the asset. No full-site solid box blocking the courtyard. Map label: الاستراحة. Respawn: `restHouse`, on the entrance apron facing inward.

Validation performed against main b9258ee:

- Three.js GLTFLoader with actual Draco decoding: successful.
- glTF validator: zero errors or warnings (Draco produces informational unsupported-extension notices; decoded separately).
- 534 terrain vertices on the plateau have zero height.
- 15 existing vegetation references removed; no separate bench/fence/brick/light instances overlap the footprint.
- 54 intersecting triangles clipped while retaining their portions outside the clearing.
- 3,384 remaining triangles from combined overlapping scene bounds checked: none intersect the site or entrance.
- Asphalt road geometry remains the identical resource object.
- 66 collision descriptions created and entrance respawn transformed correctly.
- Existing 3.0 x 2.04 vehicle envelope sampled at 532 positions along the suggested interior route: no exported obstacle intersections. This is geometric clearance, not steering-radius validation.
- Modified JavaScript passes syntax checks.

Not performed: browser/WebGPU rendering, live driving, or mobile frame-rate measurement. Real-world building dimensions are estimated from the supplied references.
