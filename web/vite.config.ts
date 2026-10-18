import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Custom domain: cnvstp.yangio.id.vn → site phục vụ ở GỐC domain nên base = '/'.
// Domain phải khai báo TAY ở repo Settings → Pages → Custom domain: deploy bằng GitHub Actions
// nên file CNAME trong artifact bị GitHub bỏ qua (xem domain.md §4.2).
// URL cũ https://thangvt-food.github.io/cnvstp/ sẽ redirect sang custom domain sau khi khai báo.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
})
