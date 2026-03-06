import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { readFile } from 'fs/promises'
import { watch } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

// Path to OpenClaw sessions file (all agents)
const SESSIONS_DIRS = join(homedir(), '.openclaw', 'agents')
const POLL_INTERVAL_MS = 3000

let agentStates = {}

function deriveState(session) {
  const msSinceUpdate = Date.now() - session.updatedAt
  if (msSinceUpdate < 60_000) return 'running'
  if (msSinceUpdate < 300_000) return 'waiting'
  return 'idle'
}

async function readAllSessions() {
  const results = {}
  try {
    const { readdir } = await import('fs/promises')
    const agents = await readdir(SESSIONS_DIRS)
    for (const agentId of agents) {
      const sessionsFile = join(SESSIONS_DIRS, agentId, 'sessions', 'sessions.json')
      try {
        const raw = await readFile(sessionsFile, 'utf8')
        const data = JSON.parse(raw)
        for (const [key, session] of Object.entries(data)) {
          results[key] = {
            key,
            agentId,
            sessionId: session.sessionId,
            updatedAt: session.updatedAt,
            totalTokens: session.totalTokens ?? 0,
            contextTokens: session.contextTokens ?? 200000,
            model: session.model ?? 'unknown',
            kind: session.chatType ?? 'direct',
            compactionCount: session.compactionCount ?? 0,
            abortedLastRun: session.abortedLastRun ?? false,
          }
        }
      } catch {
        // agent has no sessions file yet
      }
    }
  } catch (err) {
    console.error('Could not read sessions dir:', err.message)
  }
  return results
}

function buildAgentView(session) {
  const state = session.abortedLastRun ? 'error' : deriveState(session)
  const contextFill = session.contextTokens > 0
    ? session.totalTokens / session.contextTokens
    : 0
  return {
    key: session.key,
    agentId: session.agentId,
    sessionId: session.sessionId,
    state,
    contextFill: Math.min(contextFill, 1),
    totalTokens: session.totalTokens,
    contextTokens: session.contextTokens,
    model: session.model,
    kind: session.kind,
    compactionCount: session.compactionCount,
    updatedAt: session.updatedAt,
    msSinceUpdate: Date.now() - session.updatedAt,
  }
}

async function poll() {
  const raw = await readAllSessions()
  const next = {}
  for (const [key, session] of Object.entries(raw)) {
    next[key] = buildAgentView(session)
  }

  // Detect spawns and state changes
  for (const [key, agent] of Object.entries(next)) {
    if (!agentStates[key]) {
      console.log(`[+] spawn: ${key}`)
      io.emit('agent:spawn', agent)
    } else {
      const prev = agentStates[key]
      if (prev.state !== agent.state || Math.abs(prev.contextFill - agent.contextFill) > 0.005) {
        io.emit('agent:update', agent)
      }
    }
  }

  // Detect gone sessions
  for (const key of Object.keys(agentStates)) {
    if (!next[key]) {
      console.log(`[-] terminate: ${key}`)
      io.emit('agent:terminate', { key })
    }
  }

  agentStates = next
}

io.on('connection', (socket) => {
  console.log('client connected:', socket.id)
  // Send full snapshot to new client
  socket.emit('agent:snapshot', Object.values(agentStates))
})

// Poll on interval
setInterval(poll, POLL_INTERVAL_MS)
poll()

const PORT = process.env.PORT ?? 3333
httpServer.listen(PORT, () => {
  console.log(`Bridge server running on http://localhost:${PORT}`)
  console.log(`Polling OpenClaw sessions every ${POLL_INTERVAL_MS}ms`)
})
