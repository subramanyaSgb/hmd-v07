import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    css: false,
    // Avoid Vite's import.meta.env reads from leaking into tests.
    // The api util reads VITE_API_URL; tests provide their own mocks.
  },
})
