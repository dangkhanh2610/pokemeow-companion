# PokéMeow Companion (Two-Way Web Control + Official Discord Helper Bot)

Hệ sinh thái hỗ trợ chơi **PokéMeow** hoàn chỉnh gồm **Discord Companion Bot chính thức** và **Web Dashboard đồng bộ 2 chiều** trên cùng lõi tính toán thuần TypeScript (`src/domain/`).

> **Cam kết an toàn & Tuân thủ ToS:** Bot chạy trên Bot Account chính thức (`discord.js`), **không** dùng self-bot, **không** tự gõ lệnh hay bấm nút thay người chơi, và **không** giải CAPTCHA (chỉ gửi chuông báo động nhắc bạn dừng tay tự nhập mã).

---

## 1. Khởi chạy

Mở 2 cửa sổ Terminal tại `c:\Pokemeow`:

**Terminal 1 — Đăng ký 12 Slash Commands & Chạy Discord Bot:**
```powershell
npm run bot:register
npm run bot:dev
```

**Terminal 2 — Chạy Trung tâm Điều khiển Web (`http://localhost:3000`):**
```powershell
npm run dev
```

---

## 2. Toàn bộ 12 Slash Commands trên Discord

| Lệnh | Tham số / Lệnh con | Công dụng |
| :--- | :--- | :--- |
| `/helper` | `on [auto_clean_sec] [only_rare_plus]` / `off` / `status` | Bật gợi ý bóng EV, tự động dọn tin nhắn chống trôi chat, tách biệt nhiều người chơi cùng kênh, cảnh báo CAPTCHA. |
| `/dex` | `pokemon:<tên tiếng Anh>` | Tra cứu hệ Pokémon, điểm yếu **khắc chế x4 / x2** khi đấu `;b` (Battle/Gym) và kiểm tra loài Gen 6–7 khó bắt. |
| `/leaderboard` | `coins [window]` / `hof` / `pity` | Đua Top cày xu mặt Server, xem **Bảo Tàng Hàng Hiếm (Hall of Fame)** và bảng xếp hạng **Độ Đen (Pity)**. |
| `/quest` | `view` / `clear` | Theo dõi thanh tiến độ **Daily Quests** (tự đồng bộ khi bạn gõ `;q` và báo ngay khi hoàn thành). |
| `/goldenhour` | `status` / `set hours minutes` / `cancel` | Hẹn báo thức trước **5 phút** và đúng giờ bắt đầu **Golden Fishing Hour** (tự động đọc khi gõ `;seaflute`). |
| `/cb` | `status` / `set hours minutes` / `cancel` | Hẹn giờ thu hoạch **CatchBot (`;cb`)** (tự động đọc khi gõ `;cb` / `;cb run`). |
| `/profit` | `[window: 15m \| 1h \| today \| all]` | Tính nhanh **Lời/Lỗ Xu Mặt (`;release`)** vs **Tài Sản (`;market`)** và nhịp cày `con/giờ` · `PC/giờ`. |
| `/stats` | `summary` / `clean` / `reset` | Xem thống kê, **dọn riêng các bản ghi lỗi cũ (`clean`)** mà giữ nguyên lượt bắt thật, hoặc xoá trắng (`reset`). |
| `/ball` | `rarity`, `[gen]` | Bảng EV chi tiết cho tất cả loại bóng khi bắt Wild (`;p`). |
| `/fish` | `rarity`, `[rod]`, `[lure]`, `[golden_hour]` | Bảng EV câu cá (`;f`), so sánh **Diveball (85%)** với các bóng khác. |
| `/buffs` | `view` / `set` / `reset` | Chỉnh Amulet Coins, Clan CR, Patreon Ninja, Quick Hands, chế độ `release` / `market` và Cooldown. |
| `/log` | `source`, `rarity`, `ball`, `caught`, `[pokemon]` | Ghi nhận bổ sung thủ công. |

---

## 3. Deploy miễn phí lên Vercel + Neon PostgreSQL *(Khuyên dùng)*

Hệ thống tự động chọn **PostgreSQL (Prisma)** khi có biến `DATABASE_URL` (và tự lùi về file `data/bot-state.json` khi chạy cục bộ không có DB).

### Bước 1: Tạo Database PostgreSQL miễn phí trên Neon (không cần thẻ tín dụng)
1. Vào [neon.tech](https://neon.tech) → đăng nhập bằng GitHub/Google → **Create Project**.
2. Copy chuỗi **Connection String** (`postgresql://...`) và dán vào `DATABASE_URL=...` trong file `.env`.
3. Đẩy cấu trúc bảng lên Neon và chuyển toàn bộ lịch sử bắt cũ (nếu có) lên Database:
   ```powershell
   npm run db:push
   npm run db:migrate-json
   ```

### Bước 2: Deploy Web Dashboard lên Vercel (miễn phí, không ngủ)
1. Push dự án lên một repo **GitHub** (file `.env` đã bị `.gitignore` chặn nên không lo lộ token).
2. Vào [vercel.com](https://vercel.com) → **Add New Project** → chọn repo vừa tạo.
3. Trong mục **Environment Variables** trên Vercel, thêm biến:
   - `DATABASE_URL` = *(chuỗi PostgreSQL từ Neon ở Bước 1)*.
4. Bấm **Deploy** — xong! Web Dashboard của bạn chạy 24/7 tại `https://<ten-app>.vercel.app`.

### Bước 3: Chạy Discord Bot (đồng bộ tức thì với Web Vercel)
- Vì Vercel không chạy được tiến trình WebSocket 24/7, bạn chạy `npm run bot:dev` trên **PC khi chơi**, **điện thoại Android cũ (Termux)** hoặc **Google Cloud `e2-micro` Always Free** với cùng `DATABASE_URL` trong `.env`. Mọi lượt bắt và chỉnh sửa 2 chiều giữa Discord và Web Vercel sẽ đồng bộ tức thì qua Neon PostgreSQL!

---

## 4. Deploy chung trên 1 VPS (Oracle Cloud / Google Cloud / Ubuntu)

Dự án vẫn giữ sẵn cấu hình PM2 ([ecosystem.config.cjs](ecosystem.config.cjs)) và script ([deploy/oracle-setup.sh](deploy/oracle-setup.sh)) nếu bạn muốn chạy cả Bot + Web trên 1 VPS Linux.

---

## 5. Kiểm thử & Build

```powershell
npm run typecheck
npm test
npm run lint
npm run build
```
