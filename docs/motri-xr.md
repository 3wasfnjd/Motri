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
| VR | A / X | Recover car / recenter view |
| VR | Camera selector before entry, or Y while driving | Driver's seat / camera behind the car |
| AR | Ray + trigger/pinch | Place on a detected horizontal surface |
| AR | Right stick up/down | Scale the world from 0.5 to 6 metres wide |
| AR | Right stick left/right | Rotate around the selected surface point |
| AR | Both grips or both hand pinches | Scale by changing hand separation |
| AR | X / Y | Place again / request room capture |
| AR | Left stick | Drive the miniature car |
| Both | B | End the session |

## Rendering and placement

Three r183's XR manager requires the WebGL2 backend. The XR entry selects `forceWebGL`, uses the renderer's XR animation loop and bypasses the monoscopic postprocessing pipeline while presenting. Wheel-track offscreen rendering is paused during XR; overlays, speed lines, dense grass and weather particles are hidden. Stereo rendering uses reduced framebuffer resolution, foveation and no dynamic shadow maps.

AR uses controller-space hit tests, a viewer-space fallback when controller hit testing is unavailable, then actual horizontal detected-plane polygons. No synthetic floor is presented as a detected surface. Optional anchors follow the selected position; otherwise local reference-space coordinates are used, and a reference-space reset requires placement again. World resizing uses the inverse transform on the viewer rig, preserving all original world-space shader coordinates and physics. A full terrain patch replaces the small camera-following tile during XR.

The renderer uses one scene throughout AR, including surface selection, so the shared stereo camera uniforms retain a consistent layout. Before placement the world is beyond the far clip plane, while the room-space reticle and HUD remain visible. The r183 WebGL compatibility layer restores binding slots per material and handles the default/null framebuffer returned by Meta IWER. Native Quest framebuffer objects keep Three's normal framebuffer path. Intro reveal completes before entry, and snow's offscreen render is disabled in the XR entry.

VR starts at the driver's seat with a dashboard and steering wheel. The chase camera follows behind the vehicle. Y switches views without restarting the session; view turns preserve the selected seat position, and physical head movement remains one-to-one in metres.

Capability checks run in the browser. An unsupported browser shows a Quest instruction, not a nonfunctional entry button. AR may require Quest room/space setup and permission to use it. The experience runs on HTTPS and is intended for Meta Quest Browser; iPhone Safari is not assumed to support immersive WebXR.

## Verification

Run `node scripts/test-motri-xr.mjs` and `npm run build`. The build generates `/xr/index.html` from the original game shell and keeps resource URLs relative to the original root. Browser tests should cover loading, VR drive/recover/exit, AR surface acquisition/placement/scale/reposition, tracking loss, and repeated AR/VR entry. Emulator checks do not establish real-headset performance or comfort.

`scripts/test-motri-xr-browser.mjs` is an optional regression using official Meta IWER and Playwright installed outside the application. Set `MOTRI2_PLAYWRIGHT_MODULE` to Playwright's `index.mjs` and `MOTRI_XR_IWER_PATH` to IWER's `build/iwer.min.js`, then run it after building. Optional variables: `MOTRI_XR_CHROMIUM` for a browser executable and `MOTRI_XR_ARTIFACT_DIR` for screenshots. It exercises IWER's real null framebuffer, checks visible terrain pixels, resizes with sticks and both controllers, rejects placement without a surface, switches cameras while driving, and re-enters AR with only plane detection available.

References: [Three XRManager source](https://github.com/mrdoob/three.js/blob/r183/src/renderers/common/XRManager.js), [Meta mixed reality](https://developers.meta.com/vr/documentation/web/webxr-mixed-reality/), [WebXR hit testing](https://immersive-web.github.io/hit-test/).
