import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Server tests build apps against a real database; under load (and on CI's
    // Postgres) some run past vitest's 5 s default. Same values CLAUDE.md
    // passes on the command line.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
