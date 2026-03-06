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


let ocAgents    = [];  // raw GatewayAgentRow[]
let ocSessions  = [];  // raw GatewaySessionRow[]
let ocConnected = false;

const ocSessionUptime  = {};  // sessionKey → seconds
const ocAgentHistory   = {};  // sessionKey → [{time, text}] from real chat.history

function resolveAgentIdFromKey(key) {
  // Session key format: "agent:{agentId}:{sessionName}" or "{agentId}:..."
  // The literal prefix "agent" is a scope marker, not the agent ID.
  if (!key) return 'default';
  const parts = key.split(':').filter(Boolean);
  if (parts[0] === 'agent' && parts.length >= 2) return parts[1];
  return parts[0] || 'default';
}

function buildAgentsFromOpenClaw() {
  const now = Date.now();
  const ACTIVE_MS = 60 * 1000; // 60 seconds = recently active → WORKING

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

    // Use last real message timestamp if available, otherwise session updatedAt
    const history = ocAgentHistory[key] || [];
    const lastMsgTime = history.length > 0 ? new Date(history[0].time).getTime() : 0;
    const lastActivity = Math.max(lastMsgTime, sess?.updatedAt || 0);
    const isWorking = lastActivity > 0 && (now - lastActivity) < ACTIVE_MS;
    const state = isWorking ? 'WORKING' : 'SLEEPING';

    // CPU from token fill %
    let cpu = isWorking ? (Math.floor(Math.random() * 40) + 20) : 2;
    if (isWorking && sess && sess.totalTokens && sess.contextTokens) {
      cpu = Math.min(95, Math.round((sess.totalTokens / sess.contextTokens) * 100));
    }

    // Uptime
    ocSessionUptime[key] = (ocSessionUptime[key] || Math.floor(Math.random() * 600)) + 3;

    const displayName = (agent.identity?.name || agent.name || agent.id).toUpperCase();

    return {
      id: `agent-${i}`,
      name: displayName,
      state,
      cpu,
      containerId: key,
      thoughts: history,
      uptime: ocSessionUptime[key],
      source: 'openclaw',
      sessionKey: sess?.key || `agent:${agent.id}:main`,
    };
  });

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

    if (f.type === 'event' && f.event === 'chat') {
      const payload = f.payload;
      const runId = payload?.runId;
      if (runId) {
        const sub = chatSubscriptions.get(runId);
        if (sub) {
          const state = payload.state;
          const text = payload.message?.content?.[0]?.text || '';
          if (state === 'delta') {
            io.to(sub).emit('chat_stream', { type: 'delta', runId, text });
          } else if (state === 'final') {
            io.to(sub).emit('chat_stream', { type: 'final', runId, text });
            chatSubscriptions.delete(runId);
          } else if (state === 'error') {
            io.to(sub).emit('chat_stream', { type: 'error', runId, error: payload.errorMessage });
            chatSubscriptions.delete(runId);
          }
        }
      }
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
      client: { id: 'node-host', version: '1.0.0', platform: 'node', mode: 'backend' },
      role: 'operator',
      scopes: ['operator.admin'],
      auth: { token: GATEWAY_TOKEN },
    };

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
      if (ar?.agents)   { ocAgents   = ar.agents; }
      if (sr?.sessions) { ocSessions = sr.sessions; }

      // Fetch real chat history for each session
      const sessions = sr?.sessions || [];
      await Promise.all(sessions.slice(0, 6).map(async (sess) => {
        if (!sess.key) return;
        try {
          const hr = await this.request('chat.history', { sessionKey: sess.key, limit: 20 });
          if (hr?.messages) {
            ocAgentHistory[sess.key] = hr.messages
              .filter(m => m.role === 'assistant' || m.role === 'user')
              .map(m => ({
                time: m.timestamp || new Date().toISOString(),
                text: `[${m.role}] ${(m.content?.[0]?.text || '').slice(0, 120)}`,
              }));
          }
        } catch {
          // session may have no history yet
        }
      }));
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

// runId → socket.id — tracks which browser socket is waiting for a chat run
const chatSubscriptions = new Map();

function mockStreamResponse(socket, prompt) {
  const runId = randomUUID();
  const words = [
    'Processing:', `"${prompt}"`, '\n\n',
    'Analyzing', 'request', 'parameters...', '\n',
    'Decomposing', 'goal', 'hierarchy...', '\n',
    'Generating', 'candidate', 'solutions...', '\n\n',
    'Task', 'acknowledged.', 'I\'ve', 'processed', 'your', 'request',
    'and', 'will', 'begin', 'execution', 'shortly.',
  ];
  socket.emit('chat_ack', { runId });
  let i = 0, acc = '';
  const iv = setInterval(() => {
    if (i >= words.length) {
      socket.emit('chat_stream', { type: 'final', runId, text: acc.trim() });
      clearInterval(iv);
      return;
    }
    const w = words[i++];
    acc += (acc && !acc.endsWith('\n') ? ' ' : '') + w;
    socket.emit('chat_stream', { type: 'delta', runId, text: acc });
  }, 90);
}

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

  socket.on('agent_create', async ({ name, emoji }) => {
    if (!ocClient.connected) {
      socket.emit('agent_create_error', { error: 'OpenClaw not connected' });
      return;
    }
    const safeName = String(name || '').trim();
    if (!safeName) {
      socket.emit('agent_create_error', { error: 'name is required' });
      return;
    }
    const agentId = safeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    try {
      const res = await ocClient.request('agents.create', {
        name: safeName,
        workspace: `~/.openclaw/workspace/${agentId}`,
        ...(emoji ? { emoji: String(emoji).trim() } : {}),
      });
      socket.emit('agent_created', { ok: true, agentId: res?.agentId || agentId, name: safeName });
    } catch (err) {
      socket.emit('agent_create_error', { error: err.message });
    }
  });

  socket.on('chat_send', async ({ agentId, sessionKey, prompt }) => {
    if (ocClient.connected && sessionKey) {
      const idempotencyKey = randomUUID();
      try {
        const res = await ocClient.request('chat.send', {
          sessionKey,
          message: prompt,
          idempotencyKey,
        });
        const runId = res?.runId || idempotencyKey;
        chatSubscriptions.set(runId, socket.id);
        socket.emit('chat_ack', { runId });
      } catch (err) {
        socket.emit('chat_stream', { type: 'error', error: err.message });
      }
    } else {
      mockStreamResponse(socket, prompt);
    }
  });
});

// Poll OpenClaw on the same cadence as the tick
setInterval(() => { if (ocClient.connected) ocClient._poll(); }, 3000);
setInterval(tick, 3000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Synthetic Talents Box running at http://localhost:${PORT}`);
  console.log(`OpenClaw gateway: ${GATEWAY_URL}`);

  if (process.env.TUNNEL === 'true') {
    const { tunnelmole } = require('tunnelmole');
    const url = await tunnelmole({ port: PORT });
    console.log(`Public URL: ${url}`);
  }
});
