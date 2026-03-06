import { io } from 'socket.io-client'

const COLORS = {
  running: 0x00ff88,
  waiting: 0xffcc00,
  idle:    0x4488ff,
  error:   0xff3333,
}

const DESK_W = 280
const DESK_H = 170
const COLS = 3
const PAD_X = 30
const PAD_Y = 100

export class OfficeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'OfficeScene' })
    this.agents = {}   // key -> { data, gfx, texts, tick }
    this.socket = null
    this.tickCounter = 0
  }

  preload() {}

  create() {
    this.socket = io('http://localhost:3333')

    this.socket.on('agent:snapshot', (agents) => {
      agents.forEach(a => this.spawnDesk(a))
    })
    this.socket.on('agent:spawn',    (a) => this.spawnDesk(a))
    this.socket.on('agent:update',   (a) => this.updateDesk(a))
    this.socket.on('agent:terminate',(a) => this.removeDesk(a.key))

    // Header bar
    this.add.rectangle(512, 24, 1024, 48, 0x111122).setDepth(10)
    this.titleText = this.add.text(16, 12, 'SYNTHETIC TALENTS BOX', {
      fontSize: '16px', fill: '#88aaff', fontFamily: 'monospace', fontStyle: 'bold'
    }).setDepth(11)
    this.statsText = this.add.text(512, 12, '', {
      fontSize: '13px', fill: '#aaaacc', fontFamily: 'monospace'
    }).setOrigin(0.5, 0).setDepth(11)
    this.connText = this.add.text(1008, 12, '● connecting', {
      fontSize: '12px', fill: '#666688', fontFamily: 'monospace'
    }).setOrigin(1, 0).setDepth(11)

    this.socket.on('connect', () => {
      this.connText.setText('● live').setStyle({ fill: '#00ff88' })
    })
    this.socket.on('disconnect', () => {
      this.connText.setText('● offline').setStyle({ fill: '#ff3333' })
    })

    // Empty state text
    this.emptyText = this.add.text(512, 340, 'No active sessions found.\nStart an OpenClaw agent to see it appear here.', {
      fontSize: '15px', fill: '#333355', fontFamily: 'monospace', align: 'center'
    }).setOrigin(0.5)
  }

  // ─── Desk helpers ────────────────────────────────────────────────────────────

  deskPosition(index) {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    const x = PAD_X + col * (DESK_W + PAD_X)
    const y = PAD_Y + row * (DESK_H + 20)
    return { x, y }
  }

  spawnDesk(agent) {
    if (this.agents[agent.key]) {
      this.updateDesk(agent)
      return
    }

    const index = Object.keys(this.agents).length
    const { x, y } = this.deskPosition(index)
    const color = COLORS[agent.state] ?? COLORS.idle

    const container = this.add.container(x, y)

    // Desk background
    const bg = this.add.rectangle(DESK_W / 2, DESK_H / 2, DESK_W, DESK_H, 0x111122)
      .setStrokeStyle(1, 0x222244)
    const border = this.add.rectangle(DESK_W / 2, DESK_H / 2, DESK_W, DESK_H, 0x000000, 0)
      .setStrokeStyle(2, color)

    // Character blob (simple pixel character)
    const char = this.add.graphics()
    this.drawCharacter(char, 30, 30, color, agent.state)

    // State indicator dot
    const dot = this.add.circle(DESK_W - 14, 14, 6, color)

    // Agent label (session key shortened)
    const shortKey = agent.key.replace('agent:', '').replace(':main', '')
    const keyText = this.add.text(60, 10, shortKey, {
      fontSize: '13px', fill: '#ccddff', fontFamily: 'monospace', fontStyle: 'bold'
    })

    // Model
    const modelText = this.add.text(60, 28, agent.model.split('/').pop(), {
      fontSize: '10px', fill: '#556688', fontFamily: 'monospace'
    })

    // State label
    const stateText = this.add.text(60, 44, agent.state.toUpperCase(), {
      fontSize: '11px', fontFamily: 'monospace', fill: '#' + color.toString(16).padStart(6, '0')
    })

    // Token stats
    const tokenPct = Math.round(agent.contextFill * 100)
    const tokenText = this.add.text(10, DESK_H - 55, `tokens: ${agent.totalTokens.toLocaleString()} / ${(agent.contextTokens / 1000).toFixed(0)}k`, {
      fontSize: '10px', fill: '#445566', fontFamily: 'monospace'
    })

    // Last active
    const lastText = this.add.text(10, DESK_H - 42, this.formatAge(agent.msSinceUpdate), {
      fontSize: '10px', fill: '#445566', fontFamily: 'monospace'
    })

    // Context fill bar background
    const barBg = this.add.rectangle(DESK_W / 2, DESK_H - 20, DESK_W - 20, 12, 0x1a1a2e)
      .setStrokeStyle(1, 0x222244)

    // Context fill bar fill
    const barFill = this.add.rectangle(
      10 + ((DESK_W - 20) * agent.contextFill) / 2,
      DESK_H - 20,
      (DESK_W - 20) * agent.contextFill,
      10,
      this.contextColor(agent.contextFill)
    ).setOrigin(0.5)

    // Context % label
    const fillText = this.add.text(DESK_W - 12, DESK_H - 26, `${tokenPct}%`, {
      fontSize: '10px', fill: '#556688', fontFamily: 'monospace'
    }).setOrigin(1, 0)

    // Stress indicator (paper pile emoji text for high fill)
    const stressText = this.add.text(DESK_W - 14, DESK_H - 55, this.stressEmoji(agent.contextFill), {
      fontSize: '18px'
    }).setOrigin(1, 0)

    container.add([bg, border, char, dot, keyText, modelText, stateText, tokenText, lastText, barBg, barFill, fillText, stressText])

    this.agents[agent.key] = {
      data: agent,
      container,
      refs: { bg, border, char, dot, stateText, tokenText, lastText, barFill, fillText, stressText },
      index,
      animTick: 0,
    }

    this.refreshEmpty()
    this.refreshStats()

    // Spawn flash
    this.tweens.add({
      targets: container,
      alpha: { from: 0, to: 1 },
      duration: 400,
      ease: 'Quad.easeIn',
    })
  }

  updateDesk(agent) {
    const entry = this.agents[agent.key]
    if (!entry) { this.spawnDesk(agent); return }

    entry.data = agent
    const { refs } = entry
    const color = COLORS[agent.state] ?? COLORS.idle

    refs.border.setStrokeStyle(2, color)
    refs.dot.setFillStyle(color)

    // Redraw character
    refs.char.clear()
    this.drawCharacter(refs.char, 30, 30, color, agent.state)

    refs.stateText
      .setText(agent.state.toUpperCase())
      .setStyle({ fill: '#' + color.toString(16).padStart(6, '0') })

    const tokenPct = Math.round(agent.contextFill * 100)
    refs.tokenText.setText(`tokens: ${agent.totalTokens.toLocaleString()} / ${(agent.contextTokens / 1000).toFixed(0)}k`)
    refs.lastText.setText(this.formatAge(agent.msSinceUpdate))
    refs.fillText.setText(`${tokenPct}%`)
    refs.stressText.setText(this.stressEmoji(agent.contextFill))

    const barW = (DESK_W - 20) * agent.contextFill
    refs.barFill
      .setSize(Math.max(barW, 0), 10)
      .setX(10 + barW / 2)
      .setFillStyle(this.contextColor(agent.contextFill))

    this.refreshStats()
  }

  removeDesk(key) {
    const entry = this.agents[key]
    if (!entry) return
    this.tweens.add({
      targets: entry.container,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        entry.container.destroy()
        delete this.agents[key]
        this.reflow()
        this.refreshEmpty()
        this.refreshStats()
      }
    })
  }

  reflow() {
    Object.values(this.agents).forEach((entry, i) => {
      const { x, y } = this.deskPosition(i)
      this.tweens.add({
        targets: entry.container,
        x, y,
        duration: 300,
        ease: 'Quad.easeOut',
      })
      entry.index = i
    })
  }

  // ─── Character drawing ────────────────────────────────────────────────────────

  drawCharacter(gfx, x, y, color, state) {
    gfx.fillStyle(color, 0.9)

    if (state === 'idle') {
      // Head on desk (slumped)
      gfx.fillEllipse(x, y + 10, 22, 18)  // head down
      gfx.fillStyle(0x334455, 0.8)
      gfx.fillRect(x - 18, y + 16, 36, 10) // desk surface
    } else if (state === 'error') {
      // Slumped character
      gfx.fillEllipse(x, y, 22, 22)        // head
      gfx.fillStyle(color, 0.5)
      gfx.fillEllipse(x + 4, y + 22, 18, 30) // body tilted
      gfx.fillStyle(0xff0000, 1)
      gfx.fillRect(x - 4, y - 14, 8, 8)   // red alert above head
    } else if (state === 'waiting') {
      // Leaning back
      gfx.fillEllipse(x, y, 22, 22)        // head
      gfx.fillStyle(color, 0.6)
      gfx.fillEllipse(x, y + 24, 20, 28)  // body relaxed
      // Finger tap dots
      gfx.fillStyle(color, 0.4)
      gfx.fillCircle(x - 10, y + 44, 3)
      gfx.fillCircle(x - 5, y + 44, 3)
      gfx.fillCircle(x, y + 44, 3)
    } else {
      // Running: typing posture
      gfx.fillEllipse(x, y, 22, 22)        // head
      gfx.fillStyle(color, 0.7)
      gfx.fillEllipse(x, y + 22, 20, 26)  // body leaning forward
      gfx.fillStyle(color, 0.5)
      gfx.fillRect(x - 14, y + 36, 10, 6) // left hand on keyboard
      gfx.fillRect(x + 4, y + 36, 10, 6)  // right hand on keyboard
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  contextColor(fill) {
    if (fill < 0.5) return 0x00cc66
    if (fill < 0.75) return 0xffaa00
    if (fill < 0.9) return 0xff6600
    return 0xff2222
  }

  stressEmoji(fill) {
    if (fill < 0.5) return ''
    if (fill < 0.75) return '📄'
    if (fill < 0.9) return '📚'
    return '🔥'
  }

  formatAge(ms) {
    if (ms < 60_000) return `active ${Math.round(ms / 1000)}s ago`
    if (ms < 3600_000) return `active ${Math.round(ms / 60_000)}m ago`
    return `active ${Math.round(ms / 3600_000)}h ago`
  }

  refreshStats() {
    const agents = Object.values(this.agents)
    if (agents.length === 0) { this.statsText.setText(''); return }
    const running = agents.filter(a => a.data.state === 'running').length
    const waiting = agents.filter(a => a.data.state === 'waiting').length
    const idle    = agents.filter(a => a.data.state === 'idle').length
    const avgFill = agents.reduce((s, a) => s + a.data.contextFill, 0) / agents.length
    this.statsText.setText(
      `agents: ${agents.length}  ●  running: ${running}  waiting: ${waiting}  idle: ${idle}  ●  avg context: ${Math.round(avgFill * 100)}%`
    )
  }

  refreshEmpty() {
    this.emptyText.setVisible(Object.keys(this.agents).length === 0)
  }

  // ─── Update loop ─────────────────────────────────────────────────────────────

  update() {
    this.tickCounter++

    // Animate running agents (typing flicker every ~15 frames)
    if (this.tickCounter % 15 === 0) {
      for (const entry of Object.values(this.agents)) {
        if (entry.data.state === 'running') {
          entry.refs.char.clear()
          entry.animTick = (entry.animTick + 1) % 2
          const offset = entry.animTick === 0 ? 0 : 3
          const color = COLORS.running
          entry.refs.char.fillStyle(color, 0.9)
          entry.refs.char.fillEllipse(30, 30, 22, 22)
          entry.refs.char.fillStyle(color, 0.7)
          entry.refs.char.fillEllipse(30, 52, 20, 26)
          entry.refs.char.fillStyle(color, 0.5)
          entry.refs.char.fillRect(16, 68 + offset, 10, 6)
          entry.refs.char.fillRect(34, 68 - offset, 10, 6)
        }

        // Refresh "active X ago" text on each tick (~30fps / 30 = 1s)
        if (this.tickCounter % 30 === 0 && entry.data) {
          const msSinceUpdate = Date.now() - entry.data.updatedAt
          entry.refs.lastText.setText(this.formatAge(msSinceUpdate))
        }
      }
    }
  }
}
