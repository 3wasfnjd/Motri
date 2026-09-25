import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Body skin for the existing Simon/H9 vehicle. Chassis-local +X is forward.
// The wheel centres, chassis transform, lights and collision shape stay upstream.
export function buildPickupVehicleBody(paintMaterial, detailMaterial, style = 'shas')
{
    const datsun = style === 'datsun'
    const name = datsun ? 'Datsun' : 'Shas'
    const pieces = { paint: [], detail: [] }
    const palette = datsun ? { trim: '#34413e', glass: '#28454b', metal: '#b2b8aa',
        stripe: '#95493f', stripeLight: '#b46a4e', bed: '#56605a', edge: '#e1ded3' } : { trim: '#27312e', glass: '#20373d', metal: '#a8b1a6',
        stripe: '#854d40', stripeLight: '#bc815e', bed: '#847c60', edge: '#dfcfaa' }
    const add = (source, role, position = [0, 0, 0], rotation = [0, 0, 0], tint = palette.trim) =>
    {
        const geometry = source.index ? source.toNonIndexed() : source.clone()
        source.dispose()
        for(const name of Object.keys(geometry.attributes))
            if(!['position', 'normal'].includes(name)) geometry.deleteAttribute(name)
        geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1)))
        if(role === 'detail')
        {
            const color = new THREE.Color(tint)
            const values = new Float32Array(geometry.attributes.position.count * 3)
            for(let i = 0; i < values.length; i += 3) values.set([color.r, color.g, color.b], i)
            geometry.setAttribute('color', new THREE.BufferAttribute(values, 3))
        }
        pieces[role].push(geometry)
    }
    const prism = (points, depth, role, position = [0, 0, 0], bevel = .008, tint, rotation = [0, 0, 0]) =>
    {
        const shape = new THREE.Shape(points.map(p => new THREE.Vector2(...p)))
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bevel,
            bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
            bevelSegments: 1, steps: 1, curveSegments: 1 })
        geometry.translate(0, 0, -depth / 2 + bevel)
        add(geometry, role, position, rotation, tint)
    }
    const box = (position, size, role = 'paint', tint, bevel = .008, rotation) =>
    {
        const [x, y, z] = size
        bevel = Math.min(bevel, x * .2, y * .2, z * .2)
        prism([[-x/2+bevel,-y/2+bevel],[x/2-bevel,-y/2+bevel],
            [x/2-bevel,y/2-bevel],[-x/2+bevel,y/2-bevel]], z, role, position, bevel, tint, rotation)
    }
    const rod = (a, b, radius, role = 'detail', tint = palette.trim) =>
    {
        const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b)
        const delta = end.clone().sub(start)
        const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 6)
        geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()))
        add(geometry, role, start.add(end).multiplyScalar(.5).toArray(), [0, 0, 0], tint)
    }
    const panel = (points, tint) =>
    {
        const geometry = new THREE.BufferGeometry()
        // Caller supplies an outward-facing polygon; both faces are unnecessary.
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([
            ...points[0], ...points[2], ...points[1], ...points[0], ...points[3], ...points[2]
        ], 3))
        geometry.computeVertexNormals()
        add(geometry, 'detail', [0, 0, 0], [0, 0, 0], tint)
    }

    // Lower cab/bonnet retain the same arch clearances as the H9 body skin.
    prism([[-.52,-.35],[.60,-.35],[.68,-.22],[.76,-.185],[1.04,-.185],
        [1.12,-.22],[1.20,-.35],[1.416,-.35],[1.416,.12],[1.34,.165],[-.52,.165]],
    1.324, 'paint', [0,0,0], .023)
    box([.99,.184,0], [.88,.092,1.26], 'paint', undefined, .024)
    if(!datsun) box([.96,.237,0], [.67,.024,.85], 'paint', undefined, .006)
    else for(const sign of [-1,1]) box([.99,.233,sign*.48],[.71,.009,.025],'paint',undefined,.002)

    // Single cab, upright back, dark windows and a compact open pickup bed.
    prism([[-.46,.14],[.565,.14],[.32,.55],[-.44,.55]], 1.23, 'paint', [0,0,0], .023)
    box([-.065,.565,0], [.83,.035,1.245], 'paint', undefined, .008)
    for(const sign of [-1,1])
    {
        const outline = [[-.397,.211],[.471,.211],[.277,.504],[-.380,.504]]
        const glass = [[-.36,.244],[.402,.244],[.254,.469],[-.348,.469]]
        prism(outline,.011,'detail',[0,0,sign*.617],.004,palette.trim)
        prism(glass,.007,'detail',[0,0,sign*.626],.002,palette.glass)
        if(!datsun) rod([.289,.244,sign*.632],[.20,.472,sign*.632],.009,'detail',palette.trim)
        box([-.297,.111,sign*.681],[.128,.032,.025],'detail',datsun ? palette.trim : palette.metal,.005)
        rod([-.43,-.285,sign*.665],[-.419,.173,sign*.665],.003)
        rod([.54,-.273,sign*.665],[.54,.159,sign*.665],.003)
        box([.055,-.306,sign*.669],[.90,.052,.018],'paint')

        if(datsun)
        {
            // The familiar straight red Datsun side graphic, not the Shas zigzag.
            box([.05,.061,sign*.671],[.94,.073,.010],'detail',palette.stripe,.002)
            box([.05,.007,sign*.673],[.94,.017,.010],'detail',palette.stripeLight,.001)
            box([.95,.104,sign*.668],[.73,.031,.009],'detail',palette.stripe,.001)
        }
        else
        {
            // Burgundy LC70 side stripes remain large enough to read in play.
            prism([[-.41,-.045],[.16,-.045],[.40,.075],[.55,.075],[.55,.113],[.38,.113],
                [.14,-.005],[-.41,-.005]], .008,'detail',[0,0,sign*.671],0,palette.stripe)
            prism([[-.41,-.075],[.17,-.075],[.40,.043],[.55,.043],[.55,.056],[.394,.056],
                [.165,-.061],[-.41,-.061]], .008,'detail',[0,0,sign*.673],0,palette.stripeLight)
        }
    }
    const wx = y => .565 - (y - .14) * (.245 / .41) + .037
    panel([[wx(.195),.195,.556],[wx(.51),.51,.556],[wx(.51),.51,-.556],[wx(.195),.195,-.556]],palette.trim)
    panel([[wx(.217)+.004,.217,.526],[wx(.489)+.004,.489,.526],
        [wx(.489)+.004,.489,-.526],[wx(.217)+.004,.217,-.526]],palette.glass)
    for(const sign of [-1,1]) rod([wx(.224)+.012,.224,sign*.04],[wx(.232)+.012,.232,sign*.43],.005)
    const rx = y => -.46 + (y - .14) * (.02 / .41) - .026
    panel([[rx(.21),.21,-.547],[rx(.51),.51,-.547],[rx(.51),.51,.547],[rx(.21),.21,.547]],palette.trim)
    panel([[rx(.238)-.004,.238,-.506],[rx(.483)-.004,.483,-.506],
        [rx(.483)-.004,.483,.506],[rx(.238)-.004,.238,.506]],palette.glass)
    rod([rx(.24)-.009,.24,0],[rx(.481)-.009,.481,0],.006,'detail',palette.metal)

    // The existing stop lamp stays on a supported headboard behind the cab.
    for(const sign of [-1,1]) rod([-.586,.128,sign*.543],[-.586,.607,sign*.543],.017,'paint')
    rod([-.586,.598,-.55],[-.586,.598,.55],.018,'paint')
    box([-.60,.60,0],[.037,.053,.575],'paint')
    box([-.923,-.192,0],[.80,.065,1.19],'detail',palette.bed)
    for(let z=-.48;z<=.49;z+=.16) box([-.917,-.154,z],[.67,.017,.021],'detail',palette.trim,.002)
    for(const sign of [-1,1])
    {
        // Squared rear arch cutouts use the original axle x=-0.90.
        prism([[-1.265,-.35],[-1.20,-.35],[-1.12,-.22],[-1.04,-.185],[-.76,-.185],
            [-.68,-.22],[-.60,-.35],[-.52,-.35],[-.52,.152],[-1.265,.152]],
        .082,'paint',[0,0,sign*.626],.01)
        box([-.906,.167,sign*.629],[.83,.048,.106],'paint')
        box([-.88,-.101,sign*.503],[.47,.118,.205],'detail',palette.bed)
        box([-.895,.084,sign*.674],[.678,.048,.009],'detail',palette.stripe,.002)
        box([-.895,.042,sign*.676],[.678,.014,.009],'detail',palette.stripeLight,.001)
        // Existing rear lamp surfaces lie at x=-1.298, y=.084..178.
        box([-1.274,.123,sign*.528],[.039,.155,.216],'detail',palette.trim)
        box([-1.295,-.125,sign*.507],[.02,.071,.097],'detail',palette.metal,.003)
        for(const cx of [-.9,.9])
        {
            const points=[[cx-.30,-.35],[cx-.25,-.24],[cx-.17,-.20],
                [cx+.17,-.20],[cx+.25,-.24],[cx+.30,-.35]]
            for(let i=0;i<points.length-1;i++) rod([...points[i],sign*.674],[...points[i+1],sign*.674],.013,'paint')
        }
    }
    box([-1.340,-.055,0],[.120,.390,.921],'paint',undefined,.012)
    box([-1.401,-.038,0],[.0008,.210,.818],'detail',palette.edge,.0001)
    box([-1.3985,.110,0],[.005,.031,.139],'detail',palette.trim,.001)

    // Only non-luminous front trim; all upstream headlights remain uncovered.
    box([1.458,.021,0],[.049,.282,1.21],'detail',palette.trim,.011)
    box([1.49,.135,0],[.022,.082,.88],'detail',palette.trim,.003)
    if(datsun)
    {
        for(const y of [.071,.180]) box([1.49,y,0],[.017,.016,1.16],'detail',palette.metal,.002)
        for(const sign of [-1,1]) box([1.475,-.019,sign*.618],[.018,.219,.014],'detail',palette.metal,.002)
    }
    box([1.49,-.154,0],[.02,.031,1.16],'detail',palette.metal,.004)
    for(const sign of [-1,1]) box([1.477,-.015,sign*.631],[.021,.268,.045],'paint')
    const glyphs = {
        N: [[[0,0],[0,1],[.68,0],[.68,1]]],
        I: [[[0,1],[.68,1]],[[.34,1],[.34,0]],[[0,0],[.68,0]]],
        S: [[[.68,1],[0,1],[0,.5],[.68,.5],[.68,0],[0,0]]],
        T: [[[0,1],[.68,1]],[[.34,1],[.34,0]]],
        O: [[[.13,0],[.55,0],[.68,.16],[.68,.84],[.55,1],[.13,1],[0,.84],[0,.16],[.13,0]]],
        Y: [[[0,1],[.34,.51],[.68,1]],[[.34,.51],[.34,0]]],
        A: [[[0,0],[.34,1],[.68,0]],[[.14,.41],[.54,.41]]]
    }
    const label = (face, x, y, height, advance, tint = palette.metal) =>
    {
        for(const [i,ch] of [...(datsun ? 'NISSAN' : 'TOYOTA')].entries()) for(const stroke of glyphs[ch])
            for(let p=0;p<stroke.length-1;p++)
            {
                const a=stroke[p],b=stroke[p+1],offset=-2.83*advance+i*advance
                const start=new THREE.Vector3(x,y+a[1]*height,face*(offset+a[0]*advance))
                const end=new THREE.Vector3(x,y+b[1]*height,face*(offset+b[0]*advance))
                const delta=end.clone().sub(start)
                const across=new THREE.Vector3(0,-delta.z,delta.y).normalize().multiplyScalar(height*.09)
                const points=[start.clone().add(across),end.clone().add(across),end.clone().sub(across),start.clone().sub(across)]
                if(face>0)points.reverse()
                panel(points.map(point=>point.toArray()),tint)
            }
    }
    label(-1,1.506,.092,.064,.093)
    label(1,-1.4024,-.073,.069,.105,palette.stripe)

    const group = new THREE.Group()
    group.name = `${name}_BodyStyle`
    group.userData = { bodyOnly: true, forward: '+X', paintedColor: datsun ? '#eeeadd' : '#c9b58d' }
    for(const [role, geometries] of Object.entries(pieces))
    {
        const geometry = mergeGeometries(geometries)
        for(const part of geometries) part.dispose()
        geometry.computeBoundingBox(); geometry.computeBoundingSphere()
        const mesh = new THREE.Mesh(geometry, role === 'paint' ? paintMaterial : detailMaterial)
        mesh.name = `${name}_${role === 'paint' ? 'BodyPaint' : 'BodyDetails'}`
        mesh.castShadow = mesh.receiveShadow = true
        group.add(mesh)
    }
    return group
}

