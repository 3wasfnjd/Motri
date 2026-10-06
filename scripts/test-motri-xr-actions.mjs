import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import gsapPackage from 'gsap'
import { XRActions } from '../sources/xr/Actions.js'
const gsap = gsapPackage.gsap || gsapPackage
// Drive the actual GSAP engine with window RAF unavailable. This reproduces
// headset-only stalls in explosions, respawn callbacks and race countdowns.
const context = vm.createContext({ Number, Math })
const module = new vm.SourceTextModule(readFileSync('sources/xr/AnimationClock.js', 'utf8'), { context })
await module.link(() => new vm.SyntheticModule(['default'], function() { this.setExport('default', gsap) }, { context }))
await module.evaluate()
const clock = new module.namespace.AnimationClock()
gsap.ticker.sleep()
const target = { progress: 0 }
let completed = 0
gsap.to(target, { progress: 1, duration: .3, onComplete: () => completed++ })
clock.update(1000)
for(let frame = 1; frame <= 30; frame++) clock.update(1000 + frame * 16)
assert.equal(completed, 1)
assert.equal(target.progress, 1)
const time = clock.time
clock.update(undefined); clock.update(NaN); clock.update(1480)
assert.equal(clock.time, time)
clock.update(160000)
assert.ok(clock.time - time < .051, 'Resume must not fast-forward delayed gameplay')
gsap.ticker.sleep()
const calls = []
const game = { inputs: {
    actions: new Map(['interact','suspensions','boost','honk'].map(name => [name, { keys: [] }])),
    start: key => calls.push(['start', key]), end: key => calls.push(['end', key])
} }
const actions = new XRActions(game)
actions.set('interact', true); actions.set('interact', true); actions.set('boost', true); actions.release(); actions.release()
assert.deepEqual(calls, [['start','XR.interact'], ['start','XR.boost'], ['end','XR.interact'], ['end','XR.boost']])
assert.equal(actions.active.size, 0)
console.log('XR actions and real GSAP clock passed: activity events, releases, paused RAF and resume timing.')
