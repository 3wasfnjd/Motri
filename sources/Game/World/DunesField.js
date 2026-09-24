// One deterministic surface shared by rendering, collisions and the map.
export const DUNES = Object.freeze({minX:8,maxX:128,minZ:4,maxZ:128,cell:1,edgeBlend:18});
const CHALLENGE_EDGE = 96;
export const smooth = (a,b,v) => {const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

// The user-marked south-east wedge: moderate dunes near the entry,
// then progressively taller ridges toward the far lower-right corner.
const boundary = [
  [4,92],
  [18,84],
  [36,73],
  [56,64],
  [72,46],
  [88,28],
  [96,20],
  [108,14],
  [116,10],
  [128,6]
];

const ridges = [
  [87,18,2.4,7.5,7.0],
  [83,33,3.0,8.5,8.0],
  [78,49,3.5,9.5,8.5],
  [70,63,3.9,10.5,8.5],
  [57,76,3.7,11.0,8.5],
  [76,78,4.5,10.5,8.5],
  [45,87,3.7,10.0,7.5],
  [67,89,4.6,11.0,7.5],
  [86,88,6.2,10.0,8.0],
  [92,93,6.8,8.5,7.0],
  [101,101,4.8,12.0,10.0],
  [109,111,4.2,11.0,9.0],
  [42,96,3.3,12.0,9.0],
  [58,108,3.8,13.0,10.0],
  [78,116,4.4,13.0,10.0],
  [104,118,4.6,12.0,10.0]
];

function leftBoundary(z) {
  if(z<=boundary[0][0])return boundary[0][1];
  for(let i=1;i<boundary.length;i++){
    const [z1,x1]=boundary[i-1],[z2,x2]=boundary[i];
    if(z<=z2){
      const t=(z-z1)/(z2-z1);
      return x1+(x2-x1)*t;
    }
  }
  return boundary.at(-1)[1];
}

export function duneWeight(x,z,protectedZones=[]) {
  if(z<DUNES.minZ||z>DUNES.maxZ||x<DUNES.minX||x>DUNES.maxX)return 0;

  const edge=leftBoundary(z);

  // The original selected wedge remains the main dune field.
  const wedge=smooth(edge-6,edge+10,x);

  // Broaden the lower half substantially so there is no single dune line with
  // empty ground behind it.
  const wideWedge=smooth(edge-22,edge-6,x)*smooth(48,68,z);

  // Continuous perimeter aprons along the south and east sides of the corner.
  // These overlap the wedge and each other, forming one connected sand area.
  const southApron=smooth(12,24,x)*smooth(66,80,z);
  const eastApron=smooth(62,76,x)*smooth(26,42,z);

  let w=1-(1-wedge)*(1-wideWedge)*(1-southApron)*(1-eastApron);
  // Return to the underlying ground on ALL four sides. Previously the east,
  // south and part of the west edge ended at full height, exposing a raised lip.
  // Smoothstep also gives a horizontal lift tangent at the perimeter.
  w*=smooth(0,DUNES.edgeBlend,x-DUNES.minX);
  w*=smooth(0,DUNES.edgeBlend,DUNES.maxX-x);
  w*=smooth(0,DUNES.edgeBlend,z-DUNES.minZ);
  w*=smooth(0,DUNES.edgeBlend,DUNES.maxZ-z);

  // Preserve actual activity/service pads inside the original island.
  for(const p of protectedZones)
    w*=smooth(p.radius+1.25,p.radius+11.25,Math.hypot(x-p.x,z-p.z));

  return w;
}

export function duneHeight(x,z,base,protectedZones=[]) {
  const weight=duneWeight(x,z,protectedZones);
  if(!weight)return base;

  const edge=leftBoundary(z);
  // Keep the intended challenge peak at the visible map corner (96,96).
  // The extra outer apron is a safety extension, not a reduction of dune height.
  const xDepth=Math.max(0,Math.min(1,(x-edge)/Math.max(1,CHALLENGE_EDGE-edge)));
  const zDepth=Math.max(0,Math.min(1,(z-DUNES.minZ)/(CHALLENGE_EDGE-DUNES.minZ)));
  const depth=Math.max(0,Math.min(1,xDepth*.42+zDepth*.58));

  // Moderate at the entry, progressively stronger toward the challenge corner.
  const amplitude=.58+.56*smooth(.18,1,depth);

  let sum=0;
  for(const [cx,cz,h,sx,sz] of ridges){
    const v=(z-cz)/sz;
    const cross=(x-cx+.95*v*v)/sx;
    const u=cross*(cross>0?1.3:.85);
    const ridge=(h*amplitude)*Math.exp(-2.1*u*u-1.5*v*v*v*v);
    sum+=ridge**4;
  }

  // Fill shallow water inside the selected red wedge so the whole marked area becomes sand.
  // Fill water depressions without adding a raised slab above dry ground.
  const fill=Math.max(0,-base);
  return base+weight*(fill+sum**.25);
}

export function terrainSampler(positions,size=192) {
  const side=Math.round(Math.sqrt(positions.length/3));
  if(side*side*3!==positions.length)throw new Error('Terrain must be a square grid');
  const data=new Float32Array(side*side);
  for(let i=0;i<positions.length;i+=3){
    const x=Math.round((positions[i]/size+.5)*(side-1));
    const z=Math.round((positions[i+2]/size+.5)*(side-1));
    data[z*side+x]=positions[i+1];
  }
  return (x,z)=>{
    const gx=Math.max(0,Math.min(side-1,(x/size+.5)*(side-1)));
    const gz=Math.max(0,Math.min(side-1,(z/size+.5)*(side-1)));
    const ix=Math.min(side-2,Math.floor(gx)),iz=Math.min(side-2,Math.floor(gz));
    const u=gx-ix,v=gz-iz,k=iz*side+ix;
    return (1-v)*((1-u)*data[k]+u*data[k+1])+v*((1-u)*data[k+side]+u*data[k+side+1]);
  };
}

export function buildDunes(baseAt,zones=[]) {
  const b=DUNES,nx=Math.ceil((b.maxX-b.minX)/b.cell),nz=Math.ceil((b.maxZ-b.minZ)/b.cell);
  const width=nx+1,depth=nz+1,count=width*depth;
  const positions=new Float32Array(count*3),coverage=new Float32Array(count),indices=[];

  for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
    const i=iz*width+ix,x=b.minX+ix/nx*(b.maxX-b.minX),z=b.minZ+iz/nz*(b.maxZ-b.minZ);
    const base=baseAt(x,z),w=duneWeight(x,z,zones);
    positions[i*3]=x;
    positions[i*3+1]=duneHeight(x,z,base,zones);
    positions[i*3+2]=z;
    coverage[i]=w;
  }

  // Keep steep challenge dunes driveable while preventing near-vertical mesh faces.
  for(let pass=0;pass<12;pass++){
    for(const direction of [1,-1])for(let k=0;k<count;k++){
      const i=direction>0?k:count-1-k;
      if(coverage[i]===0)continue;
      const x=i%width,z=Math.floor(i/width);
      let y=positions[i*3+1];
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){
        if(x+dx<0||x+dx>nx||z+dz<0||z+dz>nz)continue;
        const n=i+dx+dz*width;
        const distance=Math.hypot(dx*(b.maxX-b.minX)/nx,dz*(b.maxZ-b.minZ)/nz);
        y=Math.min(y,positions[n*3+1]+distance*.52);
      }
      positions[i*3+1]=Math.max(baseAt(positions[i*3],positions[i*3+2]),y);
    }
  }

  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const a=z*width+x,b=a+1,c=a+width,d=c+1;
    // Include the full transition triangle down to zero-coverage vertices.
    // Trimming by minimum weight used to cut the blend short of the ground.
    if(Math.max(coverage[a],coverage[b],coverage[c])>0)indices.push(a,c,b);
    if(Math.max(coverage[b],coverage[c],coverage[d])>0)indices.push(b,c,d);
  }

  return {positions,coverage,indices:new Uint32Array(indices),width,depth,nx,nz};
}
