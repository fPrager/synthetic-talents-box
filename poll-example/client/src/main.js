import Phaser from 'phaser'
import { OfficeScene } from './OfficeScene.js'

const config = {
  type: Phaser.AUTO,
  width: 1024,
  height: 640,
  backgroundColor: '#0a0a0f',
  parent: 'game-container',
  scene: [OfficeScene],
  fps: { target: 30 },
}

new Phaser.Game(config)
