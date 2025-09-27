import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  optimizeDeps: {
    include: ['@cosmjs/cosmwasm-stargate', '@cosmjs/proto-signing', 'long']
  }
})


