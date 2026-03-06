# Jarvis

OpenClaw gateway running in Docker.

## Setup

```sh
cp .env.example .env
```

Edit `.env` and fill in your tokens.

## Run

```sh
docker compose up -d --build
```

## Connect

1. Open [http://localhost:18789/overview](http://localhost:18789/overview)
2. Enter the `OPENCLAW_GATEWAY_TOKEN` from your `.env` when prompted
3. Approve the device pairing request inside the container:

```sh
docker exec openclaw openclaw devices list
docker exec openclaw openclaw devices approve <requestId>
```