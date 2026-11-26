import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Điều Khoản Dịch Vụ (Terms of Service) — PokeNyan',
  description:
    'Điều khoản sử dụng chính thức cho Discord Bot và Web Portal cộng đồng PokeNyan.',
};

export default function TermsPage() {
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
          href="/privacy"
          className="text-xs font-semibold text-indigo-300 underline-offset-4 hover:text-indigo-200 hover:underline"
        >
          Xem Chính Sách Bảo Mật (Privacy Policy) →
        </Link>
      </div>

      <article className="rpg-card space-y-6 rounded-3xl p-6 sm:p-8">
        <header className="border-b border-slate-800 pb-5">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-200">
            <FileText className="h-3.5 w-3.5" />
            Terms of Service
          </div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            Điều Khoản Dịch Vụ — PokeNyan
          </h1>
          <p className="mt-1.5 text-xs text-slate-400">
            Cập nhật lần cuối: 26/11/2026 • Áp dụng cho Discord Bot PokeNyan và Web Portal
          </p>
        </header>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-base font-bold text-white">
            1. Chấp Nhận Điều Khoản (Acceptance of Terms)
          </h2>
          <p>
            Khi thêm bot <strong>PokeNyan</strong> vào máy chủ Discord của bạn hoặc sử dụng bất
            kỳ lệnh, nút tương tác hay trang web nào của PokeNyan, bạn đồng ý tuân thủ các Điều
            Khoản Dịch Vụ này cũng như{' '}
            <a
              href="https://discord.com/terms"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-300 underline underline-offset-2 hover:text-indigo-200"
            >
              Điều khoản dịch vụ của Discord
            </a>{' '}
            và Nguyên tắc cộng đồng của Discord.
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-base font-bold text-white">
            2. Dự Án Fan-Made Phi Lợi Nhuận (Non-Profit Disclaimer)
          </h2>
          <p>
            <strong>PokeNyan</strong> là một dự án giải trí cộng đồng phi lợi nhuận do người hâm
            mộ phát triển, <strong>không liên kết, không được tài trợ hay chứng thực</strong> bởi
            Nintendo, Creatures Inc., GAME FREAK hoặc The Pokémon Company. Toàn bộ tên gọi, hình
            ảnh và thương hiệu Pokémon thuộc quyền sở hữu của chủ sở hữu bản quyền tương ứng.
          </p>
          <p>
            Tiền tệ ảo (<em>PokéCoins</em>), vật phẩm và Pokémon trong bot không có giá trị quy
            đổi thành tiền thật. Mọi khoản ủng hộ tự nguyện (nếu có) chỉ nhằm mục đích duy trì hạ
            tầng máy chủ và không phải giao dịch mua bán vật phẩm.
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-base font-bold text-white">
            3. Quy Tắc Chơi Công Bằng (Fair Play &amp; Prohibited Conduct)
          </h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Nghiêm cấm sử dụng self-bot, macro, auto-clicker, script tự động hóa hoặc bất kỳ
              công cụ gian lận nào để tương tác với PokeNyan.
            </li>
            <li>
              Nghiêm cấm cố tình khai thác lỗi hệ thống (nhân bản vật phẩm, gian lận tiền tệ) hoặc
              gửi yêu cầu hàng loạt gây quá tải máy chủ.
            </li>
            <li>
              Nghiêm cấm mua bán tài khoản, vật phẩm hoặc tiền ảo trong PokeNyan bằng tiền thật.
            </li>
          </ul>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-base font-bold text-white">
            4. Quyền Quản Lý &amp; Tính Sẵn Sàng Của Dịch Vụ (Service Availability)
          </h2>
          <p>
            Dịch vụ được cung cấp theo hiện trạng (<em>&quot;as-is&quot;</em>). Quản trị viên có
            quyền cập nhật cân bằng trò chơi, bảo trì hệ thống, giới hạn truy cập hoặc khóa vĩnh
            viễn các tài khoản/máy chủ vi phạm điều khoản mà không cần báo trước.
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-base font-bold text-white">
            5. Thay Đổi Điều Khoản &amp; Liên Hệ (Updates &amp; Contact)
          </h2>
          <p>
            Chúng tôi có thể cập nhật Điều Khoản Dịch Vụ theo sự phát triển của cộng đồng. Nếu bạn
            có thắc mắc, khiếu nại bản quyền hoặc yêu cầu hỗ trợ, vui lòng liên hệ trực tiếp với
            Quản trị viên của bot PokeNyan thông qua máy chủ Discord hỗ trợ chính thức.
          </p>
        </section>

        <footer className="flex items-center gap-2 border-t border-slate-800 pt-4 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>PokeNyan • Dự án cộng đồng phi lợi nhuận, không liên kết với Nintendo.</span>
        </footer>
      </article>
    </main>
  );
}
