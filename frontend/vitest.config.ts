import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Reuse the app's React setup and provide a browser-like DOM for the tests.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: "jsdom",
  },
}));
