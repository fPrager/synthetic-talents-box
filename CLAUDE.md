# Synthetic Talents Box — Agent Instructions

## App setup

Before running the app, create `app/.env` if it does not exist:

```
OPENCLAW_GATEWAY_URL=ws://localhost:18789
OPENCLAW_GATEWAY_TOKEN=<token>
PORT=3001
TUNNEL=true
```

### Finding the token

Read it from the local OpenClaw config:

```bash
cat ~/.openclaw/openclaw.json
```

Look for `gateway.auth.token`. Use that value as `OPENCLAW_GATEWAY_TOKEN`.

### Full setup command

```bash
cd app
cp /dev/null .env   # or create fresh
echo "OPENCLAW_GATEWAY_URL=ws://localhost:18789" >> .env
echo "OPENCLAW_GATEWAY_TOKEN=$(node -e "console.log(require(process.env.HOME+'/.openclaw/openclaw.json').gateway.auth.token)")" >> .env
echo "PORT=3001" >> .env
echo "TUNNEL=true" >> .env
```

## Running the app

```bash
./launch.sh
```

This installs dependencies, starts the server, connects to the local OpenClaw gateway, and prints a public tunnel URL.

Set `TUNNEL=false` in `app/.env` to run locally only.
