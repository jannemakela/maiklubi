import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    reporters: ["verbose"],
    testTimeout: 30_000,
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
});
