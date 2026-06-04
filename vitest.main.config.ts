import { defineConfig } from "vitest/config";
import { resolve } from "path";

// Separate config for main-process (Electron main) tests.
// Runs in node environment without the renderer's jsdom/testing-library setup.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/main/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
});
