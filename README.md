# CNVSTP — Ghi nhận đếm tế bào nấm men

Web app ghi số liệu đếm tế bào nấm men bằng **buồng đếm hồng cầu (Neubauer)**, tự tính nồng độ và vẽ **đường cong sinh trưởng theo thang log₁₀**.

- Nhập: thời gian đo, số tế bào của **5 ô** (mỗi ô gồm 16 ô nhỏ), hệ số pha loãng `10ⁿ` (mặc định `10⁰` — không pha loãng).
- Kết quả: `N (tế bào/mL) = (Σ tế bào ÷ 80 ô nhỏ) × 4000 × 1000 × hệ số pha loãng` (buồng đếm Neubauer sâu 0,1 mm; 5 ô × 16 ô nhỏ 0,05 × 0,05 mm = 80 ô nhỏ, thể tích 1 ô nhỏ = 2,5×10⁻⁴ µL).
- Biểu đồ: trục Y log₁₀ nồng độ, trục X giờ kể từ lần đo đầu (tự tính từ thời gian nhập).
- Nhật ký số liệu: sửa / xóa từng lần đo, xuất CSV.
- Giao diện mobile-first, phong cách khoa học tối giản.

## Cấu trúc

```
web/                    # App React + Vite + TypeScript
  src/                  # Source
.github/workflows/      # CI: build + deploy GitHub Pages
```

## Chạy local

```bash
cd web
npm install
npm run dev
```

## Deploy lên GitHub Pages

1. Push code lên branch `main` của repo `thangvt-food/cnvstp`:

   ```bash
   git remote add origin https://github.com/thangvt-food/cnvstp.git
   git push -u origin main
   ```

2. Trên GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflow tự chạy khi push. Trang web tại: **https://thangvt-food.github.io/cnvstp/**
