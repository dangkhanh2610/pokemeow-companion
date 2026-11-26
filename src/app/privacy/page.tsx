import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Chính Sách Bảo Mật (Privacy Policy) — PokeNyan',
  description:
    'Chính sách thu thập, sử dụng và bảo vệ dữ liệu người dùng của Discord Bot và Web Portal PokeNyan.',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-500/60 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại PokeNyan Portal
        </Link>
        <Link
          href="/terms"
          className="text-xs font-semibold text-indigo-300 underline-offset-4 hover:text-indigo-200 hover:underline"
        >
          Xem Điều Khoản Dịch Vụ (Terms of Service) →
        </Link>
      </div>

      <article className="rpg-card space-y-6 rounded-3xl p-6 sm:p-8">
        <header className="border-b border-slate-800 pb-5">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
            <Lock className="h-3.5 w-3.5" />
            Privacy Policy
          </div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            Chính Sách Bảo Mật — PokeNyan
          </h1>
          <p className="mt-1.5 text-xs text-slate-400">
            Cập nhật lần cuối: 26/11/2026 • Áp dụng cho Discord Bot PokeNyan và Web Portal
          </p>
        </header>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-base font-bold text-white">
            1. Dữ Liệu Chúng Tôi Thu Thập (Data We Collect)
          </h2>
          <p>
            Để vận hành trò chơi RPG và đồng bộ bảng xếp hạng, <strong>PokeNyan</strong> chỉ lưu
            trữ các thông tin tối thiểu sau khi bạn chủ động dùng lệnh của bot:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Thông tin định danh Discord công khai:</strong> Discord User ID, tên đăng
              nhập (Username), tên hiển thị (Display Name) và đường dẫn ảnh đại diện (Avatar URL).
            </li>
            <li>
              <strong>Thông tin cấu hình máy chủ:</strong> Discord Guild ID và trạng thái bật/tắt
              bot do Quản trị viên máy chủ thiết lập.
            </li>
            <li>
              <strong>Dữ liệu tiến trình trò chơi:</strong> Danh sách Pokémon đã bắt, chỉ số IV,
              túi vật phẩm (Poké Ball), số dư PokéCoins, cấp độ, điểm kinh nghiệm, chuỗi điểm danh
              và nhật ký giao dịch nội bộ (chống trùng lặp/chống gian lận).
            </li>
          </ul>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-base font-bold text-white">
            2. Dữ Liệu Chúng Tôi KHÔNG Thu Thập (Data We Do NOT Collect)
          </h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Không đọc, không ghi lại nội dung tin nhắn trò chuyện thông thường không phải lệnh bot.</li>
            <li>Không lưu trữ tin nhắn riêng tư (DM) ngoài phạm vi tương tác trực tiếp với bot.</li>
            <li>Không thu thập địa chỉ email, mật khẩu, số điện thoại hay thông tin thanh toán của bạn.</li>
          </ul>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-base font-bold text-white">
            3. Mục Đích Sử Dụng &amp; Lưu Trữ (How We Use &amp; Store Data)
          </h2>
          <p>
            Dữ liệu được lưu trữ an toàn trên cơ sở dữ liệu PostgreSQL (Neon) chỉ nhằm mục đích
            duy trì tiến trình chơi của bạn trên Discord và hiển thị Bảng Xếp Hạng / Hall of Fame
            trên Web Portal. Chúng tôi <strong>không bán, cho thuê hoặc chia sẻ</strong> dữ liệu
            người dùng cho bất kỳ bên thứ ba quảng cáo nào.
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-base font-bold text-white">
            4. Quyền Kiểm Soát &amp; Xóa Dữ Liệu (Data Deletion Rights)
          </h2>
          <p>
            Bạn có toàn quyền yêu cầu xóa vĩnh viễn hồ sơ huấn luyện viên và toàn bộ dữ liệu liên
            quan đến Discord User ID của mình bất cứ lúc nào bằng cách liên hệ với Quản trị viên
            của PokeNyan. Sau khi xác minh chính chủ, dữ liệu sẽ bị xóa hoàn toàn khỏi cơ sở dữ
            liệu trong vòng tối đa 7 ngày.
          </p>
        </section>

        <footer className="flex items-center gap-2 border-t border-slate-800 pt-4 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>PokeNyan • Tôn trọng quyền riêng tư và minh bạch dữ liệu người dùng.</span>
        </footer>
      </article>
    </main>
  );
}
