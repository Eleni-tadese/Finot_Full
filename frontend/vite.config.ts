import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// The frontend talks to the backend directly via VITE_API_URL (see .env.example).
// There is no dev proxy anymore.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5176,
    open: true,
  },
})
