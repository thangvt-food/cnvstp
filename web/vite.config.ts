import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Repo GitHub Pages: https://thangvt-food.github.io/cnvstp/
export default defineConfig({
  base: '/cnvstp/',
  plugins: [react()],
})
