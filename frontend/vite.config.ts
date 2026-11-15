import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В режиме разработки запросы /api проксируются на backend (uvicorn на порту 8000)
export default defineConfig({
  plugins: [react()],
  server: {
    // Явный IPv4-адрес: иначе на Windows Vite слушает только ::1, и Firefox получает «connection refused»
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
