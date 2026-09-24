// One deterministic surface shared by rendering, collisions and the map.
export const DUNES = Object.freeze({minX:30,maxX:94,minZ:25,maxZ:94,cell:.75});
export const smooth = (a,b,v) => {const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const ridges = [
  [78.5,37,2.9,7.8,8.2],
  [81,50.5,4.0,8.5,9.2],
  [79.5,65,4.2,9.3,9.5],
  [76,75,2.5,8,7],
  [57,67,3.7,11,9],
  [43,77,3.0,10,8],
  [61,83,3.6,12,7.5],
  [82,82,3.2,9,8]
];
export function duneWeight(x,z,protectedZones=[]) {
  // Preserve the east-side entry and widen across the entire lower-right corner.
  const east=1-smooth(.66,1,Math.hypot((x-77.5)/16,(z-56)/29));
  const southRadius=(Math.abs((x-62)/32)**4+Math.abs((z-70)/24)**4)**.25;
  const south=1-smooth(.72,1,southRadius);
  let w=1-(1-east)*(1-south);
  if(!w)return 0;
  // Keep the existing inland lagoon open, not a rectangular sand cover.
  w*=smooth(1,1.27,Math.hypot((x-65.5)/7.2,(z-43)/16.5));
  for(const p of protectedZones)w*=smooth(p.radius+1.5,p.radius+6,Math.hypot(x-p.x,z-p.z));
  return w;
}
export function duneHeight(x,z,base,protectedZones=[]) {
  const weight=duneWeight(x,z,protectedZones);
  if(!weight)return base;
  let sum=0;
  for(const [cx,cz,h,sx,sz] of ridges){
    const v=(z-cz)/sz;
    const cross=(x-cx+.95*v*v)/sx;
    const u=cross*(cross>0?1.3:.85);
    const ridge=h*Math.exp(-2.1*u*u-1.5*v*v*v*v);
    sum+=ridge**4;
  }
  // Raise the shallow outer coast into a sand peninsula; fade to the old coast.
  return base+weight*(Math.max(0,-base)+.12+sum**.25);
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
    positions[i*3]=x;positions[i*3+1]=duneHeight(x,z,base,zones)+(w>0?.009:0);positions[i*3+2]=z;
    coverage[i]=w;
  }
  // Slope-limit only the added sand; do not alter original terrain or service pads.
  for(let pass=0;pass<10;pass++){
    for(const direction of [1,-1])for(let k=0;k<count;k++){
      const i=direction>0?k:count-1-k;
      if(coverage[i]<=.002)continue;
      const x=i%width,z=Math.floor(i/width);
      let y=positions[i*3+1];
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){
        if(x+dx<0||x+dx>nx||z+dz<0||z+dz>nz)continue;
        const n=i+dx+dz*width;
        const distance=Math.hypot(dx*(b.maxX-b.minX)/nx,dz*(b.maxZ-b.minZ)/nz);
        y=Math.min(y,positions[n*3+1]+distance*.50);
      }
      positions[i*3+1]=Math.max(baseAt(positions[i*3],positions[i*3+2]),y);
    }
  }
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const a=z*width+x,b=a+1,c=a+width,d=c+1;
    // Do not add hidden collision sheets outside the sand.
    if(Math.min(coverage[a],coverage[b],coverage[c])>.002)indices.push(a,c,b);
    if(Math.min(coverage[b],coverage[c],coverage[d])>.002)indices.push(b,c,d);
  }
  return {positions,coverage,indices:new Uint32Array(indices),width,depth,nx,nz};
}
