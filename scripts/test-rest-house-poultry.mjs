// Run with node scripts/test-rest-house-poultry.mjs (uses the shipped collision metadata).
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {RestHousePoultryMotion} from '../sources/Game/World/RestHousePoultryMotion.js'
const bytes=fs.readFileSync(new URL('../static/rest-house/rest-house.glb', import.meta.url))
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)))
const shapes=JSON.parse(gltf.nodes.find(n=>n.name==='RestHouse_Root').extras.collision_boxes_json)
const seeded=(s=90213)=>()=>{s=(Math.imul(s,1664525)+1013904223)|0;return(s>>>0)/4294967296}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
function clear(m){
 for(let i=0;i<m.birds.length;i++){
  const b=m.birds[i]
  assert(m.staticFree(b.x,b.z,b.radius),b.name+' intersects a static obstacle')
  assert([b.x,b.z,b.yaw,b.speed,b.phase].every(Number.isFinite))
  for(let j=i+1;j<m.birds.length;j++)assert(dist(b,m.birds[j])>=b.radius+m.birds[j].radius+.024999,'Overlapping birds')
 }
}
const report=[]
for(let seed=0;seed<8;seed++){
 const m=new RestHousePoultryMotion(shapes,.58,seeded(90213+seed))
 const [x0,x1,z0,z1]=m.bounds,cx=(x0+x1)/2,cz=(z0+z1)/2
 const escaped=new Set(),sides=new Set()
 for(let f=0;f<450;f++){
  const angle=seed*Math.PI/4+Math.sin(f/60)*.5
  const car={x:cx+Math.sin(angle)*1.3,z:cz+Math.cos(angle)*.6,vx:0,vz:0}
  m.update(1/30,car);clear(m)
  for(const [i,b] of m.birds.entries()){
   if(!m.inGarden(b.x,b.z))escaped.add(i)
   if(b.x<x0)sides.add('west');if(b.x>x1)sides.add('east');if(b.z<z0)sides.add('south');if(b.z>z1)sides.add('north')
  }
  if(f>360)for(const i of escaped)assert.notEqual(m.birds[i].state,'return','Must not return towards the parked car')
 }
 let seconds=0,allHome=false
 for(let f=0;f<3600;f++){
  m.update(1/30);clear(m)
  if(m.birds.every(b=>m.inGarden(b.x,b.z,b.radius)&&!['flee','return','wait'].includes(b.state))){seconds=f/30;allHome=true;break}
 }
 const summary={seed,escaped:escaped.size,sides:[...sides],allHome,seconds}
 report.push(summary);console.log(JSON.stringify(summary))
 assert(escaped.size>=4,'Flock must leave the old dirt rectangle')
 assert(allHome,'Entire flock must return after the car leaves')
 for(let f=0;f<900;f++){m.update(1/30);clear(m);assert(m.birds.every(b=>m.inGarden(b.x,b.z,b.radius)),'Calm birds stay home')}
}
const allSides=new Set(report.flatMap(r=>r.sides))
assert.equal(allSides.size,4,'Open escape routes exist on all sides of the dirt area')
console.log('Escape and return passed, all four sides used')

// Chase birds into the wider courtyard and interrupt them while returning.
let times=[],longestTrail=0,maxUpdate=0,totalMs=0,frames=0
for(let direction=0;direction<4;direction++){
 const m=new RestHousePoultryMotion(shapes,.58,seeded(97000+direction)),angle=direction*Math.PI/2
 for(let f=0;f<600;f++){
  const b=m.birds[direction], car={x:b.x+Math.sin(angle)*2,z:b.z+Math.cos(angle)*2,vx:0,vz:0}
  m.update(1/30,car)
  for(const b of m.birds){assert(m.staticFree(b.x,b.z,b.radius));longestTrail=Math.max(longestTrail,b.trail.length)}
 }
 // Return trips are interrupted immediately if the car approaches again.
 for(let f=0;f<120;f++)m.update(1/30)
 const returning=m.birds.find(b=>b.state==='return')
 assert(returning,'Chased flock begins returning')
 m.update(1/30,{x:returning.x-1.5,z:returning.z,vx:0,vz:0})
 assert.equal(returning.state,'flee')
 let home=false
 for(let f=0;f<5400;f++){
  const start=performance.now();m.update(1/30);const duration=performance.now()-start
  maxUpdate=Math.max(maxUpdate,duration);totalMs+=duration;frames++
  for(let i=0;i<6;i++){
   const b=m.birds[i];assert(m.staticFree(b.x,b.z,b.radius));longestTrail=Math.max(longestTrail,b.trail.length)
   for(let j=i+1;j<6;j++)assert(Math.hypot(b.x-m.birds[j].x,b.z-m.birds[j].z)>=b.radius+m.birds[j].radius+.024999)
  }
  if(!m.needsReturn()){home=true;times.push(f/30);break}
 }
 if(!home)console.log(m.birds.map(b=>({name:b.name,state:b.state,x:b.x,z:b.z,route:b.route,trail:b.trail})))
 assert(home,'Chased birds must navigate home from the wider compound')
}
console.log({chaseDirections:4,reinterruption:'passed',returnSeconds:times,longestTrail,meanUpdateMs:totalMs/frames,maxUpdateMs:maxUpdate})
