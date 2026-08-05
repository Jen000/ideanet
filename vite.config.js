import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync } from "fs";
import { resolve } from "path";

// Clean URLs (history routing) need a fallback for deep-link refreshes on
// GitHub Pages: Pages serves 404.html for any unknown path, so making it a copy
// of index.html boots the SPA and the router reads the URL. No server config.
function spaFallback() {
  return {
    name: "spa-404-fallback",
    closeBundle() {
      const dir = resolve("dist");
      const index = resolve(dir, "index.html");
      if (existsSync(index)) copyFileSync(index, resolve(dir, "404.html"));
    },
  };
}

// GitHub Pages serves a project site under /<repo>/, so production assets need
// that base path or they 404 (blank page). Dev stays at "/". Override with
// VITE_BASE if the repo is renamed or served from a custom domain / root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? process.env.VITE_BASE ?? "/ideanet/" : "/",
  // amazon-cognito-identity-js references Node's `global`, absent in browsers.
  define: { global: "globalThis" },
  plugins: [react(), spaFallback()],
}));
