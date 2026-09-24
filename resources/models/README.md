# HAVAL H9 — Motri2 stylized vehicle

Original geometry authored from the eight supplied reference images in Blender 5.2.
No downloaded vehicle mesh was imported, repaired, reused or decimated.
The closed spare-wheel cover and multi-spoke wheels follow the grey reference variant.
This is an independently modeled, stylized interpretation, not manufacturer CAD.

Run `build_h9.py` only in a new empty Blender file; it replaces the current scene.

## Deliverables

- `Haval_H9_Motri2.glb`: clean gameplay asset, no studio scene; no Draco/Meshopt decoder required.
- `Haval_H9_Motri2.blend`: editable Blender source; applied modeling modifiers, semantic mesh objects.
- `previews/`: exact front, front-left, front-right, exact left orthographic, rear-left and exact rear images rendered from this geometry.
- `motri2_h9.js`: optional Three.js adapter for paint, plates, steering, rolling and vertical wheel offsets.
- `build_h9.py`: reproducible from-scratch construction script for Blender; creates an inspection studio.
- `validate_blender.py`: geometry/pivot/intersection verification script, run inside Blender.
- `render_previews.py`: reproducible camera positions and temporary render setup.
- `finalize_export.py`: removes the temporary studio and unused UVs before vehicle export.
- `asset_manifest.json`: exact names, axes and binding constants.
- `validate_three.mjs`: repeatable GLTFLoader and adapter checks (requires the host project's Three.js dependency).
- Validation JSON files: recorded Blender, glTF and Three.js checks.

## Asset measurements and budget

| Property | Value |
|---|---|
| Triangles | 31,900 |
| GLB size | 586,192 bytes (0.586 MB) |
| Blender file size | 2,235,244 bytes (2.235 MB) |
| Materials | 8 |
| Mesh objects in Blender | 20 |
| Render primitives / base draw calls | 37 |
| Road wheels | Exactly 4 |
| Textures embedded | None |
| Animations / armatures / skins | None |
| Overall modeled length, including plates and spare cover | 5.154 m |
| Overall width, including mirrors | 2.402 m |
| Roof rail height | 2.015 m |
| Wheelbase | 2.850 m |
| Track between wheel origins | 1.716 m |
| Tire radius | 0.42432 m |
| Complete wheel width, including rim face | 0.308 m |

Dimensions are measurements of this stylized model, not claims of exact factory dimensions.
Shape and proportions were taken primarily from the provided photographs.
The current regional specification brochure was consulted only for scale context:
[2026 H9 regional brochure](https://www.gwmuae.com/Static/pdf/H9.pdf)
It does not establish the precise dimensions of every pictured trim.

## Coordinate system

| Role | Blender | GLB / Three.js |
|---|---|---|
| Forward | -Y | +Z |
| Up | +Z | +Y |
| Vehicle left | +X | +X |
| Wheel rolling axis | local +X | local +X |
| Front steering axis | local +Z | local +Y |

One unit equals one metre. The root is on the ground near the wheelbase midpoint.
All object scales are positive unit scales and all rest rotations are zero.
For motion along +Z in Three.js, positive local-X rotation produces forward rolling.
Use `distanceMetres / 0.42432` for the angle in radians.
The left/right labels refer to the driver's perspective.

| Part | GLB position (X, Y, Z), metres |
|---|---|
| FL steering pivot | (0.858, 0.42432, 1.440) |
| FR steering pivot | (-0.858, 0.42432, 1.440) |
| RL wheel | (0.858, 0.42432, -1.410) |
| RR wheel | (-0.858, 0.42432, -1.410) |

Front wheel mesh origins are at `(0,0,0)` relative to their steering parents.
Steer the parent, rotate the child. Move front steering parents vertically for suspension;
move rear wheel objects vertically. The model contains no suspension or physics simulation.

## Object hierarchy

`H9_Root` contains `H9_Chassis`, `H9_BodyPaint`, `H9_Glass`, `H9_Grille`,
`H9_Headlights`, `H9_Taillights`, `H9_Trim`, `H9_RoofRails`, `H9_SideSteps`,
`H9_SpareWheelCover`, the two plate mounts, the two plate frames, the two front
steering pivots and the two rear wheels.

- `Wheel_FL_SteeringPivot` → `Wheel_FL`
- `Wheel_FR_SteeringPivot` → `Wheel_FR`
- `H9_LicensePlate_Front` → `LicensePlateSurface_Front`
- `H9_LicensePlate_Rear` → `LicensePlateSurface_Rear`

GLTFLoader represents multi-material Blender meshes as groups containing render meshes.
Always get a named wheel with `getObjectByName()` and transform that entire object/group.
Do not select wheels by a loose name substring: `H9_SpareWheelCover` stays fixed to the body.

## Paint and materials

`Mat_Body_MatteGrey` uses sRGB `#626467`, metallic 0.16, roughness 0.66, no clear coat.
It is assigned only to painted surfaces, including the painted spare-wheel cover.
Change the material color to recolor the car. Clone it once for each vehicle instance,
then share that clone across the painted parts of that instance.
The optional adapter does this automatically.

Other materials: `Mat_Glass`, `Mat_Rubber`, `Mat_Rim_Gunmetal`, `Mat_DarkTrim`,
`Mat_Headlight`, `Mat_Taillight`, `Mat_LicensePlate`.
Glass is opaque, dark and inexpensive; no detailed interior is included.
Paint will look different under different environments, exposure and tone mapping.

## Dynamic plates

Both plates are blank. No Arabic/English registration letters or numbers are baked in.
Apply a runtime canvas texture to `LicensePlateSurface_Front` and
`LicensePlateSurface_Rear` only. The mounts/frames remain separate.

- Each visible surface is a flat quad, two triangles, with a complete non-mirrored UV square.
- The two quads intentionally have open boundary edges; all solid components are manifold.
- Use a canvas around **1024 × 226** or **512 × 113** pixels to match the visible surface ratio.
- Set `texture.colorSpace = THREE.SRGBColorSpace` and `texture.flipY = false`.
- Clone each surface material before assigning a map so the plate backing stays neutral.
- Use `document.fonts.ready` before drawing Arabic text and set the canvas text direction as needed.
- The asset does not validate registration formats or prescribe letter transliteration.

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createH9Adapter } from './motri2_h9.js';

const gltf = await new GLTFLoader().loadAsync('/models/Haval_H9_Motri2.glb');
const h9 = createH9Adapter(gltf.scene);
scene.add(h9.root);

h9.setBodyColor('#626467');
h9.setSteeringRadians(Math.PI / 6); // +30 degrees
h9.setTravelMeters(distanceFromYourGame);
h9.setPlateCanvases(frontCanvas, rearCanvas);
```

The host game owns timing, root movement, collision shapes and physics. Match its coordinate
convention in a parent wrapper if necessary. Do not bake a corrective rotation into wheel geometry.

## Verification and limits

- Blender: 104 sampled wheel poses through full rotations and -30/0/+30° steering;
  no wheel-to-static-body triangle intersections and zero pivot drift.
- All four road tires meet the same ground plane, within floating-point precision.
- Closed solid components checked for manifold edges, zero-area faces and loose vertices.
- Khronos glTF Validator: zero errors and zero warnings. The two plate UV attributes are
  intentionally unused until the game applies a texture and may be reported as informational items.
- Three.js GLTFLoader parsing passed. Tested paint isolation, texture assignment to the plates,
  rolling/steering centers in 75 combined poses, and individual vertical wheel offsets.
- No WebGL runtime/device performance benchmark was performed. Shader/appearance inspection
  uses the supplied Blender studio renders. Draw calls increase with shadow and other render passes.
- The asset has not been installed or play-tested inside the actual Motri2 repository.
- No LODs, detailed underbody, interior, baked animation, or physics rig is included.

## إعادة الاستخدام بالعربية

ملف GLB مخصص للاستيراد في اللعبة، وملف Blender قابل للتعديل.
العجلات الأربع مستقلة، ومحورا التوجيه منفصلان، واللوحتان فارغتان للنص الديناميكي.
اللون يتغير عبر `Mat_Body_MatteGrey` دون التأثير على الزجاج أو الإطارات.
تم فحص البنية والحركة والملف، لكن يلزم اختبار الأداء والربط داخل Motri2 على الجوال.
