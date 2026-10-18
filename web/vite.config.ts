import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Custom domain: cnvstp.yangio.id.vn (xem public/CNAME) → site phục vụ ở GỐC domain nên base = '/'.
// URL cũ https://thangvt-food.github.io/cnvstp/ được GitHub tự redirect sang custom domain.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
})
