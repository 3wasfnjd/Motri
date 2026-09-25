import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const palette = {
    paint: '#c9b58d', edge: '#dfcfaa', bed: '#9e916f', glass: '#334b50',
    rubber: '#303631', trim: '#41473e', grille: '#222d29', metal: '#a9b4a6',
    rim: '#646e61', stripe: '#854d40', stripeLight: '#ae7151',
    lamp: '#f6edcf', amber: '#d9973e', red: '#aa4136', plate: '#dbd8bd'
}

function bevelBox() {
    const shape = new THREE.Shape()
    shape.moveTo(-.47, -.47); shape.lineTo(.47, -.47); shape.lineTo(.47, .47); shape.lineTo(-.47, .47); shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: .94, bevelEnabled: true,
        bevelThickness: .03, bevelSize: .03, bevelSegments: 1, steps: 1, curveSegments: 1 })
    return g.translate(0, 0, -.47)
}

// Authored from the 2026 Toyota Saudi single-cab reference: new round lamps,
// black nose, long open tub, headboard, spare cover and maroon side graphics.
// Parked scenery, +Z front, metres. One shared vertex-colour material/draw.
export function buildCamelCampPickup(material) {
    const parts = [], cube = new THREE.BoxGeometry(1, 1, 1), bevel = bevelBox()
    const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion()
    const add = (source, position, scale, tint, rotation = [0, 0, 0]) => {
        const g = source.index ? source.toNonIndexed() : source.clone()
        for(const name of Object.keys(g.attributes)) if(!['position', 'normal'].includes(name)) g.deleteAttribute(name)
        const q = rotation.isQuaternion ? rotation : quaternion.setFromEuler(new THREE.Euler(...rotation))
        g.applyMatrix4(matrix.compose(new THREE.Vector3(...position), q, new THREE.Vector3(...scale)))
        const c = new THREE.Color(tint), values = new Float32Array(g.attributes.position.count * 3)
        for(let i = 0; i < values.length; i += 3) { values[i] = c.r; values[i + 1] = c.g; values[i + 2] = c.b }
        g.setAttribute('color', new THREE.BufferAttribute(values, 3)); parts.push(g)
    }
    const box = (p, s, c, rounded = false, r) => add(rounded ? bevel : cube, p, s, c, r)
    const rod = (a, b, radius, c, sides = 6) => {
        const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start)
        const g = new THREE.CylinderGeometry(radius, radius, delta.length(), sides)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
        add(g, start.add(end).multiplyScalar(.5).toArray(), [1, 1, 1], c, q); g.dispose()
    }
    const sidePrism = (points, width, bevelSize = 0) => {
        const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)))
        const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevelSize > 0,
            bevelSize, bevelThickness: bevelSize, bevelSegments: 1, steps: 1, curveSegments: 6 })
        return g.translate(0, 0, -width / 2).rotateY(-Math.PI / 2)
    }

    // Narrow underbody leaves the four tyre silhouettes exposed.
    box([0, .46, -.02], [1.34, .20, 4.99], palette.trim)
    box([0, .70, .61], [1.64, .23, 3.48], palette.paint)
    const wheelY = .405, wheelZ = [1.66, -1.52]
    const side = new THREE.Shape(), radius = .535, bottom = .55
    const angle = Math.asin((bottom - wheelY) / radius)
    side.moveTo(-2.53, 1.365); side.lineTo(-.48, 1.365); side.lineTo(-.42, 1.31)
    side.lineTo(1.13, 1.31); side.lineTo(1.27, 1.405); side.lineTo(2.55, 1.355); side.lineTo(2.55, bottom)
    for(const z of wheelZ) {
        side.lineTo(z + Math.cos(angle) * radius, bottom)
        side.absarc(z, wheelY, radius, angle, Math.PI - angle, false)
    }
    side.lineTo(-2.53, bottom); side.closePath()
    const panels = new THREE.ExtrudeGeometry(side, { depth: .07, bevelEnabled: true, bevelSize: .012,
        bevelThickness: .012, bevelSegments: 1, steps: 1, curveSegments: 8 })
    panels.translate(0, 0, -.035).rotateY(-Math.PI / 2)
    for(const sign of [-1, 1]) add(panels, [sign * .86, 0, 0], [1, 1, 1], palette.paint)
    panels.dispose()

    // Slightly raked screen, upright short cab and gently crowned bonnet.
    const cab = sidePrism([[-.42, 1.25], [1.14, 1.25], [.73, 1.99], [-.34, 1.99]], 1.66, .025)
    add(cab, [0, 0, 0], [1, 1, 1], palette.paint); cab.dispose()
    box([0, 2.015, .19], [1.74, .072, 1.17], palette.edge, true)
    box([0, 1.365, 1.86], [1.71, .125, 1.43], palette.paint, true, [.023, 0, 0])
    box([0, 1.439, 1.81], [1.00, .033, 1.11], palette.paint, true, [.025, 0, 0])
    box([0, 1.671, .942], [1.49, .639, .025], palette.grille, true, [-.507, 0, 0])
    box([0, 1.674, .959], [1.397, .550, .012], palette.glass, true, [-.507, 0, 0])
    box([0, 1.665, -.401], [1.40, .51, .026], palette.grille, true, [.107, 0, 0])
    box([0, 1.665, -.419], [1.28, .414, .014], palette.glass, true, [.107, 0, 0])
    box([0, 1.665, -.437], [.025, .419, .014], palette.metal, false, [.107, 0, 0])
    const window = sidePrism([[-.265, 1.40], [.983, 1.40], [.662, 1.929], [-.237, 1.929]], .012)
    const innerWindow = sidePrism([[-.217, 1.45], [.88, 1.45], [.624, 1.88], [-.193, 1.88]], .013)
    for(const sign of [-1, 1]) {
        add(window, [sign * .855, 0, 0], [1, 1, 1], palette.grille)
        add(innerWindow, [sign * .864, 0, 0], [1, 1, 1], palette.glass)
        rod([sign * .873, 1.414, .665], [sign * .873, 1.873, .598], .014, palette.trim, 4)
        box([sign * .910, 1.252, -.15], [.034, .061, .20], palette.metal, true)
        box([sign * .912, .912, -.397], [.018, .67, .014], palette.trim)
        box([sign * .921, .497, .28], [.21, .071, 1.65], palette.trim, true)
        box([sign * .973, .527, .29], [.102, .017, 1.40], palette.metal)
        rod([sign * .847, 1.424, .888], [sign * 1.048, 1.535, .858], .027, palette.trim)
        box([sign * 1.041, 1.666, .858], [.174, .292, .145], palette.trim, true)
        box([sign * 1.041, 1.666, .774], [.133, .228, .012], palette.metal, true)
    }
    window.dispose(); innerWindow.dispose()
    for(const x of [-.35, .35]) rod([x - .21, 1.434, 1.11], [x + .22, 1.454, 1.10], .009, palette.trim, 4)

    // Broad black wheel-arch extensions follow the real squared shoulders.
    const flarePoints = [[.61,.49],[.575,.75],[.40,.987],[.28,1.04],[-.28,1.04],[-.40,.987],[-.575,.75],[-.61,.49]]
    for(const sign of [-1, 1]) for(const z of wheelZ) {
        for(let i = 0; i < flarePoints.length - 1; i++) {
            const [az,ay]=flarePoints[i], [bz,by]=flarePoints[i+1]
            const dy=by-ay, dz=bz-az
            box([sign*.926,(ay+by)/2,z+(az+bz)/2], [.134,.094,Math.hypot(dz,dy)+.031], palette.trim, true, [-Math.atan2(dy,dz),0,0])
        }
    }

    // Graphic livery is simple coloured geometry, not a texture download.
    const stripeA = sidePrism([[1.10,1.285],[.80,1.264],[.39,1.082],[-.29,1.083],[-.29,1.137],[.36,1.148],[.77,1.315],[1.10,1.316]], .008)
    const stripeB = sidePrism([[-.58,1.143],[-1.70,1.177],[-2.38,1.276],[-2.38,1.222],[-1.76,1.105],[-.58,1.085]], .008)
    const thinA = sidePrism([[1.10,1.242],[.79,1.227],[.38,1.045],[-.28,1.045],[-.28,1.062],[.39,1.065],[.80,1.247],[1.10,1.262]], .009)
    for(const sign of [-1, 1]) {
        add(stripeA,[sign*.912,0,0],[1,1,1],palette.stripe)
        add(stripeB,[sign*.912,0,0],[1,1,1],palette.stripe)
        add(thinA,[sign*.918,0,0],[1,1,1],palette.stripeLight)
    }
    stripeA.dispose();stripeB.dispose();thinA.dispose()

    // New 2026 face: black horizontal grille, circular lamps and corner indicators.
    box([0,1.158,2.565],[1.735,.395,.061],palette.trim,true)
    box([0,1.170,2.604],[1.041,.337,.013],palette.grille)
    for(let i=-2;i<=2;i++) for(const direction of [-1,1])
        rod([i*.168-.12*direction,1.022,2.617],[i*.168+.12*direction,1.315,2.617],.008,palette.rim,4)
    // The label sits in front of the simplified mesh pattern.
    box([0,1.173,2.629],[.715,.158,.016],palette.grille)
    const lampHousing = new THREE.CylinderGeometry(.163,.163,.035,20)
    const lampRing = new THREE.TorusGeometry(.128,.014,4,24)
    const projector = new THREE.CylinderGeometry(.044,.044,.027,12)
    for(const sign of [-1,1]) {
        add(lampHousing,[sign*.660,1.174,2.612],[1,1,1],palette.grille,[Math.PI/2,0,0])
        add(lampRing,[sign*.660,1.174,2.638],[1,1,1],palette.lamp)
        add(projector,[sign*.660,1.174,2.642],[1,1,1],palette.lamp,[Math.PI/2,0,0])
        box([sign*.904,1.238,2.477],[.095,.159,.091],palette.amber,true)
        box([sign*.897,1.235,2.555],[.083,.087,.015],palette.amber,true)
    }
    lampHousing.dispose();lampRing.dispose();projector.dispose()
    for(const x of [-.32,0,.32])box([x,.931,2.588],[.272,.056,.019],palette.grille)
    box([0,.682,2.647],[1.982,.330,.257],palette.trim,true)
    box([0,.757,2.794],[.59,.215,.058],palette.grille,true)
    box([0,.823,2.830],[.33,.028,.014],palette.metal)
    for(const x of [-.237,.237])box([x,.704,2.816],[.079,.270,.045],palette.grille,true)
    box([0,.657,2.831],[.346,.095,.039],palette.grille)
    for(let i=-3;i<=3;i++)box([i*.041,.657,2.854],[.012,.077,.012],palette.rim)
    const fog=new THREE.CylinderGeometry(.045,.045,.014,10)
    for(const sign of [-1,1])add(fog,[sign*.833,.786,2.787],[1,1,1],palette.lamp,[Math.PI/2,0,0])
    fog.dispose()
    box([-.55,.677,2.784],[.325,.115,.012],palette.plate,true)

    // Open cargo bed, inner wheel boxes and external rear latches.
    box([0,.822,-1.52],[1.68,.074,2.04],palette.bed)
    for(let x=-.65;x<.7;x+=.16)box([x,.865,-1.56],[.027,.014,1.76],palette.paint)
    for(const sign of [-1,1]) {
        box([sign*.80,1.083,-1.53],[.088,.497,1.97],palette.paint)
        box([sign*.860,1.389,-1.525],[.124,.063,2.07],palette.edge,true)
        box([sign*.687,.898,-1.52],[.30,.15,.79],palette.paint,true)
        box([sign*.75,1.257,-2.581],[.168,.056,.025],palette.metal,true)
        box([sign*.765,.894,-2.572],[.065,.101,.028],palette.trim)
        box([sign*.664,.680,-2.583],[.377,.159,.041],palette.trim,true)
        box([sign*.654,.692,-2.610],[.161,.120,.015],palette.red)
        box([sign*.790,.692,-2.610],[.094,.119,.015],palette.amber)
        box([sign*.542,.692,-2.610],[.047,.119,.015],palette.lamp)
        box([sign*.863,.318,-1.968],[.30,.39,.039],palette.rubber)
        box([sign*.855,.354,1.171],[.29,.30,.041],palette.rubber)
    }
    box([0,1.089,-2.541],[1.721,.496,.074],palette.paint,true)
    box([0,1.124,-2.585],[1.470,.251,.016],palette.edge,true)
    box([0,1.289,-2.591],[.178,.050,.017],palette.trim,true)
    box([0,.501,-2.632],[1.89,.110,.152],palette.metal,true)
    box([0,.561,-2.64],[.59,.036,.22],palette.trim)
    box([-.51,.495,-2.726],[.32,.117,.015],palette.plate,true)
    // Low headboard and upright spare carried against the cab, as in the reference.
    for(const x of [-.79,-.26,.26,.79])rod([x,1.346,-.541],[x,2.034,-.541],.025,palette.paint)
    rod([-.79,2.034,-.541],[.79,2.034,-.541],.030,palette.paint)
    rod([-.80,1.365,-.541],[.80,1.365,-.541],.026,palette.paint)
    const spare=new THREE.CylinderGeometry(.381,.381,.194,20)
    add(spare,[.365,1.228,-.816],[1,1,1],palette.rubber,[Math.PI/2,0,0]);spare.dispose()
    const cover=new THREE.CylinderGeometry(.353,.370,.069,20)
    add(cover,[.365,1.228,-.937],[1,1,1],palette.paint,[Math.PI/2,0,0]);cover.dispose()
    box([.365,1.226,-.977],[.343,.071,.013],palette.edge,true)

    // Readable vector TOYOTA branding on the grille and tailgate, no font/atlas.
    const glyphs={T:[[[0,1],[.68,1]],[[.34,1],[.34,0]]],Y:[[[0,1],[.34,.52]],[[.68,1],[.34,.52]],[[.34,.52],[.34,0]]],
        A:[[[0,0],[.34,1]],[[.34,1],[.68,0]],[[.15,.40],[.53,.40]]],
        O:[[[.15,0],[.53,0]],[[.53,0],[.68,.18]],[[.68,.18],[.68,.82]],[[.68,.82],[.53,1]],[[.53,1],[.15,1]],[[.15,1],[0,.82]],[[0,.82],[0,.18]],[[0,.18],[.15,0]]]}
    const label=(y,z,height,tint,back=false)=>{
        const word='TOYOTA',spacing=.91*height
        for(let i=0;i<word.length;i++)for(const [a,b] of glyphs[word[i]]) {
            const x=((a[0]+b[0])/2-.34)*height+(i-2.5)*spacing
            const dy=b[1]-a[1],dx=b[0]-a[0]
            box([back?-x:x,y+(a[1]+b[1])/2*height,z],[Math.hypot(dx,dy)*height,height*.135,.009],tint,false,[0,0,(back?-1:1)*Math.atan2(dy,dx)])
        }
    }
    label(1.121,2.644,.109,palette.metal)
    label(1.042,-2.599,.157,palette.lamp,true)

    // Equal four road tyres, dark alloys and five broad machined spokes.
    const tyreProfile=[[.206,-.136],[.348,-.136],[.390,-.098],[.405,-.045],[.405,.045],[.390,.098],[.348,.136],[.206,.136],[.206,-.136]]
    const tyre=new THREE.LatheGeometry(tyreProfile.map(([r,y])=>new THREE.Vector2(r,y)),24)
    const rim=new THREE.CylinderGeometry(.244,.244,.278,20)
    const hub=new THREE.CylinderGeometry(.090,.090,.305,12)
    const wheelCenters=[]
    for(const sign of [-1,1])for(const z of wheelZ) {
        const center=[sign*.846,wheelY,z];wheelCenters.push(center)
        add(tyre,center,[1,1,1],palette.rubber,[0,0,Math.PI/2])
        add(rim,center,[1,1,1],palette.rim,[0,0,Math.PI/2])
        add(hub,center,[1,1,1],palette.trim,[0,0,Math.PI/2])
        for(let i=0;i<5;i++) {
            const angle=i*Math.PI*2/5
            rod([sign*.991,wheelY+Math.cos(angle)*.092,z+Math.sin(angle)*.092],
                [sign*.991,wheelY+Math.cos(angle+.27)*.207,z+Math.sin(angle+.27)*.207],.025,palette.metal,4)
        }
    }
    tyre.dispose();rim.dispose();hub.dispose()

    const geometry=mergeGeometries(parts,false)
    for(const g of [...parts,cube,bevel])g.dispose()
    geometry.computeBoundingBox();geometry.computeBoundingSphere()
    const mesh=new THREE.Mesh(geometry,material)
    mesh.name='CamelCamp_ToyotaShas2026';mesh.castShadow=mesh.receiveShadow=true
    mesh.userData={parked:true,year:2026,roadWheels:4,spareWheels:1,wheelCenters,forward:'+Z'}
    const colliders=[
        {position:new THREE.Vector3(0,.60,.02),parameters:[1.00,.59,2.82]},
        {position:new THREE.Vector3(0,1.54,.30),parameters:[.87,.52,.85]},
        {position:new THREE.Vector3(0,1.16,-1.51),parameters:[.90,.29,1.075]}
    ].map(c=>({...c,shape:'cuboid',category:'object'}))
    return {mesh,colliders}
}
