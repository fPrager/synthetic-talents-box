require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { WebSocket } = require('ws');
const { randomUUID } = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// Mock fallback (used when OpenClaw is offline)
// ============================================================
const AGENT_NAMES = ['ARIA', 'NEXUS', 'VEGA', 'ORION', 'LYRA', 'ZETA'];
const THOUGHT_POOL = [
  'Analyzing task parameters...',
  'Cross-referencing knowledge base...',
  'Generating candidate solutions...',
  'Evaluating confidence scores...',
  'Spawning subprocess for analysis...',
  'Memory consolidation in progress...',
  'Running inference pass #',
  'Checking tool availability...',
  'Optimizing response vector...',
  'Querying context window...',
  'Decomposing goal hierarchy...',
  'Verifying output constraints...',
  'Sampling from distribution...',
  'Applying chain-of-thought...',
  'Reviewing prior state...',
];

function randomThought() {
  const t = THOUGHT_POOL[Math.floor(Math.random() * THOUGHT_POOL.length)];
  return t.endsWith('#') ? t + Math.floor(Math.random() * 100) : t;
}

const mockAgents = AGENT_NAMES.map((name, i) => ({
  id: `agent-${i}`,
  name,
  state: Math.random() > 0.3 ? 'WORKING' : 'SLEEPING',
  cpu: Math.floor(Math.random() * 60) + 10,
  containerId: `c${Math.random().toString(36).substr(2, 10)}`,
  thoughts: [],
  uptime: Math.floor(Math.random() * 3600),
  source: 'mock',
}));

function tickMock() {
  mockAgents.forEach(agent => {
    if (Math.random() < 0.2) {
      agent.state = agent.state === 'WORKING' ? 'SLEEPING' : 'WORKING';
    }
    if (agent.state === 'WORKING') {
      agent.cpu = Math.min(95, Math.max(5, agent.cpu + (Math.random() * 20 - 10)));
    } else {
      agent.cpu = Math.max(0, Math.min(5, agent.cpu * 0.5));
    }
    agent.cpu = Math.round(agent.cpu);
    if (agent.state === 'WORKING') {
      agent.thoughts.unshift({ time: new Date().toISOString(), text: randomThought() });
      if (agent.thoughts.length > 50) agent.thoughts.pop();
    }
    agent.uptime += 3;
  });
}

// ============================================================
// OpenClaw live state
// ============================================================
const GATEWAY_URL   = process.env.OPENCLAW_GATEWAY_URL   || 'ws://localhost:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

const OC_THOUGHT_POOL = [
  'Processing message stream...',
  'Invoking tool chain...',
  'Awaiting model response...',
  'Parsing assistant output...',
  'Streaming tokens...',
  'Executing shell command...',
  'Reading file context...',
  'Writing to workspace...',
  'Searching knowledge base...',
  'Updating session state...',
  'Resolving subagent task...',
  'Running context compression...',
  'Validating tool result...',
  'Generating next action...',
  'Checking approval queue...',
];

let ocAgents    = [];  // raw GatewayAgentRow[]
let ocSessions  = [];  // raw GatewaySessionRow[]
let ocConnected = false;

const ocSessionUptime  = {};  // sessionKey → seconds
const ocAgentThoughts  = {};  // sessionKey → [{time, text}]

function resolveAgentIdFromKey(key) {
  // Session keys: "agentId:channel:..." — first segment is agentId
  if (!key) return 'default';
  return key.split(':').filter(Boolean)[0] || 'default';
}

function buildAgentsFromOpenClaw() {
  const now = Date.now();
  const ACTIVE_MS = 5 * 60 * 1000; // 5 minutes = active/WORKING

  // Map each agent to their most recently updated session
  const byAgent = {};
  for (const sess of ocSessions) {
    const aid = resolveAgentIdFromKey(sess.key);
    if (!byAgent[aid] || (sess.updatedAt || 0) > (byAgent[aid].updatedAt || 0)) {
      byAgent[aid] = sess;
    }
  }

  const result = ocAgents.slice(0, 6).map((agent, i) => {
    const sess = byAgent[agent.id];
    const key  = sess?.key || agent.id;

    const isWorking = sess && (now - (sess.updatedAt || 0)) < ACTIVE_MS;
    const state = isWorking ? 'WORKING' : 'SLEEPING';

    // CPU from token fill %
    let cpu = isWorking ? (Math.floor(Math.random() * 40) + 20) : 2;
    if (isWorking && sess.totalTokens && sess.contextTokens) {
      cpu = Math.min(95, Math.round((sess.totalTokens / sess.contextTokens) * 100));
    }

    // Uptime
    ocSessionUptime[key] = (ocSessionUptime[key] || Math.floor(Math.random() * 600)) + 3;

    // Thoughts
    if (!ocAgentThoughts[key]) ocAgentThoughts[key] = [];
    if (isWorking) {
      const pool = sess?.model
        ? [...OC_THOUGHT_POOL, `Running on ${sess.model}`, `ctx: ${sess.totalTokens || 0} tokens`]
        : OC_THOUGHT_POOL;
      const text = pool[Math.floor(Math.random() * pool.length)];
      ocAgentThoughts[key].unshift({ time: new Date().toISOString(), text });
      if (ocAgentThoughts[key].length > 50) ocAgentThoughts[key].pop();
    }

    const displayName = (agent.identity?.name || agent.name || agent.id).toUpperCase();

    return {
      id: `agent-${i}`,
      name: displayName,
      state,
      cpu,
      containerId: key,
      thoughts: ocAgentThoughts[key],
      uptime: ocSessionUptime[key],
      source: 'openclaw',
    };
  });

  // Pad to 6 slots
  while (result.length < 6) {
    const i = result.length;
    result.push({
      id: `agent-${i}`,
      name: AGENT_NAMES[i],
      state: 'SLEEPING',
      cpu: 0,
      containerId: `offline-${i}`,
      thoughts: [],
      uptime: 0,
      source: 'offline',
    });
  }
  return result;
}

// ============================================================
// OpenClaw WebSocket client
// ============================================================
class OpenClawClient {
  constructor() {
    this.ws          = null;
    this.pending     = new Map();
    this.closed      = false;
    this.connected   = false;
    this.backoffMs   = 2000;
    this._timer      = null;
  }

  start() {
    this.closed = false;
    this._connect();
  }

  stop() {
    this.closed = true;
    clearTimeout(this._timer);
    this.ws?.close();
  }

  _connect() {
    if (this.closed) return;
    console.log(`[openclaw] connecting to ${GATEWAY_URL}`);
    this.ws = new WebSocket(GATEWAY_URL);

    this.ws.on('open', () => {
      // Wait up to 750 ms for connect.challenge; fall back if none arrives
      this._timer = setTimeout(() => this._sendConnect(null), 750);
    });

    this.ws.on('message', (raw) => this._handle(raw.toString()));

    this.ws.on('close', () => {
      this.connected = false;
      ocConnected    = false;
      this._flush(new Error('closed'));
      if (!this.closed) {
        console.log(`[openclaw] retrying in ${Math.round(this.backoffMs / 1000)}s`);
        this._timer = setTimeout(() => this._connect(), this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 1.7, 30000);
      }
    });

    this.ws.on('error', (err) => console.log(`[openclaw] ws error: ${err.message}`));
  }

  _handle(raw) {
    let f;
    try { f = JSON.parse(raw); } catch { return; }

    if (f.type === 'event' && f.event === 'connect.challenge') {
      clearTimeout(this._timer);
      this._timer = null;
      this._sendConnect(f.payload?.nonce ?? null);
      return;
    }

    if (f.type === 'res') {
      const p = this.pending.get(f.id);
      if (!p) return;
      this.pending.delete(f.id);
      f.ok ? p.resolve(f.payload) : p.reject(new Error(f.error?.message || 'failed'));
    }
  }

  _sendConnect(nonce) {
    const params = {
      minProtocol: 3, maxProtocol: 3,
      client: { id: 'synthetic-talents-box', version: '1.0.0', platform: 'node', mode: 'webchat' },
      role: 'operator',
      scopes: ['operator.admin'],
      auth: { token: GATEWAY_TOKEN },
    };
    if (nonce) params.nonce = nonce;

    this.request('connect', params)
      .then(() => {
        console.log('[openclaw] authenticated ✓');
        this.connected = true;
        ocConnected    = true;
        this.backoffMs = 2000;
        this._poll();
      })
      .catch(err => {
        console.log(`[openclaw] auth failed: ${err.message}`);
        this.ws?.close();
      });
  }

  async _poll() {
    if (!this.connected) return;
    try {
      const [ar, sr] = await Promise.all([
        this.request('agents.list', {}),
        this.request('sessions.list', { includeGlobal: true, includeUnknown: false }),
      ]);
      if (ar?.agents)   ocAgents   = ar.agents;
      if (sr?.sessions) ocSessions = sr.sessions;
    } catch (err) {
      console.log(`[openclaw] poll error: ${err.message}`);
    }
  }

  request(method, params) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('not connected'));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  _flush(err) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }
}

const ocClient = new OpenClawClient();
ocClient.start();

// ============================================================
// Simulation tick
// ============================================================
function tick() {
  let agents;
  if (ocConnected && ocAgents.length > 0) {
    agents = buildAgentsFromOpenClaw();
  } else {
    tickMock();
    agents = mockAgents;
  }
  io.emit('simulation_tick', agents);
}

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  const agents = (ocConnected && ocAgents.length > 0)
    ? buildAgentsFromOpenClaw()
    : mockAgents;
  socket.emit('simulation_tick', agents);
});

// Poll OpenClaw on the same cadence as the tick
setInterval(() => { if (ocClient.connected) ocClient._poll(); }, 3000);
setInterval(tick, 3000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Synthetic Talents Box running at http://localhost:${PORT}`);
  console.log(`OpenClaw gateway: ${GATEWAY_URL}`);
});
