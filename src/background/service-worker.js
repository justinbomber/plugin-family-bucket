import { createPluginManager } from "./plugin-manager.js";
import { attachMessageRouting } from "./message-router.js";

const manager = createPluginManager();
attachMessageRouting(manager);

async function boot() {
  await manager.init();
  globalThis.__mdMarkdownSuiteBooted = true;
}

boot().catch((error) => {
  console.error("[plugin-family-bucket] boot failed:", error);
});
