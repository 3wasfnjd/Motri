// Geometry adapter only: the host game owns physics, timing and suspension.
import { CanvasTexture, SRGBColorSpace } from 'three';

export function createH9Adapter(gltfScene) {
  const root = gltfScene.getObjectByName('H9_Root');
  if (!root) throw new Error('H9_Root is missing');
  const required = name => {
    const value = root.getObjectByName(name);
    if (!value) throw new Error(`H9 part is missing: ${name}`);
    return value;
  };
  const corners = ['FL', 'FR', 'RL', 'RR'];
  const wheels = Object.fromEntries(corners.map(c => [c, required(`Wheel_${c}`)]));
  const steering = { FL: required('Wheel_FL_SteeringPivot'), FR: required('Wheel_FR_SteeringPivot') };
  const carriers = { ...wheels, ...steering };
  const restingY = Object.fromEntries(corners.map(c => [c, carriers[c].position.y]));
  const plates = ['Front', 'Rear'].map(c => required(`LicensePlateSurface_${c}`));
  let bodyPaint;
  // Clone once per vehicle instance and share the clone over all painted panels.
  root.traverse(o => {
    if (!o.isMesh) return;
    const replace = material => {
      if (material.name !== 'Mat_Body_MatteGrey') return material;
      bodyPaint ||= material.clone();
      return bodyPaint;
    };
    o.material = Array.isArray(o.material) ? o.material.map(replace) : replace(o.material);
  });
  if (!bodyPaint) throw new Error('Mat_Body_MatteGrey is missing');
  for (const plate of plates) plate.material = plate.material.clone();
  let ownedTextures = [];
  const radius = 0.42432; // metres; all four road wheels have the same radius

  return {
    root, wheels, steering, plates, radius,
    setBodyColor(cssColor) { bodyPaint.color.set(cssColor); },
    // +Z forward, +Y up, +X vehicle left. +Y steering is a left turn.
    setSteeringRadians(left, right = left) {
      steering.FL.rotation.y = left;
      steering.FR.rotation.y = right;
    },
    // Positive travelled distance in +Z gives positive local-X rolling.
    setTravelMeters(distance) {
      const angle = (distance / radius) % (Math.PI * 2);
      for (const wheel of Object.values(wheels)) wheel.rotation.x = angle;
    },
    setWheelVerticalOffset(corner, offsetMetres) {
      if (!(corner in carriers)) throw new Error(`Unknown wheel: ${corner}`);
      carriers[corner].position.y = restingY[corner] + offsetMetres;
    },
    // Use blank or dynamically drawn canvases, ideally 1024 x 226 pixels.
    // Supply the same canvas twice to use the same plate at both ends.
    setPlateCanvases(frontCanvas, rearCanvas = frontCanvas) {
      for (const texture of ownedTextures) texture.dispose();
      ownedTextures = [frontCanvas, rearCanvas].map(canvas => {
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = false; // glTF UV convention; preserve Arabic/English orientation
        return texture;
      });
      plates.forEach((plate, i) => {
        plate.material.map = ownedTextures[i];
        plate.material.color.set(0xffffff);
        plate.material.needsUpdate = true;
      });
    },
    refreshPlateTextures() {
      for (const texture of ownedTextures) texture.needsUpdate = true;
    },
    // Releases only resources cloned/created by this adapter, not shared GLB geometry.
    dispose() {
      for (const texture of ownedTextures) texture.dispose();
      bodyPaint.dispose();
      for (const plate of plates) plate.material.dispose();
    }
  };
}
