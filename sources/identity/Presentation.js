// Motri2 presentation adapters. Source licenses and all gameplay bodies stay intact.
import * as THREE from 'three/webgpu';

export function presentationTexture(label = 'لوحة فارغة', {width=512,height=256,mask=false}={}) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=mask?'#000000':'#172832';ctx.fillRect(0,0,width,height);
  if(!mask){
    ctx.strokeStyle='#5b897c';ctx.lineWidth=3;ctx.strokeRect(12,12,width-24,height-24);
    ctx.fillStyle='#243e48';ctx.fillRect(24,24,width-48,Math.max(2,height*.12));
  }
  ctx.fillStyle=mask?'#ffffff':'#dfebe5';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.direction=/[\u0600-\u06ff]/u.test(label)?'rtl':'ltr';
  ctx.font=`700 ${Math.min(height*.32,width/10)}px Tahoma, Arial, sans-serif`;
  ctx.fillText(label,width/2,height/2,width-36);
  const texture=new THREE.CanvasTexture(canvas);
  texture.name='motri2-presentation';texture.colorSpace=THREE.SRGBColorSpace;
  texture.flipY=false;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  return texture;
}

// Placeholder slots preserve the original carousel lengths, navigation and progress IDs.
// They are not presented as finished projects and never request the author's screenshots.
const emptyImages=new Map();
export const placeholderImageLoader={load(path,onLoad,onProgress,onError){
  try {
    if(!String(path).includes('motri2-empty'))throw new Error('Unexpected placeholder path');
    if(!emptyImages.has(path))emptyImages.set(path,presentationTexture('مكان عرض فارغ',{width:384,height:216}));
    const texture=emptyImages.get(path);
    // Match asynchronous loader semantics: callers register their resource before callback.
    queueMicrotask(()=>onLoad(texture));return texture;
  } catch(error){if(onError)queueMicrotask(()=>onError(error));else throw error;}
}};

export function identityResourceTexture(path) {
  const clean=String(path).split('?')[0];
  if(/^career\/career[^/]+\.(?:ktx|png)$/.test(clean))
    return presentationTexture('لوحة فارغة',{width:512,height:64,mask:true});
  if(/^timeMachine\/timeMachineScreen(?:Folio|MGS)\.(?:ktx|png)$/.test(clean))
    return presentationTexture(clean.includes('MGS')?'—':'MOTRI 2',{width:256,height:144});
  return null;
}

function neutralGeometry(mesh,kind,label) {
  mesh.geometry.computeBoundingBox();
  const box=mesh.geometry.boundingBox,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  let geometry;
  if(kind==='monument'){
    geometry=new THREE.IcosahedronGeometry(1,0);geometry.computeBoundingBox();
    const dimensions=geometry.boundingBox.getSize(new THREE.Vector3());
    geometry.scale(size.x/dimensions.x,size.y/dimensions.y,size.z/dimensions.z);
  } else geometry=new THREE.BoxGeometry(Math.max(.01,size.x),Math.max(.01,size.y),Math.max(.01,size.z));
  geometry.translate(center.x,center.y,center.z);
  // Only the visual mesh changes. Children containing colliders and reference IDs are untouched.
  mesh.geometry=geometry;
  const material=new THREE.MeshStandardMaterial({color:kind==='monument'?'#839a92':'#83b69f',roughness:.8});
  material.name='motri2-neutral-'+kind+(label||'');
  if(label)material.map=presentationTexture(label,{width:128,height:128});
  mesh.material=material;mesh.userData.motri2Identity=kind;
}

export function neutralizeIdentityModel(scene) {
  let letters=0,monuments=0,banners=0;
  scene.traverse(child=>{
    if(!child.isMesh)return;
    if(/^refLettersPhysicalDynamic/i.test(child.name)){
      neutralGeometry(child,'block',String(++letters).padStart(2,'0'));
    } else if(/^refStatuePhysicalDynamic/i.test(child.name)){
      neutralGeometry(child,'monument');monuments++;
    }
    const materials=Array.isArray(child.material)?child.material:[child.material];
    for(const material of materials){
      if(material.name==='circuitBrand'){
        material.map=presentationTexture('ABODEN GAMES',{width:512,height:128});banners++;
      }
    }
  });
  scene.userData.motri2Presentation={letters,monuments,banners};
  return scene;
}
