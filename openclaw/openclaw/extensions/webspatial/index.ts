import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { webSpatialPlugin } from "./src/channel.js";

const plugin = {
  id: "webspatial",
  name: "WebSpatial Command Center",
  description: "WebSpatial XR Command Center channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: webSpatialPlugin });
  },
};

export default plugin;