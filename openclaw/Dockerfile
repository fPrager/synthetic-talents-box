FROM node:22-slim

RUN apt-get update && apt-get install -y lsof git && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

COPY openclaw /opt/openclaw
RUN cd /opt/openclaw && pnpm install && pnpm build && pnpm ui:build && npm install -g .

ENV HOME=/home/node
ENV TERM=xterm-256color

RUN mkdir -p /home/node/.openclaw/workspace \
    && chown -R node:node /home/node

USER root