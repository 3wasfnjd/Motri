# Vehicle underglow

All three playable body styles share a cyan underbody neon treatment.
Four emissive strips are merged into one mesh (48 triangles, one draw).
The existing world material receives a soft cyan contribution over a 5.3 × 4.1 metre ellipse, aligned to the vehicle and its wheel-contact plane. This works on the floor, roads, rest-house paving and dune materials without a floating decal plane.

The field is bounded in world space and fades away from the supporting plane; it uses no textures, dynamic lights, shadow maps, raycasts or additional render passes. It adds local shader work to MeshDefaultMaterial. Vehicle physics, wheel geometry, suspension, controls and original lamps are unchanged.

The ground contribution switches off with no wheel contacts, an inverted vehicle, hidden chassis or excessive distance above the contact plane. The physical strips remain attached to the chassis. Resource cleanup disables the shared field and disposes the strip mesh resources.

Validation: contact-plane orientation and height on raised slopes, heading, one-wheel contact, airborne/respawn/inverted/hidden states, no physics mutation, cleanup, and headless TSL generation for both WGSL and GLSL. These checks do not replace visual testing in a live mobile browser; mobile frame rate and final perceived brightness have not been measured here.
