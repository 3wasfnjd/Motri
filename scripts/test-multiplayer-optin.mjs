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
