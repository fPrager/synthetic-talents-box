# talent-hooker-debug

A minimal Node.js debug server that receives OpenClaw hook events and displays them live in the browser.

## How it works

- Listens for `POST /agent-event` from the `talent-hooker` hook
- Streams incoming events to the browser via SSE
- Serves a log UI at `http://localhost:3000`

## Setup

```bash
cd talent-hooker-debug
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

## Custom port

```bash
PORT=4000 npm start
```

If you change the port, update the URL in `talent-hooker/handler.ts` to match.

## What you'll see

Each incoming hook event appears as a row:

| Column | Description |
|---|---|
| received at | Timestamp the bridge received the event |
| session | OpenClaw session key |
| event type | e.g. `message:received`, `command:stop` |
| payload | Any extra fields in the POST body |

Event types are colour-coded: green for spawns, red for stops, blue for messages, yellow for compaction.

## Controls

- **Filter** — type a session key or event type to narrow the log
- **Pause** — stop adding new rows (events are still received, just not shown)
- **Clear** — wipe the log

## Typical setup

Run this alongside OpenClaw and install the hook:

```
OpenClaw  -->  talent-hooker/handler.ts  -->  POST /agent-event  -->  talent-hooker-debug  -->  browser
```

1. Start this server: `npm start`
2. Install the hook: `cp -r ../talent-hooker ~/.openclaw/hooks/state-notifier`
3. Start or use OpenClaw normally
4. Watch events appear in the browser at `http://localhost:3000`
