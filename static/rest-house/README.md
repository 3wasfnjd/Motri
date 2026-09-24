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

The model metadata contains 33 static obstacle descriptions and 46 tree planting references. After planting, runtime physics uses the 33 obstacles, two existing ground slabs and the oak system's scaled trunk cylinders. The main gate opening is approximately 2.93 world units; the existing vehicle is approximately 2.04 units wide. The `restHouseVisit` achievement remains active. Respawn is `restHouse` on the entrance apron.

## Verification

- Three.js GLTFLoader decoded the actual Draco asset successfully; all attributes are finite, indices valid and new ground faces point upward.
- All static collision descriptions except the removed building are unchanged.
- 201 samples of the existing 3.0 x 2.04 world-unit vehicle envelope clear the gate and central drive.
- Marked paving connections were checked geometrically, including the shallow raised terraces. This does not assert that every pedestrian path accommodates the car.
- No triangles from the removed building remain in its former volume.
- glTF validation: zero errors or warnings; Draco extension information is checked separately by decoding.
- Changed JavaScript passes syntax checks. No browser/WebGPU drive test or mobile frame-rate measurement was performed.
