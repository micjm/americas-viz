import { defineConfig } from "vite";

const port = Number(process.env.PASEO_PORT || process.env.PORT || 5173);

export default defineConfig({
  build: { chunkSizeWarningLimit: 1500 },
  server: { host: process.env.HOST || "127.0.0.1", port, strictPort: true, allowedHosts: true },
  preview: { host: process.env.HOST || "127.0.0.1", port, strictPort: true, allowedHosts: true },
});
