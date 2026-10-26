import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@domain": fileURLToPath(new URL("./lib", import.meta.url)),
    },
  },
  server: {
    port: 12000,
    host: true,
  },
});
