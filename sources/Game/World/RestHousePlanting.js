import * as THREE from 'three/webgpu'

// Add instances before the world's oak Trees constructor builds its shared batches.
export function plantRestHouseTrees(root, shapes, referenceScene) {
    for(const name of ['RH_TreeTrunks', 'RH_Foliage']) {
        const mesh = root.getObjectByName(name)
        if(mesh) mesh.removeFromParent()
    }
    const scale = root.getWorldScale(new THREE.Vector3()).x
    const trees = shapes.filter(s => s.name === 'tree_trunk')
    trees.forEach((shape, i) => {
        const ref = new THREE.Object3D()
        ref.name = `RestHouse_Oak_${i}`
        ref.position.copy(root.localToWorld(new THREE.Vector3(shape.center[0], .02, shape.center[2])))
        // Match the reference garden tree heights; oak source crown is 8.3 m high.
        const size = shape.size[1] * scale / .8 / 8.3
        ref.scale.setScalar(size)
        ref.rotation.y = i * 2.399963
        ref.userData.restHouseTreeScale = size
        ref.userData.noCollision = true
        referenceScene.add(ref)
        ref.updateMatrixWorld(true)
    })
    return shapes.filter(s => s.name !== 'tree_trunk')
}
