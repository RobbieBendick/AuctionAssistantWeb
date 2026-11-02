import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { marketMiddleware } from "./server/market.js";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "auction-market",
      configureServer(server) {
        server.middlewares.use(marketMiddleware);
      },
    },
  ],
  base: process.env.PAGES ? "/AuctionAssistantWeb/" : "/",
  server: {
    proxy: {
      "/api/ledger": "http://127.0.0.1:4317",
      "/api/icon": "http://127.0.0.1:4317",
      "/icon": "http://127.0.0.1:4317",
    },
  },
});
