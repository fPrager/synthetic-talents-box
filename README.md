# Synthetic Talents Box

![Preview](img/preview.png)

> **Hackday Berlin** — A gamified, animated observability dashboard for [OpenClaw](https://docs.openclaw.ai/) agent environments.

---

## What Is This?

**Synthetic Talents Box** is a real-time, browser-based status screen that turns your OpenClaw agent fleet into a **virtual open-plan office** — full of little digital colleagues going about their day.

Instead of staring at dry metrics and log lines, you get to *watch your agents live their lives*: spawning at their desks in the morning, furiously typing when busy, nervously glancing at the clock when idle, and visibly stressed when their context window is buried under a towering pile of paperwork.

It's observability — but make it cute.

---

## The Concept

Each **OpenClaw agent** maps to a **desk in an animated office floor**. The agent's real-time state drives everything you see:

| Agent State | Office Scene |
|---|---|
| **Spawning** | A new colleague walks in, hangs up their coat, sits down |
| **Busy / Working** | Typing furiously, multiple browser tabs open, coffee going cold |
| **Waiting for user input** | Leaning back, tapping fingers, staring at an empty chat bubble |
| **Idle / Parked** | Head down on keyboard, "Zzzz" bubble, screensaver running |
| **Context window filling up** | Papers, folders and sticky notes pile up around the desk — the agent starts looking more and more stressed |
| **Context window near limit** | Desk completely buried, agent visibly sweating, papers flying |
| **Session terminated** | Colleague packs up their bag, waves goodbye, desk goes dark |
| **Error / Crash** | Agent slumps off their chair, red error light flashes on the desk |

The overall **floor view** gives you a bird's-eye glance at the health of your whole agent fleet at once — how many are working, how many are idle, who's about to have a meltdown.

---

## Core Features

### The Office Floor
- Animated grid of desks, one per active agent session
- Agents appear and disappear dynamically as sessions are spawned and pruned
- Floor "fills up" during peak load, empties out during quiet periods

### Per-Agent Desk View
- Click any desk to zoom into that agent's personal workspace
- See a simplified activity feed (what tools are being called, what the agent is doing)
- Context window displayed as a physical pile of documents — watch it grow in real time

### Stress System
- Agents accumulate "stress" based on context window fill %, session age, and error count
- Visual cues: disheveled hair sprite, faster typing animation, twitchy movements
- A pressure gauge on each desk goes from green to yellow to red

### Office Events
- "New hire!" toast notification when an agent spawns
- "Gone home!" when a session ends cleanly
- "System meltdown!" alert when an agent errors out
- Optional sound effects (typing, coffee sips, paper rustling)

### Floor Stats Bar
- Total agents: active / idle / waiting
- Busiest agent (most tool calls per minute)
- Average context window fill across all agents
- Uptime ticker

---

## Data Source

This dashboard connects to the **OpenClaw Gateway** observability endpoints:

- **Agent / session list** — enumerate active sessions and their metadata
- **Agent state polling** — current execution state per session (idle, running, waiting)
- **Context / message stream** — message count and token usage per session
- **Health & status** — gateway-level health checks

See [OpenClaw docs](https://docs.openclaw.ai/) and the OpenAPI spec at `/api-reference/openapi.json` on your gateway instance.

> The dashboard is read-only — it only observes, never interferes with agent sessions.

---

## Tech Stack (Proposed)

| Layer | Choice | Reason |
|---|---|---|
| Frontend | **React + Vite** | Fast iteration, component-per-desk model |
| Animation | **Framer Motion** or CSS sprites | Smooth state transitions without heavy deps |
| Real-time | **SSE / WebSocket** from OpenClaw gateway | Low-latency state updates |
| Styling | **Tailwind CSS** | Quick pixel-art / retro office aesthetic |
| State management | **Zustand** | Lightweight, fits the agent-per-store model |

Optional stretch: pixel-art sprite sheet for the agent characters (Aseprite or Figma pixel grid).

---

## Project Structure (Planned)

```
synthetic-talents-box/
├── README.md
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── OfficeFloor.tsx        # The main grid of desks
│   │   │   ├── AgentDesk.tsx          # Individual animated desk
│   │   │   ├── StressGauge.tsx        # Context window fill indicator
│   │   │   ├── PaperPile.tsx          # Animated document stack
│   │   │   └── EventToast.tsx         # Spawn/die/error notifications
│   │   ├── hooks/
│   │   │   └── useOpenClawStream.ts   # SSE/polling hook for agent states
│   │   ├── store/
│   │   │   └── agentStore.ts          # Zustand store, one entry per agent
│   │   └── App.tsx
│   └── package.json
└── docs/
    └── agent-state-map.md             # How OpenClaw states map to visuals
```

---

## Hackday Scope

**Must have (MVP):**
- [ ] Connect to a live OpenClaw gateway and list active sessions
- [ ] Office floor grid with one desk per agent
- [ ] At least 3 animated states: busy, idle/waiting, terminated
- [ ] Paper pile that grows with context window fill %
- [ ] Basic stress indicator

**Nice to have:**
- [ ] Pixel-art character sprites with multiple animation frames
- [ ] Sound effects toggle
- [ ] Zoom-in desk detail view
- [ ] "Employee of the Month" board — most tool calls, longest session, etc.
- [ ] "Hire / Fire" easter egg buttons (purely cosmetic, no actual agent control)

**Out of scope:**
- Any write operations to OpenClaw (this is observation only)
- Auth / multi-gateway support
- Mobile layout

---

## Getting Started (once scaffolded)

```bash
# Install dependencies
cd frontend && npm install

# Point at your local OpenClaw gateway
cp .env.example .env
# set VITE_OPENCLAW_BASE_URL=http://localhost:PORT

# Run the dev server
npm run dev
```

---

## Team

Built with coffee and mild existential dread at **Hackday Berlin**.

---

*"If your agents could see this dashboard, they'd probably unionize."*
