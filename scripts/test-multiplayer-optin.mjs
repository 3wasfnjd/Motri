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
