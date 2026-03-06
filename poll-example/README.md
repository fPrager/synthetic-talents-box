# poll-example

A live demo of the Synthetic Talents Box concept: a Phaser game showing your local OpenClaw agents as office workers at desks.

## How it works

- **Server** (`server/index.js`) — reads `~/.openclaw/agents/*/sessions/sessions.json` every 3s, diffs state, emits Socket.io events
- **Client** (`client/`) — Vite + Phaser game that listens for socket events and renders one animated desk per agent

No OpenClaw API auth needed — reads the local session file directly.

## Setup

```bash
# Install root deps (express, socket.io, concurrently)
npm install

# Install client deps (phaser, socket.io-client, vite)
cd client && npm install && cd ..
```

## Run

```bash
npm run dev
```

Opens:
- Bridge server: `http://localhost:3333`
- Phaser game: `http://localhost:5173`

## Session states derived from `updatedAt`

| Time since last update | State shown |
|---|---|
| < 1 minute | running (green, typing animation) |
| 1–5 minutes | waiting (yellow, tapping fingers) |
| > 5 minutes | idle (blue, head on desk) |
| `abortedLastRun: true` | error (red, slumped) |

## Context fill bar

Color codes the token usage vs context window:
- Green < 50%
- Orange 50–75%
- Red-orange 75–90%
- Red > 90%

Paper stack emoji appears at >50% fill.
