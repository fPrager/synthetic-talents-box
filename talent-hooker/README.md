# talent-hooker

An OpenClaw hook that pushes agent state changes to the Synthetic Talents Box bridge server in real time.

## What it does

OpenClaw fires this hook on session and message events. The hook immediately POSTs the event to the bridge server running on `localhost:3000`, which then forwards it via Socket.io to the Phaser game client.

This gives the dashboard near-instant visual updates (typing animation, spawn/despawn, compaction stress spike) without waiting for the 5-second polling cycle.

## Installation

Copy the hook into your OpenClaw hooks directory:

```bash
cp -r talent-hooker ~/.openclaw/hooks/state-notifier
```

The directory must contain both files:

```
~/.openclaw/hooks/state-notifier/
├── HOOK.md       # event subscriptions metadata
└── handler.ts    # push logic
```

## Configuration

By default the hook posts to `http://localhost:3000/agent-event`. If your bridge runs on a different port, edit the URL in `handler.ts`:

```ts
await fetch('http://localhost:YOUR_PORT/agent-event', {
```

## Events pushed

| OpenClaw event | Game meaning |
|---|---|
| `agent:bootstrap` | Agent session starting — spawn character at desk |
| `command:new` | New session created — spawn character |
| `command:stop` | Session stopped — despawn character |
| `command:reset` | Session reset — restart character |
| `message:received` | Agent received input — switch to busy/typing |
| `message:sent` | Agent sent response — go idle or waiting |
| `session:compact:before` | Context compaction starting — stress spike |
| `session:compact:after` | Compaction done — stress relief animation |

## Failure handling

If the bridge server is not running, the hook silently swallows the error. No OpenClaw session is affected. The bridge's background poll (every 5s) will cover any missed events.

## Usage without the bridge

Start the bridge server first, then verify events are arriving:

```bash
# In the bridge directory
node server.js

# In another terminal, watch for incoming hook events
curl -s http://localhost:3000  # or check bridge console output
```

Once the bridge is running and the hook is installed, OpenClaw will push events automatically — no further setup needed.
