// Run with: node --experimental-vm-modules scripts/test-mobile-boost.mjs
// Exercise the actual Inputs, Pointer, Nipple and MobileBoostButton modules.
// Only the browser DOM, game singleton, gamepad, wheel and GSAP are stubbed;
// this test does not claim to render or run vehicle physics.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three/webgpu'
import * as TSL from 'three/tsl'

class ClassList extends Set { add(...names){for(const n of names)super.add(n)} remove(...names){for(const n of names)super.delete(n)} }
class Element extends EventTarget
{
    constructor(){super();this.classList=new ClassList();this.attrs=new Map();this.captures=new Set();this.hidden=false}
    setAttribute(k,v){this.attrs.set(k,v)}
    setPointerCapture(id){this.captures.add(id)}
    hasPointerCapture(id){return this.captures.has(id)}
    releasePointerCapture(id){this.captures.delete(id)}
    matches(){return false}
}
const button=new Element(),canvas=new Element(),rootElement=new Element(),touchButtons=new Element(),overlay=new Element()
touchButtons.querySelector=()=>overlay;touchButtons.querySelectorAll=()=>[]
const win=new EventTarget(),doc=new EventTarget()
doc.hidden=false;doc.documentElement=rootElement;doc.activeElement=rootElement
doc.querySelector=selector=>({'.js-mobile-boost':button,'.js-touch-buttons':touchButtons})[selector]
const camera=new THREE.PerspectiveCamera(50,393/852,.1,100)
camera.position.set(0,12,8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true)
const game={scene:new THREE.Scene(),canvasElement:canvas,viewport:{width:393,height:852},view:{defaultCamera:camera},ticker:{events:{on(){}}}}
const context=vm.createContext({window:win,document:doc,console,Event,EventTarget,AbortController,
    addEventListener:win.addEventListener.bind(win),setTimeout,clearTimeout})
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const modules=new Map()
const synthetic=(key,exports)=>
{
    if(!modules.has(key))modules.set(key,new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v)},{context,identifier:key}))
    return modules.get(key)
}
async function linker(specifier,parent)
{
    if(specifier==='three/webgpu')return synthetic(specifier,THREE)
    if(specifier==='three/tsl')return synthetic(specifier,TSL)
    if(specifier==='three/src/math/MathUtils.js')return synthetic(specifier,THREE.MathUtils)
    if(specifier==='gsap')return synthetic(specifier,{default:{to(){}}})
    const file=path.resolve(path.dirname(parent.identifier),specifier)
    if(file.endsWith('/Game/Game.js'))return synthetic(file,{Game:class{static getInstance(){return game}}})
    if(modules.has(file))return modules.get(file)
    let code
    if(file.endsWith('/Inputs/Gamepad.js'))code="import { Events } from '../Events.js'; export class Gamepad { constructor(){this.events=new Events()} update(){} }"
    else if(file.endsWith('/Inputs/Wheel.js'))code="import { Events } from '../Events.js'; export class Wheel { constructor(){this.events=new Events()} }"
    else code=fs.readFileSync(file,'utf8')
    const module=new vm.SourceTextModule(code,{context,identifier:file});modules.set(file,module)
    return module
}
const entryFile=path.join(repo,'sources/Game/Inputs/Inputs.js')
const entry=await linker('./Inputs.js',{identifier:entryFile})
await entry.link(linker);await entry.evaluate()
const {Inputs}=entry.namespace
const inputs=new Inputs([],['intro']);game.inputs=inputs
// Read the actual player action declarations instead of inventing test bindings.
const player=fs.readFileSync(path.join(repo,'sources/Game/Player.js'),'utf8')
const start=player.indexOf('this.game.inputs.addActions([')+'this.game.inputs.addActions('.length
const end=player.indexOf('\n        ])',start)+10
inputs.addActions(vm.runInContext('('+player.slice(start,end)+')',context))
const boost=()=>inputs.actions.get('boost')
const event=(target,type,data={})=>
{
    const e=new Event(type,{cancelable:true});Object.assign(e,data);target.dispatchEvent(e);return e
}
const t1={identifier:1,clientX:70,clientY:600,target:canvas}
const t2={identifier:2,clientX:349,clientY:640,target:button}
const canvasEvent=(type,all,own)=>event(canvas,type,{touches:all,targetTouches:own})
const press=(id=22)=>event(button,'pointerdown',{pointerId:id,pointerType:'touch',isPrimary:false})
const lift=(id=22)=>event(button,'pointerup',{pointerId:id,pointerType:'touch'})
const resetFilter=name=>{inputs.filters.clear();inputs.filters.add(name)}

assert(button.hidden,'hidden during introduction')
resetFilter('wandering');assert(button.hidden,'hidden with mouse/keyboard')
canvasEvent('touchstart',[t1],[t1]);inputs.update()
assert.equal(inputs.mode,Inputs.MODE_TOUCH);assert(!button.hidden);assert(inputs.nipple.active)
press();assert(boost().active);assert.equal(button.attrs.get('aria-pressed'),'true')
// TouchEvent.touches contains both fingers, targetTouches only the canvas finger.
t1.clientX=92;canvasEvent('touchmove',[t1,t2],[t1]);inputs.update()
assert.equal(inputs.pointer.touches.length,1);assert.equal(inputs.pointer.current.x,92)
assert(inputs.nipple.active,'steering continues with boost held');assert(boost().active)
lift(99);assert(boost().active,'another finger cannot release boost')
lift();assert(!boost().active);assert(inputs.nipple.active,'lifting boost does not stop steering')
canvasEvent('touchend',[],[]);inputs.update();assert(!inputs.nipple.active)

// Reverse order: start boost, then steer with the second finger.
press();canvasEvent('touchstart',[t2,t1],[t1]);inputs.update()
assert(inputs.nipple.active&&boost().active)
canvasEvent('touchend',[t2],[]);inputs.update();assert(!inputs.nipple.active);assert(boost().active)
lift();assert(!boost().active)

for(const type of ['pointercancel','lostpointercapture'])
{
    press();event(button,type,{pointerId:22});assert(!boost().active,type)
}
press();event(win,'pointerup',{pointerId:22});assert(!boost().active,'release outside')
press();event(win,'blur');assert(!boost().active,'blur')
press();event(win,'pagehide');assert(!boost().active,'page hide')
press();doc.hidden=true;event(doc,'visibilitychange');assert(!boost().active&&button.hidden)
doc.hidden=false;event(doc,'visibilitychange');assert(!button.hidden&&!boost().active)
for(const filter of ['menu','modal','intro','cinematic'])
{
    resetFilter('wandering');press();resetFilter(filter)
    assert(!boost().active&&button.hidden,filter)
    press();assert(!boost().active,'hidden control cannot reactivate boost')
}
resetFilter('racing');press();assert(boost().active);lift()
press();inputs.updateMode(Inputs.MODE_GAMEPAD);assert(button.hidden&&!boost().active)
inputs.updateMode(Inputs.MODE_TOUCH)
press();inputs.start('Keyboard.ShiftLeft');lift()
assert(boost().active&&boost().activeKeys.has('Keyboard.ShiftLeft'),'release only the touch source')
inputs.end('Keyboard.ShiftLeft');assert(!boost().active)
inputs.start('Gamepad.circle');assert(boost().active);inputs.end('Gamepad.circle')
event(button,'pointerdown',{pointerId:40,pointerType:'mouse'});assert(!boost().active,'touch only')

// Genuine two-finger canvas gestures still reach the existing pinch handling.
const t3={identifier:3,clientX:280,clientY:350,target:canvas}
canvasEvent('touchstart',[t1,t3],[t1,t3]);inputs.update();assert.equal(inputs.pointer.touches.length,2)
assert(inputs.pointer.pinch.distance>0)
canvasEvent('touchcancel',[],[]);inputs.update();assert(!inputs.pointer.isDown&&!inputs.nipple.active)
press();inputs.mobileBoost.destroy();assert(button.hidden&&!boost().active)
console.log(JSON.stringify({steeringAndBoostBothOrders:true,canvasPinchPreserved:true,
    releaseCancelCaptureBlurVisibilityFilters:true,desktopHidden:true,keyboardAndGamepadUnchanged:true}))
