import type { ChannelCapabilities, ChannelMeta, ChannelPlugin } from "openclaw/plugin-sdk";

/**
 * WebSpatial Command Center channel plugin.
 *
 * This is a lightweight "presence" channel — it doesn't implement a traditional
 * inbound/outbound message monitor.  Instead it lets OpenClaw recognize messages
 * tagged with channel: "webspatial" and provides the metadata the gateway needs
 * to route events back to the Command Center UI connected via the standard WS API.
 *
 * Communication flow:
 *   Command Center → gateway WS (chat.send / exec.approval.resolve)
 *   gateway WS     → Command Center (agent events / exec.approval.requested)
 */

const WEBSPATIAL_META: ChannelMeta = {
  id: "webspatial",
  label: "WebSpatial Command Center",
  selectionLabel: "WebSpatial (XR Command Center)",
  detailLabel: "WebSpatial XR",
  docsPath: "/channels/webspatial",
  docsLabel: "webspatial",
  blurb: "visionOS spatial Command Center — direct gateway WebSocket UI.",
  systemImage: "square.grid.3x3.square",
  aliases: ["xr", "spatial"],
  order: 100,
};

const WEBSPATIAL_CAPABILITIES: ChannelCapabilities = {
  chatTypes: ["direct"],
  reactions: false,
  edit: false,
  unsend: false,
  reply: true,
  threads: false,
  media: false,
  nativeCommands: false,
  blockStreaming: false,
};

/** Minimal gateway methods exposed exclusively for the Command Center. */
export const WEBSPATIAL_GATEWAY_METHODS = [
  "webspatial.ping",
] as const;

export const webSpatialPlugin: ChannelPlugin = {
  id: "webspatial",
  meta: WEBSPATIAL_META,
  capabilities: WEBSPATIAL_CAPABILITIES,
  gatewayMethods: [...WEBSPATIAL_GATEWAY_METHODS],
  config: {
    listAccountIds: () => [],
    hasAccount: () => false,
    resolveAccount: async () => undefined,
  },
};
