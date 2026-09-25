# Camp and rest-house lighting

- Two existing `lightGeneratorPhysicalDynamic` carts cloned from the disabled
  `behindTheScene` area. That area remains disabled and its source asset is intact.
- The carts stand on the left/right edges of the camel clearing, face inward,
  and reuse the original geometry, palette and three authored collider shapes.
  They are parked with fixed bodies; visual and collider scale are both 0.9.
- Six existing world pole lights join `PoleLights`' shared instance batches.
  They retain its original physics, night switch and fireflies.
- Five sagging festoon strings, 41 bulbs, minimum bulb clearance 2.87 m above
  the rest-house base. Poles stand off the central drive and open gate.
- Warm lamp faces, bulbs and subtle ground glows switch with the existing
  `night` interval. Daytime retains the unlit bulbs and all fixtures.
- No new texture/model downloads or dynamic light/shadow passes. Seven added
  mesh draws and 8,468 triangles including the six instanced poles. Cable and
  bulb geometry is built once; no lighting-specific per-frame JavaScript.

`SiteLighting` is constructed after site clearing and before `PoleLights`.
Positions and string connections are in `SiteLightingLayout.js`: camp offsets
are world metres, garden positions are authored rest-house local coordinates.

Validation used the current compressed area/pole GLBs and rest-house GLB:
ground contact, complete cart footprints inside flattened ground, oriented
collider separation from camp props/animals, pole/building clearance, overhead
clearance, unchanged hidden source, shared world instance counts, and repeated
day/night transitions. Browser GPU appearance still needs in-game review.
