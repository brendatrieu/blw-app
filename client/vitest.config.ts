import { defineConfig } from "vitest/config";

export default defineConfig({
  // `__APP_VERSION__` is a build-time define in vite.config.ts (the
  // react-query cache buster). Tests never bundle through that config, so
  // without this a render of any component that prints it — MorePage's
  // footer — throws ReferenceError instead of rendering.
  define: {
    __APP_VERSION__: JSON.stringify("test"),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});
