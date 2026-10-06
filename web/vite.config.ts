import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Repo GitHub Pages: https://thangvt-food.github.io/cnvstp/
export default defineConfig({
  base: '/cnvstp/',
  plugins: [react(), tailwindcss()],
})
