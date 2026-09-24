import {Vector3, Quaternion} from 'three';

/** Configure a loaded GLTF scene. This helper does not create physics bodies. */
export function configureRestHouse(scene, {position=[0,0,0], yaw=0, scale=1, shadows=false}={}) {
  if (!(Number.isFinite(scale) && scale>0)) throw new Error('Use a positive uniform scale.');
  const root=scene.getObjectByName('RestHouse_Root');
  if (!root) throw new Error('RestHouse_Root is missing.');
  scene.position.fromArray(position);scene.rotation.set(0,yaw,0);scene.scale.setScalar(scale);
  const colliders=JSON.parse(root.userData.collision_boxes_json);
  const route=JSON.parse(root.userData.suggested_route_glTF);
  scene.traverse(o=>{if(o.isMesh){o.castShadow=shadows;o.receiveShadow=shadows;}});
  scene.updateMatrixWorld(true);
  function worldPoint(p) {return root.localToWorld(new Vector3().fromArray(p));}
  function getColliders() {
    scene.updateMatrixWorld(true);
    const s=root.getWorldScale(new Vector3());
    if(Math.max(s.x,s.y,s.z)-Math.min(s.x,s.y,s.z)>1e-6) throw new Error('Nonuniform parent scale is unsupported.');
    const base=root.getWorldQuaternion(new Quaternion());
    return colliders.map(c=>({
      name:c.name,shape:c.shape,
      center:worldPoint(c.center).toArray(),
      size:c.size.map(v=>v*s.x),
      quaternion:base.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),c.rotationY)).toArray()
    }));
  }
  return {
    root,
    gateLeft:root.getObjectByName('RH_Gate_Left'),
    gateRight:root.getObjectByName('RH_Gate_Right'),
    getSpawn(){scene.updateMatrixWorld(true);return root.getObjectByName('RH_CarSpawn').getWorldPosition(new Vector3());},
    getClearanceRoute(){scene.updateMatrixWorld(true);return route.map(worldPoint);},
    getColliders,
    getGroundAreas(){
      scene.updateMatrixWorld(true);
      return [
        {name:'site',corners:[[-14.8,0,0],[25.2,0,0],[25.2,0,48.8],[-14.8,0,48.8]].map(p=>worldPoint(p).toArray())},
        {name:'entry_apron',corners:[[-3.4,0,-6.4],[3.4,0,-6.4],[3.4,0,0],[-3.4,0,0]].map(p=>worldPoint(p).toArray())}
      ];
    }
  };
}
