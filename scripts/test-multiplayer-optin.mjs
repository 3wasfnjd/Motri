import fs from 'node:fs'
import assert from 'node:assert/strict'

const game = fs.readFileSync('sources/Game/Game.js', 'utf8')
const server = fs.readFileSync('sources/Game/Server.js', 'utf8')
const lobby = fs.readFileSync('sources/Game/MultiplayerLobby.js', 'utf8')

assert.equal(/server\.start\(\s*\)/.test(game), false, 'Game must not auto-start multiplayer')
assert.match(server, /start\(room\)/, 'Server.start must require an explicit room argument')
assert.match(server, /this\.room = null/, 'Server must begin with no active room')
assert.match(server, /Refusing to start multiplayer without an explicit room/, 'Server must reject missing room')
assert.match(lobby, /this\.server\.start\(room\)/, 'Lobby must be the component that explicitly starts a room')
assert.match(lobby, /joinRoom\('public', 'quick'\)/, 'Only quick join may explicitly choose public')

console.log('Multiplayer opt-in room flow OK')

const worker = fs.readFileSync('multiplayer-server/src/index.js', 'utf8')

assert.match(server, /motri\.multiplayer\.activeRoom/, 'Active room must persist for app/background resume')
assert.match(server, /motri\.multiplayer\.playerUuid/, 'Player UUID must persist across room leave and re-entry')
assert.equal(
    (server.match(/this\.sessionUuid\s*=/g) || []).length,
    1,
    'Player identity must not be regenerated when entering another room'
)
assert.match(server, /visibilitychange/, 'Foregrounding the app must trigger reconnect logic')
assert.match(server, /type:\s*'leaveRoom'/, 'Explicit room exit must notify the server')
assert.match(worker, /DISCONNECT_GRACE_MS/, 'Worker must keep temporary disconnects in a grace period')
assert.match(worker, /deferDisconnect\(attachment\)/, 'Unexpected close must defer logout')
assert.match(worker, /message\.type === 'leaveRoom'/, 'Worker must distinguish explicit logout')
assert.match(worker, /PENDING_PREFIX/, 'Worker must retain suspended sessions for reconnect')

console.log('Multiplayer background-resume flow OK')

assert.match(worker, /deviceUuid/, 'Worker must receive persistent device identity')
assert.match(worker, /identityMatches/, 'Worker must collapse duplicate sessions for one device')
assert.match(worker, /removedUuids/, 'Worker must remove stale remote player identities')
assert.match(worker, /logicalMembers/, 'Room capacity must count logical players instead of sockets')

console.log('Multiplayer player identity deduplication OK')

assert.match(worker, /legacy session cleanup/, 'Worker must retire legacy live ghost sockets')
assert.match(worker, /legacyPending/, 'Worker must delete legacy suspended ghost sessions')
assert.match(worker, /legacyUuids/, 'Worker must broadcast removal of legacy ghost players')

console.log('Legacy multiplayer ghost cleanup OK')

const multiplayer = fs.readFileSync('sources/Game/Multiplayer.js', 'utf8')

assert.match(multiplayer, /type:\s*'hello'[\s\S]*paint:\s*this\.selectedColor/, 'Selected color must be sent in player hello profile')
assert.match(multiplayer, /paintMaterials:\s*new Map\(\)/, 'Each remote player must own isolated paint materials')
assert.match(multiplayer, /source\.clone\(\)/, 'Remote paint must clone the canonical material per player')
assert.match(worker, /attachment\.paint\s*=\s*cleanPaint\(message\.paint\)/, 'Room server must store selected player color')
assert.match(worker, /state\.paint\s*=\s*attachment\.paint/, 'Room server must enforce stored player color on every state')
assert.match(worker, /paint:\s*attachment\.paint/, 'Join profile must broadcast selected player color')

console.log('Multiplayer color profile sync OK')

const worldSync = fs.readFileSync('sources/Game/WorldSync.js', 'utf8')

assert.match(worldSync, /toilet-cabin:0/, 'Toilet cabin must be part of shared world sync')
assert.match(worldSync, /for\(const \[ key, object \] of this\.game\.objects\.list\)/, 'Dynamic visual world props must be auto-registered')
assert.match(worldSync, /registeredObjects = new WeakSet\(\)/, 'Shared objects must not be registered twice')
assert.match(worldSync, /RigidBodyType\.KinematicPositionBased/, 'Kinematic shared props must preserve their physics type')
assert.match(worker, /WORLD_OWNER_MOVING_MS/, 'Server must lease moving world objects to one player')
assert.match(worker, /this\.worldOwners = new Map\(\)/, 'Server must track temporary object ownership')
assert.match(worker, /this\.worldStates = new Map\(\)/, 'Server must retain canonical in-memory object state')
assert.match(worker, /corrections\.push\(canonical\)/, 'Conflicting clients must be corrected to canonical state')

console.log('Shared world object consistency OK')

const physics = fs.readFileSync('sources/Game/Physics/Physics.js', 'utf8')
const physicsVehicle = fs.readFileSync('sources/Game/Physics/PhysicsVehicle.js', 'utf8')
const multiplayerStyle = fs.readFileSync('sources/style/multiplayer.styl', 'utf8')

assert.match(physics, /remoteVehicle:\s*0b0000000000010000/, 'Physics must define a dedicated remote vehicle group')
assert.match(physics, /vehicleBumper:/, 'Local vehicle bumper must keep its own collision filter')
assert.match(physics, /remoteVehicle:[\s\S]*this\.groups\.vehicle/, 'Remote vehicles must collide only with player vehicles')
assert.match(physics, /setCcdEnabled\(true\)/, 'Physics must support CCD for fast local vehicle contacts')
assert.match(physicsVehicle, /ccd:\s*true/, 'Local vehicle must enable CCD')
assert.match(physicsVehicle, /category:\s*'vehicle'/, 'Local chassis must opt into multiplayer vehicle contacts')
assert.match(physicsVehicle, /category:\s*'vehicleBumper'/, 'Local bumper must opt into multiplayer vehicle contacts')
assert.match(multiplayer, /createRemoteCollisionBody\(uuid\)/, 'Remote players must get physical collision proxies')
assert.match(multiplayer, /type:\s*'kinematicVelocityBased'/, 'Remote collision proxy must move continuously by velocity')
assert.match(multiplayer, /category:\s*'remoteVehicle'/, 'Remote collision proxy must use isolated collision category')
assert.match(multiplayer, /updateRemoteCollisionBody\(remote\)/, 'Remote collision body must be corrected continuously')
assert.match(multiplayer, /body\.setLinvel\(/, 'Remote collision proxy must use real network velocity')
assert.match(multiplayer, /body\.setAngvel\(/, 'Remote collision proxy rotation must be velocity-driven')
assert.doesNotMatch(multiplayer, /type:\s*'vehicleImpact'/, 'Delayed network impact events must not be used')
assert.doesNotMatch(worker, /vehicleImpact/, 'Worker must not relay delayed collision impulses')

console.log('Velocity-driven multiplayer collision physics OK')

assert.match(multiplayer, /const SEND_INTERVAL = 1 \/ 20/, 'Vehicle state sync must run at 20 Hz')
assert.match(multiplayer, /const INTERPOLATION_DELAY_MS = 55/, 'Remote rendering latency must stay low')
assert.match(multiplayer, /const COLLISION_PREDICTION_SECONDS = 0\.045/, 'Collision proxy must use a short forward prediction')
assert.match(multiplayer, /const h00 = 2 \* t3 - 3 \* t2 \+ 1/, 'Remote position interpolation must use cubic Hermite basis')
assert.match(multiplayer, /h10 \* seconds/, 'Hermite interpolation must include source velocity')
assert.match(multiplayer, /h11 \* seconds/, 'Hermite interpolation must include target velocity')
assert.doesNotMatch(multiplayer, /remote\.model\.position\.lerp\(state\.position/, 'Do not add a second lagging position smoother after Hermite interpolation')

console.log('Smooth remote vehicle interpolation OK')

assert.match(multiplayer, /multiplayer-direction-indicator/, 'Remote players must get an off-screen direction indicator')
assert.match(multiplayer, /indicatorX/, 'Direction indicator must keep smoothed screen position state')
assert.match(multiplayer, /deltaAngle = Math\.atan2/, 'Direction arrow rotation must follow the shortest smooth angle')
assert.match(multiplayer, /1 - Math\.exp\(-10 \* dt\)/, 'Direction marker position must use frame-rate independent smoothing')
assert.match(multiplayer, /distance.*remote\.model\.position/s, 'Direction marker must calculate player distance')
assert.match(multiplayerStyle, /--player-accent/, 'Direction marker must use the remote player vehicle color')
assert.match(multiplayerStyle, /multiplayer-direction-arrow/, 'Direction marker must include a compact arrow')
assert.match(multiplayerStyle, /backdrop-filter blur\(4px\)/, 'Direction marker must use a lightweight HUD treatment')

console.log('Smooth multiplayer player tracking indicator OK')


const viewport = fs.readFileSync('sources/Game/Viewport.js', 'utf8')
const quality = fs.readFileSync('sources/Game/Quality.js', 'utf8')
const rendering = fs.readFileSync('sources/Game/Rendering.js', 'utf8')
const cheapDof = fs.readFileSync('sources/Game/Passes/cheapDOF.js', 'utf8')

assert.match(viewport, /pixelRatioMax = lowHardware[\s\S]*\? 1[\s\S]*\? 1\.25[\s\S]*: 1\.5/, 'Render DPR must be capped by device class')
assert.match(viewport, /pixelBudget = lowHardware[\s\S]*1200000[\s\S]*1600000[\s\S]*2200000/, 'Render buffer must obey explicit pixel budgets')
assert.match(viewport, /Math\.sqrt\(this\.pixelBudget \/ cssPixels\)/, 'Pixel ratio must scale down for high-resolution screens')
assert.match(quality, /lowHardware[\s\S]*cores <= 4/, 'Weak CPU devices must start in low quality')
assert.match(quality, /this\.level = \(isMobile \|\| lowHardware\) \? 1 : 0/, 'Mobile and weak hardware must default to low quality')
assert.match(rendering, /this\.usePostProcessing = level === 0/, 'Low quality must bypass post-processing')
assert.match(rendering, /this\.renderer\.render\([\s\S]*this\.game\.scene[\s\S]*this\.game\.view\.camera/, 'Low quality must render the scene directly')
assert.match(rendering, /averageFrameTime >= 34/, 'Adaptive resolution must react to severe frame drops')
assert.match(rendering, /applyPixelRatio\(this\.dynamicPixelRatio - 0\.2\)/, 'Severe frame drops must lower render resolution')
assert.match(rendering, /changeLevel\(1, 'performance'\)/, 'Sustained slow rendering must auto-downgrade quality')
assert.match(cheapDof, /this\.repeats = uniform\(12\)/, 'High quality DOF sample count must stay reduced')

console.log('Adaptive render performance safeguards OK')
