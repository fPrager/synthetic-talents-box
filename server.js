const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

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

const agents = AGENT_NAMES.map((name, i) => ({
  id: `agent-${i}`,
  name,
  state: Math.random() > 0.3 ? 'WORKING' : 'SLEEPING',
  cpu: Math.floor(Math.random() * 60) + 10,
  containerId: `c${Math.random().toString(36).substr(2, 10)}`,
  thoughts: [],
  uptime: Math.floor(Math.random() * 3600),
}));

function randomThought() {
  const t = THOUGHT_POOL[Math.floor(Math.random() * THOUGHT_POOL.length)];
  return t.endsWith('#') ? t + Math.floor(Math.random() * 100) : t;
}

function tick() {
  agents.forEach(agent => {
    // Random state toggle (20% chance)
    if (Math.random() < 0.2) {
      agent.state = agent.state === 'WORKING' ? 'SLEEPING' : 'WORKING';
    }
    // CPU drift
    if (agent.state === 'WORKING') {
      agent.cpu = Math.min(95, Math.max(5, agent.cpu + (Math.random() * 20 - 10)));
    } else {
      agent.cpu = Math.max(0, Math.min(5, agent.cpu * 0.5));
    }
    agent.cpu = Math.round(agent.cpu);
    // New thought for working agents
    if (agent.state === 'WORKING') {
      agent.thoughts.unshift({ time: new Date().toISOString(), text: randomThought() });
      if (agent.thoughts.length > 50) agent.thoughts.pop();
    }
    agent.uptime += 3;
  });

  io.emit('simulation_tick', agents);
}

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  // Send initial state
  socket.emit('simulation_tick', agents);
});

setInterval(tick, 3000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Synthetic Talents Box running at http://localhost:${PORT}`);
});
