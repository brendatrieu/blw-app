/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Injected by vite.config.ts's `define` from client/package.json's version,
// so the About/More footer can show a build version without importing JSON
// across the tsconfig `rootDir` boundary.
declare const __APP_VERSION__: string;
