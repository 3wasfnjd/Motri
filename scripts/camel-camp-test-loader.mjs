// Renderer-free tests still use the actual game modules and Rapier WASM.
// Browser-only Game/material dependencies are replaced only in this test process.
export async function resolve(specifier, context, nextResolve) {
    if(specifier === '@dimforge/rapier3d')
        return nextResolve('@dimforge/rapier3d/rapier.js', context)
    if(context.parentURL?.includes('/@dimforge/rapier3d/') && specifier.startsWith('.') && !/\.(js|wasm)$/.test(specifier)) {
        try { return await nextResolve(specifier + '.js', context) }
        catch(error) {
            if(error.code !== 'ERR_MODULE_NOT_FOUND') throw error
            return nextResolve(specifier + '/index.js', context)
        }
    }
    if(specifier.endsWith('/Game.js') || specifier.endsWith('/MeshDefaultMaterial.js'))
        return { url: new URL(specifier, context.parentURL).href, shortCircuit: true }
    return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
    if(url.endsWith('/Game.js')) return {
        format: 'module', shortCircuit: true,
        source: 'export class Game { constructor() { return globalThis.camelTestGame } static getInstance() { return globalThis.camelTestGame } }'
    }
    if(url.endsWith('/MeshDefaultMaterial.js')) return {
        format: 'module', shortCircuit: true,
        source: "import { MeshBasicMaterial } from 'three/webgpu'; export class MeshDefaultMaterial extends MeshBasicMaterial { constructor() { super({vertexColors:true}) } }"
    }
    // The upstream package is bundler-targeted ESM without a package type field.
    if(url.includes('/@dimforge/rapier3d/') && url.endsWith('.js'))
        return nextLoad(url, { ...context, format: 'module' })
    return nextLoad(url, context)
}
