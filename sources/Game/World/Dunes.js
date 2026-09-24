import * as THREE from 'three/webgpu';
import {Fn,attribute,color,mix,positionWorld,texture,vec2} from 'three/tsl';
import {Game} from '../Game.js';
import {MeshDefaultMaterial} from '../Materials/MeshDefaultMaterial.js';
import {DUNES,buildDunes,terrainSampler,duneWeight,smooth} from './DunesField.js';

export class Dunes {
  constructor() {
    this.game=Game.getInstance();
    const resources=this.game.resources;
    this.protectedZones=[];
    // Read area references before their constructors relocate the children.
    for(const area of resources.areasModel.scene.children){
      const marker=area.children.find(c=>/^refZoneBounding/i.test(c.name));
      if(marker)this.protectedZones.push({name:area.name,x:area.position.x+marker.position.x,z:area.position.z+marker.position.z,radius:marker.scale.x});
    }
    this.baseAt=terrainSampler(resources.terrainModel.scene.children[0].geometry.attributes.position.array,this.game.terrain.size);
    this.field=buildDunes(this.baseAt,this.protectedZones);
    const f=this.field;
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(f.positions,3));
    this.geometry.setAttribute('sandCoverage',new THREE.BufferAttribute(f.coverage,1));
    this.geometry.setIndex(new THREE.BufferAttribute(f.indices,1));
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();

    // Mask only the dune footprint, leaving every service pad and the lagoon clear.
    const pixels=Uint8Array.from(f.coverage,w=>Math.round(smooth(.015,.4,w)*255));
    this.mask=new THREE.DataTexture(pixels,f.width,f.depth,THREE.RedFormat);
    this.mask.minFilter=THREE.LinearFilter;this.mask.magFilter=THREE.LinearFilter;
    this.mask.generateMipmaps=false;this.mask.needsUpdate=true;
    this.game.terrain.dunesMaskNode=Fn(([p])=>texture(this.mask,p.sub(vec2(DUNES.minX,DUNES.minZ)).div(vec2(DUNES.maxX-DUNES.minX,DUNES.maxZ-DUNES.minZ))).r);

    const land=this.game.terrain.terrainNode(positionWorld.xz);
    const grain=texture(this.game.noises.perlin,positionWorld.xz.mul(.11)).r;
    const ripples=positionWorld.x.mul(9).add(positionWorld.z.mul(1.5)).add(grain.mul(5)).sin().mul(.025).add(.975);
    const sand=mix(color('#d9a65e'),color('#f4d397'),positionWorld.y.mul(.12).add(grain.mul(.16)).clamp(.1,.85)).mul(ripples);
    const material=new MeshDefaultMaterial({
      colorNode:mix(this.game.terrain.colorNode(land),sand,attribute('sandCoverage','float').smoothstep(0,.55)),
      hasWater:true,hasLightBounce:false
    });
    // Resolve coplanar contact at the blend without lifting render/collision geometry.
    material.polygonOffset=true;
    material.polygonOffsetFactor=-1;
    material.polygonOffsetUnits=-1;
    this.mesh=new THREE.Mesh(this.geometry,material);
    this.mesh.name='Motri2_Southeast_Dunes';
    this.mesh.receiveShadow=true;this.mesh.castShadow=true;
    this.game.scene.add(this.mesh);
    // Identical buffers: no shader-only displacement and no invisible hills.
    this.physical=this.game.objects.add(null,{
      type:'fixed',friction:.2,restitution:.15,
      colliders:[
        {shape:'trimesh',parameters:[f.positions,f.indices],category:'floor'},
        // Far outside the visible island: stop the car before it can fall behind
        // the safety apron and enter underneath the dune mesh.
        {shape:'cuboid',parameters:[.6,5,52],position:{x:DUNES.maxX-.4,y:0,z:78},category:'floor'},
        {shape:'cuboid',parameters:[60,5,.6],position:{x:68,y:0,z:DUNES.maxZ-.4},category:'floor'}
      ]
    }).physical;
    this.clearCoveredVegetation();
    this.entry={x:77,z:29};
    this.game.respawns.items.set('dunes',{
      name:'dunes',position:new THREE.Vector3(this.entry.x,Math.max(4,this.heightAt(this.entry.x,this.entry.z)+3),this.entry.z),rotation:-Math.PI/2
    });
  }

  heightAt(x,z) {
    const f=this.field;
    const gx=(x-DUNES.minX)/(DUNES.maxX-DUNES.minX)*f.nx,gz=(z-DUNES.minZ)/(DUNES.maxZ-DUNES.minZ)*f.nz;
    if(gx<0||gz<0||gx>f.nx||gz>f.nz)return this.baseAt(x,z);
    const ix=Math.min(f.nx-1,Math.floor(gx)),iz=Math.min(f.nz-1,Math.floor(gz)),u=gx-ix,v=gz-iz;
    const a=iz*f.width+ix,b=a+1,c=a+f.width,d=c+1,p=f.positions;
    // Same diagonal as the collision mesh, rather than bilinear height estimates.
    return u+v<=1?p[a*3+1]*(1-u-v)+p[b*3+1]*u+p[c*3+1]*v:p[b*3+1]*(1-v)+p[c*3+1]*(1-u)+p[d*3+1]*(u+v-1);
  }

  clearCoveredVegetation() {
    this.clearedVegetation=0;
    for(const key of ['bushesReferences','flowersReferencesModel','birchTreesReferencesModel','oakTreesReferencesModel','cherryTreesReferencesModel']){
      const scene=this.game.resources[key]?.scene;
      if(!scene)continue;
      for(const ref of [...scene.children]){
        const {x,z}=ref.position;
        if(duneWeight(x,z,this.protectedZones)>.16){scene.remove(ref);this.clearedVegetation++;}
      }
    }
  }

  drawMap(container,night=false) {
    if(!this.mapCanvas){
      this.mapCanvas=document.createElement('canvas');
      this.mapCanvas.width=512;this.mapCanvas.height=512;
      this.mapCanvas.className='motri2-dunes-map';
      Object.assign(this.mapCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'1'});
      container.append(this.mapCanvas);
      const player=container.querySelector('.js-player');if(player)player.style.zIndex='2';
    }
    const ctx=this.mapCanvas.getContext('2d'),image=ctx.createImageData(512,512),worldSize=this.game.terrain.size;
    for(let py=0;py<512;py++)for(let px=0;px<512;px++){
      const x=(px/512-.5)*worldSize,z=(py/512-.5)*worldSize,w=duneWeight(x,z,this.protectedZones);
      if(w<.005)continue;
      const h=this.heightAt(x,z);if(h<-.23)continue;
      const dx=(this.heightAt(x+.4,z)-this.heightAt(x-.4,z))/.8;
      const dz=(this.heightAt(x,z+.4)-this.heightAt(x,z-.4))/.8;
      const light=Math.max(.58,Math.min(1.12,(.92+dx*.36+dz*.26)))*(night?.48:1);
      const i=(py*512+px)*4;
      image.data[i]=Math.min(255,242*light);image.data[i+1]=Math.min(255,199*light);image.data[i+2]=Math.min(255,127*light);
      image.data[i+3]=Math.round(255*smooth(.005,.22,w)*smooth(-.23,.08,h));
    }
    ctx.putImageData(image,0,0);
  }
}
