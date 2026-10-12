import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "es2022" },
  server: {
    host: process.env.HOST || "127.0.0.1",
    port: +(process.env.PASEO_PORT || process.env.PORT || 5173),
    strictPort: true,
    allowedHosts: true,
  },
});
