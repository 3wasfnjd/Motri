import assert from 'node:assert/strict'
import fs from 'node:fs'
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js'
import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js'
import { uniform } from 'three/src/nodes/TSL.js'
import { Vector3 } from 'three/src/Three.Core.js'

// Use the same source-level TSL singleton as the headless builders.
const source = fs.readFileSync(new URL('../sources/Game/Materials/VehicleUnderglowNode.js', import.meta.url), 'utf8')
    .replace("'three/webgpu'", JSON.stringify(import.meta.resolve('three/src/Three.Core.js')))
    .replace("'three/tsl'", JSON.stringify(import.meta.resolve('three/src/nodes/TSL.js')))
const { vehicleUnderglowNode } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
for(const Builder of [WGSLNodeBuilder, GLSLNodeBuilder])
{
    const builder = new Builder(null, { backend: { isWebGPUBackend: Builder === WGSLNodeBuilder } })
    builder.shaderStage = 'fragment'
    const flow = builder.flowStagesNode(vehicleUnderglowNode(uniform(new Vector3()), uniform(new Vector3(0,1,0))), 'vec3')
    assert(flow.code.includes('smoothstep'))
    assert(flow.code.includes('if'))
    assert(!/NaN|undefined/.test(flow.code))
    console.log(Builder.name, 'neon shader generated successfully')
}
