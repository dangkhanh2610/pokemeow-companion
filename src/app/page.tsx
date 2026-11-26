import { Gamepad2, ShieldCheck, Terminal } from 'lucide-react';
import { CommunityPortalClient } from '@/components/CommunityPortalClient';
import { defaultCreatureCatalog, RARITY_CONFIGS } from '@/game/catalog/creature-catalog';
import { leaderboardService } from '@/game/services/leaderboard-service';
import type { CommunityOverview, LeaderboardEntry } from '@/game/types';

export const dynamic = 'force-dynamic';

const QUICK_COMMANDS: readonly { readonly cmd: string; readonly desc: string }[] = [
  { cmd: '/p  hoặc  ;p', desc: 'Gặp & bắt Pokémon hoang dã' },
  { cmd: '/shop  hoặc  ;shop', desc: 'Xem cửa hàng Poké Ball' },
  { cmd: '/buy  hoặc  ;buy pb 10', desc: 'Mua bóng nâng tỉ lệ bắt' },
  { cmd: '/daily  hoặc  ;daily', desc: 'Nhận thưởng điểm danh 24h' },
  { cmd: '/release  hoặc  ;release', desc: 'Thả Pokémon trùng lấy PC' },
];

export default async function HomePage() {
  let overview: CommunityOverview = {
    totalTrainers: 0,
    totalCatches: 0,
    totalShinies: 0,
    recentHighlights: [],
  };
  let initialLeaderboard: readonly LeaderboardEntry[] = [];
  let dbConnected = true;

  try {
    const [fetchedOverview, fetchedLeaderboard] = await Promise.all([
      leaderboardService.getCommunityOverview(),
      leaderboardService.getLeaderboard('catches', 20),
    ]);
    overview = fetchedOverview;
    initialLeaderboard = fetchedLeaderboard;
  } catch (error) {
    console.warn('Cảnh báo không thể truy vấn PostgreSQL khi render HomePage:', error);
    dbConnected = false;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero Banner */}
      <header className="rpg-card relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-200">
              <Gamepad2 className="h-3.5 w-3.5" />
              Discord Pokémon RPG Community
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              PokéVerse RPG Portal
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
              Săn bắt Pokémon hoang dã bằng nút bấm trực tiếp trên Discord, thu thập biến thể{' '}
              <span className="font-semibold text-amber-300">Shiny</span>, giao dịch an toàn với
              cơ chế chống dupe &amp; đua top trực tiếp trên cộng đồng.
            </p>
          </div>

          <div className="w-full shrink-0 rounded-2xl border border-slate-800 bg-slate-950/75 p-4 lg:w-80">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Terminal className="h-3.5 w-3.5 text-indigo-400" />
              Lệnh Khởi Đầu Nhanh
            </div>
            <ul className="space-y-1.5 text-xs">
              {QUICK_COMMANDS.map((item) => (
                <li key={item.cmd} className="flex items-center justify-between gap-2">
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-indigo-200">
                    {item.cmd}
                  </code>
                  <span className="truncate text-slate-400">{item.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </header>

      {/* Main Interactive Community Portal */}
      <div className="mt-6">
        <CommunityPortalClient
          initialOverview={overview}
          initialLeaderboard={initialLeaderboard}
          catalog={defaultCreatureCatalog.getAll()}
          rarityConfigs={RARITY_CONFIGS}
          dbConnected={dbConnected}
        />
      </div>

      {/* Footer Disclaimer */}
      <footer className="mt-10 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 text-center text-xs leading-relaxed text-slate-400">
        <div className="mb-1 inline-flex items-center gap-1.5 font-semibold text-slate-300">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Thông Báo Cộng Đồng &amp; Bản Quyền
        </div>
        <p>
          Dự án cộng đồng phi lợi nhuận, chỉ nhận ủng hộ duy trì server — không liên kết với
          Nintendo / The Pokémon Company.
        </p>
      </footer>
    </main>
  );
}
