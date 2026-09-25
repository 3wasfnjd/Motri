# Parked 2026 Shas

Original procedural Toyota LC70 single-cab interpretation beside the camel camp.
Beige paint, maroon stripes, the current round-headlamp/black-grille face, front
winch, dark alloys, open cargo tub, headboard and a covered spare. The car stays
parked; it does not replace the player's Haval or change vehicle handling.

- `CamelCampPickup.js`: one vertex-colour mesh, 7,608 triangles, four road tyres
  and one spare. Reuses the camp material. No textures or model downloads.
- `SHAS_PICKUP` in `CamelCampSite.js`: world position `[15.5, 0, -23.1]`, yaw
  `0.10` radians. +Z is the authored forward direction; units are metres.
- Three fixed cuboid colliders use the same vehicle position and rotation.
- A small western parking clearance uses the same CPU/GPU ground mask and
  removes only overlapping vegetation. Camp approach, tanker and light carts
  remain clear. The parked pickup is also shown on the map.
- The preview under `resources/camel-camp/` is documentation only, never loaded
  by the game. It is a CPU geometry render, not a browser screenshot.

Visual references: [Toyota Saudi LC70 Pickup 2026](https://www.toyota.com.sa/ar/vehicles/lc70pickup)
and its front/rear/three-quarter gallery. Proportions and details are simplified
for Motri's existing cartoon style.

Validation:

```
node scripts/test-camel-camp-pickup.mjs
node --experimental-wasm-modules --experimental-loader ./scripts/camel-camp-test-loader.mjs scripts/test-camel-camp-blasts.mjs
```

Tests cover mesh budget, ground contact, parking footprint, camp/light-cart
separation, the driving approach, and actual Rapier camel blast/return behaviour.
The current world GLBs were additionally checked for triangle intersections
with the pickup's placement; none were found. Browser GPU appearance has not
been tested in this environment.
