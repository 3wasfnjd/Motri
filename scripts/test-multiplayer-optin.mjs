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

assert.match(physics, /remoteVehicle:\s*0b0000000000010000/, 'Physics must define a dedicated remote vehicle group')
assert.match(physics, /vehicleBumper:/, 'Local vehicle bumper must keep its own collision filter')
assert.match(physics, /remoteVehicle:[\s\S]*this\.groups\.vehicle/, 'Remote vehicles must collide only with player vehicles')
assert.match(physicsVehicle, /category:\s*'vehicle'/, 'Local chassis must opt into multiplayer vehicle contacts')
assert.match(physicsVehicle, /category:\s*'vehicleBumper'/, 'Local bumper must opt into multiplayer vehicle contacts')
assert.match(multiplayer, /createRemoteCollisionBody\(uuid\)/, 'Remote players must get physical collision proxies')
assert.match(multiplayer, /type:\s*'kinematicPositionBased'/, 'Remote collision proxy must be kinematic')
assert.match(multiplayer, /category:\s*'remoteVehicle'/, 'Remote collision proxy must use isolated collision category')
assert.match(multiplayer, /setNextKinematicTranslation/, 'Remote collision proxy must follow network interpolation')
assert.match(multiplayer, /destroyRemoteCollisionBody\(remote\)/, 'Remote collision bodies must be cleaned up on leave')

console.log('Multiplayer vehicle collision proxies OK')

assert.match(multiplayer, /handleRemoteVehicleCollision\(remoteUuid, force = 0\)/, 'Remote collision must calculate a targeted impact')
assert.match(multiplayer, /type:\s*'vehicleImpact'/, 'Client must send vehicleImpact events')
assert.match(multiplayer, /targetUuid:\s*remoteUuid/, 'Vehicle impact must target the struck player')
assert.match(multiplayer, /applyIncomingVehicleImpact\(message\)/, 'Target client must handle incoming impact events')
assert.match(multiplayer, /body\.applyImpulse\(/, 'Incoming impact must apply a Rapier impulse to the local vehicle')
assert.match(multiplayer, /IMPACT_COOLDOWN_MS/, 'Client must rate-limit repeated collision impulses')
assert.match(worker, /VEHICLE_IMPACT_COOLDOWN_MS/, 'Server must rate-limit vehicle impact messages')
assert.match(worker, /cleanImpulse\(message\.impulse\)/, 'Server must sanitize vehicle impact vectors')
assert.match(worker, /targetSocket\.send\(JSON\.stringify\(\{[\s\S]*type:\s*'vehicleImpact'/, 'Server must route impact only to the target socket')

console.log('Multiplayer impact force exchange OK')
