import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
  },
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
});
