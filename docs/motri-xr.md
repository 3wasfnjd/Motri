# Motri XR

URL: `https://3wasfnjd.github.io/Motri/xr/`

The `/xr/` entry reuses the current Motri world, Haval vehicle, Rapier physics and assets. The main entry does not enable XR. No multiplayer branch or code is merged.

## Controls

| Mode | Control | Action |
| --- | --- | --- |
| VR | Left stick | Steering |
| VR | Right / left trigger | Accelerate / reverse |
| VR | Right grip | Brake |
| VR | Right stick left/right | 30° view turns |
| Both | A / hold A | Interact nearby or jump / recover car |
| VR | Left grip / left stick click | Boost / horn |
| Both | X (left hand) | Open/close the in-headset menu, including direct H9/Shas/Datsun selection |
| Menu | Left stick + either trigger / A | Navigate + select; Y or B goes back |
| VR | Camera selector before entry, or Y while driving | Driver's seat / camera behind the car |
| AR | Ray + trigger/pinch | Place on a detected horizontal surface |
| AR | Right stick up/down | Scale the world from 0.5 to 6 metres wide (the hint shows the ratio) |
| AR | Right stick left/right | Rotate around the selected surface point |
| AR | Both grips or both hand pinches | Scale by changing hand separation |
| AR | Menu → Settings / Y | Place again / request room capture |
| AR | Left stick | Drive the miniature car |
| Both | B | End the session |

## Rendering and placement

Three r183's XR manager requires the WebGL2 backend. The XR entry selects `forceWebGL`, uses the renderer's XR animation loop and bypasses the monoscopic postprocessing pipeline while presenting. Wheel-track offscreen rendering is paused during XR; overlays, speed lines, dense grass and weather particles are hidden. Stereo rendering uses native framebuffer scale, MSAA, moderate fixed foveation (0.35), ACES tone mapping and a dedicated balanced daylight/night palette. The vehicle underglow and extra contact-shadow overlay are disabled in XR. The terrain and water remain fixed at the world centre instead of following the car. Dynamic shadow maps stay disabled. These choices target Quest; actual headset frame rate must be measured on hardware.

AR uses controller-space hit tests, a viewer-space fallback when controller hit testing is unavailable, then actual horizontal detected-plane polygons. No synthetic floor is presented as a detected surface. Optional anchors follow both position and heading corrections, with small position corrections damped; temporary loss of the anchor hides the world and brakes the car. Two-hand resizing brakes the car. Optional anchors follow the selected position; otherwise local reference-space coordinates are used, and a reference-space reset requires placement again. World resizing uses the inverse transform on the viewer rig, preserving all original world-space shader coordinates and physics. A full terrain patch replaces the small camera-following tile during XR.

The renderer uses one scene throughout AR, including surface selection, so the shared stereo camera uniforms retain a consistent layout. Before placement the world is beyond the far clip plane, while the room-space reticle and HUD remain visible. The r183 WebGL compatibility layer restores binding slots per material and handles the default/null framebuffer returned by Meta IWER. Native Quest framebuffer objects keep Three's normal framebuffer path. Intro reveal completes before entry, and snow's offscreen render is disabled in the XR entry. Frustum culling stays enabled in AR. Three r183's stereo union frustum measures the eye distance in world units but the FOV and near/far planes in eye units. Under the tabletop rig (≈142 world units per metre) it culled every visible object, so culling had previously been switched off. `installXRScaledStereoCulling` rebuilds the union in rig units; looking away from the table drops a frame from ≈750 draw calls to ≈25. The miniature rests on the surface: the detected point is the underside of an open-topped tray whose walls rise to the terrain border. The tray no longer sinks into the real table, and the gap above the sea bed is closed. The world's +Z side faces the viewer on placement, and resizing shows the scale ratio (for example 1:142 at 1.8 m). Unused cookie-pool instances collapse to zero scale instead of floating 99 m above the map.

VR starts at the driver's seat. The cockpit is the selected car's own body: from the measured eye point its headliner, A-pillars, beltline and hood frame the windshield, so H9, Shas and Datsun each look and measure like themselves. A 0.37 m steering wheel, raked 23° and turning counter-clockwise for a left turn (±137° at full lock), and a speed cluster seen through its upper opening are drawn after the body. The eye follows the car's full attitude, so it stays in the seat on slopes, while the view keeps a level horizon. A world-space sky dome provides a stereo-safe horizon gradient and subtle sun without screen-space postprocessing. The chase camera damps the vehicle motion and probes Rapier obstacles to avoid crossing walls. Driver mode filters suspension chatter and leaves physical head motion unfiltered. Y switches views without restarting the session; view turns preserve the selected seat position, and physical head movement remains one-to-one in metres. Revealed interaction labels keep depth testing in VR, so they no longer draw through the car body with conflicting eye depth. The X menu is world-locked where it opens rather than following the head.

Capability checks run in the browser. An unsupported browser shows a Quest instruction, not a nonfunctional entry button. AR may require Quest room/space setup and permission to use it. The experience runs on HTTPS and is intended for Meta Quest Browser; iPhone Safari is not assumed to support immersive WebXR.

## Physics, dimensions and measurements

Gravity is 9.81 m/s². XR runs the original vehicle at real time (desktop doubles the clock), with ≤ 1/120 s substeps at any refresh rate. Measured with the production Rapier code:

| Quantity | Motri XR | Reference |
| --- | --- | --- |
| Driver eye height | 1.55 m above the ground, 0.35 m left of centre | Real SUV ≈ 1.45–1.55 m |
| Roof / wheel diameter | 1.89 m / 0.80 m | Haval H9: 1.93 m / ≈ 0.80 m |
| Headroom / door / beltline from eye | 0.17 m up / 0.26 m left / 0.19 m down | |
| Steering wheel | 0.37 m, 0.42 m ahead, 0.27 m below the eye | Typical 0.36–0.38 m |
| 0–30 km/h, top speed | 2.2 s, ≈ 40 km/h | |
| Braking from 40 km/h | 4.4 m, ≈ 0.73 g | Dry road 0.7–0.9 g |
| Steady cornering | up to ≈ 0.8 g; ≈ 8 m turning circle | |
| 3 m fall | 0.79 s (free fall: 0.78 s) | |

The car is shorter than a real H9 (3.0 m body on a 1.8 m wheelbase, versus 4.95 m and 2.85 m). Its heights and wheels are life-size, which is why the seat, roof and hood read correctly in VR. On desktop, boosting from rest pitches the car 60–80° onto its rear wheels and reaches 159 km/h in real time. XR keeps the normal tuning but halves the boost force and caps it near 70 km/h, so the car stays on four wheels (≤ 7° squat).

## Gameplay integration

The XR renderer also drives the GSAP root timeline, including in the lobby. This keeps delayed explosions, activity countdowns and respawn callbacks running when window RAF is suspended by a headset. Controller interaction, jump, boost and horn use the original input action bus and its category filters. Losing tracking or leaving a session releases all XR actions.

Area visibility uses the XR mode instead of the desktop overhead camera footprint. All areas are shown in tabletop AR. Four fixed perimeter colliders and a fixed safety floor enclose the full 256-metre world, including the dunes; an out-of-bounds fallback restores the car to a safe spawn. Exploded crate instances collapse to zero scale and regain their original scale on reset; they are no longer hidden by moving them 100 metres above the map. AR hides floating interaction labels while retaining their triggers and showing only the active action hint.

X opens a stereo menu in both modes. It offers the existing vehicle bodies, sound/quality, camera/recentering, destinations, achievements and readable game menus. All pages share one layout: a title with a Y-back chip, icon rows, and a footer with control hints and page dots. The home page shows the current car and achievement count. Settings are grouped (sound and display, camera or placement, session) with switches and value pills; exit is marked in red. Achievements show overall progress, then each goal with its description, a progress ring and bar, unfinished goals first; selecting one shows its full text. The map draws the desktop day/night map with the dunes, rest house, sheep pen and camel camp overlays, every destination pin, and the car's position and heading. It selects the destination nearest the car and shows a route line and the ground distance in metres; the trigger travels there. Menu input brakes the car and waits for neutral controls on closing. Full browser panels remain available from their menu entry.

DOM activity panels show a short in-headset summary: A dismisses it, B leaves the session to show the full browser panel. No in-headset keyboard is claimed.

## Verification

Run `node scripts/test-motri-xr.mjs` and `npm run build`. The build generates `/xr/index.html` from the original game shell and keeps resource URLs relative to the original root. Browser tests should cover loading, VR drive/recover/exit, AR surface acquisition/placement/scale/reposition, tracking loss, and repeated AR/VR entry. Emulator checks do not establish real-headset performance or comfort.

`scripts/test-motri-xr-browser.mjs` is an optional regression using official Meta IWER and Playwright installed outside the application. Set `MOTRI2_PLAYWRIGHT_MODULE` to Playwright's `index.mjs` and `MOTRI_XR_IWER_PATH` to IWER's `build/iwer.min.js`, then run it after building. Optional variables: `MOTRI_XR_CHROMIUM` for a browser executable and `MOTRI_XR_ARTIFACT_DIR` for screenshots. It exercises IWER's real null framebuffer, checks visible terrain pixels, resizes with sticks and both controllers, rejects placement without a surface, switches cameras while driving, and re-enters AR with only plane detection available.

References: [Three XRManager source](https://github.com/mrdoob/three.js/blob/r183/src/renderers/common/XRManager.js), [Meta mixed reality](https://developers.meta.com/vr/documentation/web/webxr-mixed-reality/), [WebXR hit testing](https://immersive-web.github.io/hit-test/).

The `Motri XR gameplay and stereo checks` workflow on `feat/motri-xr` builds the exact commit, uses official Meta IWER with real Rapier contacts, checks crate explosion/removal and reset, drives the real race through its countdown, and captures AR/VR screenshots. Unit checks also cover GSAP with its RAF ticker asleep, input releases, chase collision probes and restoration of the exterior. Emulator tests do not establish real Quest tracking stability, haptics or sustained frame rate.

Research: [Meta WebXR performance](https://developers.meta.com/vr/documentation/web/webxr-perf-bp/), [fixed foveation](https://developers.meta.com/vr/documentation/web/webxr-ffr/), [Three color management](https://threejs.org/manual/pages/color-management.html), [GSAP custom clock](https://gsap.com/docs/v3/GSAP/gsap.updateRoot()/), [WebXR anchors](https://immersive-web.github.io/anchors/).
