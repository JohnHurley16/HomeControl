import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// base "./" so the same build works at the container's root and under /local/cc/ in Home Assistant.
export default defineConfig({
  base: "./",
  plugins: [preact()],
  build: { target: "es2020", outDir: "dist", emptyOutDir: true },
  server: { port: 5173, host: true },
});
