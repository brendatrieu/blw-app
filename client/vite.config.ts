import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";
import {
  isCatalogRoute,
  isMealPostRoute,
  isNetworkOnlyRoute,
  isUserDataRoute,
} from "./src/pwa/route-matchers";

// Monorepo root (one level up from client/) — the safety library's
// `content/safety/*.mdx` glob import lives there, outside vite's default
// project root, so both dev-server fs access and the raw-string glob itself
// need it explicitly allow-listed.
const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

// PWA strategy per plan: generateSW, precache app shell + safety content,
// navigateFallback to index.html (denying /api/*), and runtime caching tuned
// per route class (catalog SWR, images cache-first, user data network-first,
// auth/ai/account network-only) plus a BackgroundSync queue for meal POSTs.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png", "icons/icon-maskable-512.png"],
      manifest: {
        name: "blw-app",
        short_name: "blw-app",
        description: "A calm, offline-friendly companion for baby-led weaning — foods, recipes, pantry, and safety guidance.",
        theme_color: "#fff6ea",
        background_color: "#fff6ea",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: isCatalogRoute,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "catalog-cache",
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: {
                maxEntries: 200,
              },
            },
          },
          {
            urlPattern: isUserDataRoute,
            handler: "NetworkFirst",
            options: {
              cacheName: "user-data-cache",
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: isNetworkOnlyRoute,
            handler: "NetworkOnly",
          },
          {
            urlPattern: isMealPostRoute,
            handler: "NetworkOnly",
            method: "POST",
            options: {
              backgroundSync: {
                name: "meal-queue",
                options: {
                  maxRetentionTime: 24 * 60,
                },
              },
            },
          },
        ],
      },
    }),
  ],
  define: {
    // The persisted react-query cache buster (see src/main.tsx): the
    // deploy commit SHA when available (set via Dockerfile ARG/ENV from
    // the GitHub Actions build-args), so it actually changes across
    // deploys. Falls back to the package version for local/dev builds,
    // where it previously always resolved anyway.
    __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 12) || `${pkg.version}-dev`),
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
