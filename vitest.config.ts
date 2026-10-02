import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/env.ts"],
    globalSetup: ["tests/setup/global.ts"],
    // Les tests d'intégration partagent une base PostgreSQL de test : exécution séquentielle.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
