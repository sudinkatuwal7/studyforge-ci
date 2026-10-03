import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Reuse the app's React setup and provide a browser-like DOM for the tests.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    env: { VITE_API_BASE_URL: "http://api.test/api/v1" },
    clearMocks: true,
    restoreMocks: true,
  },
}));
