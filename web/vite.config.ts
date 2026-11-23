import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Plotly is one large lazy chunk (about 1.2 MB, bundled locally: no CDN).
  build: { chunkSizeWarningLimit: 1300 },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
