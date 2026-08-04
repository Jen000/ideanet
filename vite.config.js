import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site under /<repo>/, so production assets need
// that base path or they 404 (blank page). Dev stays at "/". Override with
// VITE_BASE if the repo is renamed or served from a custom domain / root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? process.env.VITE_BASE ?? "/ideanet/" : "/",
  // amazon-cognito-identity-js references Node's `global`, absent in browsers.
  define: { global: "globalThis" },
  plugins: [react()],
}));
