import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.spec.ts"],
    setupFiles: ["tests/support/integration-setup.ts"],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/support/server-only.ts"),
    },
  },
});
