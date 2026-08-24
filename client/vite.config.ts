import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// PWA strategy per plan: generateSW, precache app shell + safety content,
// navigateFallback to index.html (denying /api/*), and runtime caching tuned
// per route class (catalog SWR, images cache-first, user data network-first,
// auth/ai/account network-only) plus a BackgroundSync queue for serve-log POSTs.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "blw-app",
        short_name: "blw-app",
        description: "Baby-led weaning companion — foods, recipes, pantry, and safety guidance.",
        theme_color: "#2f6f4f",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/(foods|recipes)(\/|$|\?)/,
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
            urlPattern: /^\/api\/(babies|pantry|favorites)(\/|$|\?)/,
            handler: "NetworkFirst",
            options: {
              cacheName: "user-data-cache",
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /^\/api\/(auth|ai|account)(\/|$|\?)/,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^\/api\/babies\/[^/]+\/serve-logs(\/|$|\?)/,
            handler: "NetworkOnly",
            method: "POST",
            options: {
              backgroundSync: {
                name: "serve-log-queue",
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
  server: {
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
