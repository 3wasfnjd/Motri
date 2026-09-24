import './threejs-override.js'
import { Game } from './Game/Game.js'
// Original author notices remain in credits; no personal promotional console banner.

if(import.meta.env.VITE_LOG) console.info('MOTRI 2')

if(import.meta.env.VITE_GAME_PUBLIC)
    window.game = new Game()
else
    new Game()
