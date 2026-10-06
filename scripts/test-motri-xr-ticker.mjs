import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
// Exercise the actual ticker with only its unrelated construction dependencies
// stubbed. XR exit calls the animation loop with an undefined timestamp.
const context = vm.createContext({ console, Number, Math })
const source = new vm.SourceTextModule(readFileSync('sources/Game/Ticker.js', 'utf8'), { context })
let ticks = 0
await source.link(async specifier => {
    const values = specifier === 'three/tsl' ? { uniform: value => ({ value }) }
        : specifier.endsWith('/Events.js') ? { Events: class { trigger() { ticks++ } } }
        : specifier.endsWith('/Game.js') ? { Game: { getInstance: () => ({}) } }
        : { default: {} }
    return new vm.SyntheticModule(Object.keys(values), function() { for(const [key, value] of Object.entries(values)) this.setExport(key, value) }, { context })
})
await source.evaluate()
const ticker = new source.namespace.Ticker()
ticker.update(1000)
const total = ticker.elapsedScaled
for(const time of [undefined, NaN, Infinity, 1000]) ticker.update(time)
assert.equal(ticks, 1)
assert.equal(ticker.elapsedScaled, total)
ticker.update(500) // a different animation clock must rebase, not step backward
assert.equal(ticks, 1)
ticker.update(516)
assert.equal(ticks, 2)
assert.ok(ticker.delta > 0 && Number.isFinite(ticker.deltaScaled))
assert.ok(Number.isFinite(ticker.elapsedScaled))
console.log('XR ticker lifecycle passed: undefined, duplicate and rebased timestamps cannot poison physics/audio.')
