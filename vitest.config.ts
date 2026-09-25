import { defineConfig } from "vitest/config";

// Without this file vitest falls back to vite.config.ts, whose `root: "ui"`
// exists only to build the MCP Apps card bundle — tests live at the repo
// root, so pin vitest to the defaults here.
// Suffolk: write tools are hidden unless CW_ENABLE_WRITE_TOOLS=true; the
// upstream tests exercise them, so enable them for the test run. Compiled
// copies under dist/ are excluded.
export default defineConfig({
  test: {
    env: { CW_ENABLE_WRITE_TOOLS: "true" },
    exclude: ["node_modules/**", "dist/**"],
  },
});
