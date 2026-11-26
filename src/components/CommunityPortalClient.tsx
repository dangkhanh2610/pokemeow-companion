'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { BALL_CATALOG, getBallSpec } from '@/game/catalog/ball-catalog';
import type {
  CommunityOverview,
  CreatureFormType,
  CreatureSpecies,
  LeaderboardEntry,
  LeaderboardMetric,
  RarityConfig,
  RarityTier,
} from '@/game/types';

interface CommunityPortalClientProps {
  readonly initialOverview: CommunityOverview;
  readonly initialLeaderboard: readonly LeaderboardEntry[];
  readonly catalog: readonly CreatureSpecies[];
  readonly rarityConfigs: Readonly<Record<RarityTier, RarityConfig>>;
  readonly dbConnected: boolean;
}

type ActiveTab = 'leaderboard' | 'highlights' | 'pokedex';

const METRIC_OPTIONS: readonly { readonly id: LeaderboardMetric; readonly label: string }[] = [
  { id: 'catches', label: 'Tổng Lượt Bắt' },
  { id: 'coins', label: 'Đại Gia PokéCoins' },
  { id: 'shinies', label: 'Thợ Săn Shiny' },
  { id: 'level', label: 'Cấp Độ Cao Nhất' },
];

const RARITY_FILTERS: readonly { readonly id: RarityTier | 'all'; readonly label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'common', label: 'Common' },
  { id: 'uncommon', label: 'Uncommon' },
  { id: 'rare', label: 'Rare' },
  { id: 'super_rare', label: 'Super Rare' },
  { id: 'legendary', label: 'Legendary' },
  { id: 'mega', label: 'Mega / Primal' },
];

const FORM_FILTERS: readonly { readonly id: CreatureFormType | 'all'; readonly label: string }[] = [
  { id: 'all', label: 'Mọi dạng' },
  { id: 'base', label: 'Dạng gốc' },
  { id: 'mega', label: 'Mega / Primal' },
  { id: 'gmax', label: 'Gigantamax' },
  { id: 'regional', label: 'Vùng miền' },
  { id: 'special', label: 'Huyền thoại đặc biệt' },
];

const FORM_BADGE_LABELS: Readonly<Record<Exclude<CreatureFormType, 'base'>, string>> = {
  mega: 'MEGA',
  gmax: 'GMAX',
  regional: 'REGIONAL',
  special: 'SPECIAL',
};

export function CommunityPortalClient({
  initialOverview,
  initialLeaderboard,
  catalog,
  rarityConfigs,
  dbConnected,
}: CommunityPortalClientProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('leaderboard');
  const [metric, setMetric] = useState<LeaderboardMetric>('catches');
  const [overview, setOverview] = useState<CommunityOverview>(initialOverview);
  const [leaderboard, setLeaderboard] = useState<readonly LeaderboardEntry[]>(initialLeaderboard);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [dexQuery, setDexQuery] = useState('');
  const [dexRarity, setDexRarity] = useState<RarityTier | 'all'>('all');
  const [dexFormType, setDexFormType] = useState<CreatureFormType | 'all'>('all');
  const [showShiny, setShowShiny] = useState(false);
  const [dexPage, setDexPage] = useState(1);
  const DEX_PAGE_SIZE = 24;

  async function refreshLeaderboard(nextMetric: LeaderboardMetric): Promise<void> {
    setMetric(nextMetric);
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch(`/api/leaderboard?metric=${nextMetric}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Không thể tải dữ liệu bảng xếp hạng.');
      }
      const data = (await response.json()) as {
        overview: CommunityOverview;
        leaderboard: LeaderboardEntry[];
      };
      setOverview(data.overview);
      setLeaderboard(data.leaderboard);
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'Đã xảy ra lỗi khi tải bảng xếp hạng.',
      );
    } finally {
      setLoading(false);
    }
  }

  const filteredCatalog = useMemo(() => {
    const q = dexQuery.trim().toLowerCase().replace(/^#/, '');
    return catalog.filter((species) => {
      if (dexRarity !== 'all' && species.rarity !== dexRarity) {
        return false;
      }
      if (dexFormType !== 'all' && species.formType !== dexFormType) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        species.name.toLowerCase().includes(q) ||
        String(species.id) === q ||
        String(species.dexNumber) === q ||
        species.slug.includes(q) ||
        species.types.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [catalog, dexQuery, dexRarity, dexFormType]);

  const dexTotalPages = Math.max(1, Math.ceil(filteredCatalog.length / DEX_PAGE_SIZE));
  const safeDexPage = Math.min(dexPage, dexTotalPages);
  const paginatedCatalog = useMemo(() => {
    const start = (safeDexPage - 1) * DEX_PAGE_SIZE;
    return filteredCatalog.slice(start, start + DEX_PAGE_SIZE);
  }, [filteredCatalog, safeDexPage]);

  return (
    <div className="space-y-6">
      {/* Live Stats Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rpg-card rounded-2xl p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Huấn Luyện Viên</span>
            <Users className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-white tabular-nums">
            {overview.totalTrainers.toLocaleString('en-US')}
          </p>
        </div>

        <div className="rpg-card rounded-2xl p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Tổng Lượt Bắt</span>
            <Trophy className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-white tabular-nums">
            {overview.totalCatches.toLocaleString('en-US')}
          </p>
        </div>

        <div className="rpg-card rounded-2xl p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Shiny Săn Được</span>
            <Sparkles className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-amber-300 tabular-nums">
            {overview.totalShinies.toLocaleString('en-US')}
          </p>
        </div>
      </section>

      {!dbConnected && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Chưa phát hiện kết nối PostgreSQL trực tiếp khi render trang. Hãy kiểm tra{' '}
          <code className="font-mono">DATABASE_URL</code> hoặc bấm làm mới sau khi bot hoạt động.
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'leaderboard'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Crown className="h-4 w-4" />
            Bảng Xếp Hạng
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('highlights')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'highlights'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Hall of Fame
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pokedex')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'pokedex'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Pokédex ({catalog.length})
          </button>
        </div>

        {activeTab !== 'pokedex' && (
          <button
            type="button"
            onClick={() => void refreshLeaderboard(metric)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-500/60 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: LEADERBOARD */}
      {activeTab === 'leaderboard' && (
        <section className="rpg-card rounded-2xl p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">Xếp Hạng Huấn Luyện Viên</h2>
            <div className="flex flex-wrap gap-1.5">
              {METRIC_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => void refreshLeaderboard(opt.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    metric === opt.id
                      ? 'bg-indigo-500/25 text-indigo-200 ring-1 ring-indigo-500/60'
                      : 'bg-slate-900/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {leaderboard.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
              Chưa có huấn luyện viên nào trên bảng xếp hạng. Hãy vào Discord gõ{' '}
              <code className="font-mono text-indigo-300">/p</code> hoặc{' '}
              <code className="font-mono text-indigo-300">;p</code> để mở màn!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                    <th className="py-3 pr-3">Hạng</th>
                    <th className="py-3 px-3">Huấn Luyện Viên</th>
                    <th className="py-3 px-3">Cấp</th>
                    <th className="py-3 px-3 text-right">Lượt Bắt</th>
                    <th className="py-3 px-3 text-right">Shiny</th>
                    <th className="py-3 pl-3 text-right">PokéCoins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {leaderboard.map((entry) => (
                    <tr key={entry.userId} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-3 font-mono font-bold text-slate-300">
                        {entry.rank === 1
                          ? '🥇'
                          : entry.rank === 2
                            ? '🥈'
                            : entry.rank === 3
                              ? '🥉'
                              : `#${entry.rank}`}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          {entry.avatarUrl ? (
                            <Image
                              src={entry.avatarUrl}
                              alt={entry.displayName}
                              width={28}
                              height={28}
                              className="rounded-full border border-slate-700 object-cover"
                            />
                          ) : (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/30 text-xs font-bold text-indigo-200">
                              {entry.displayName.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <span className="font-semibold text-slate-100">{entry.displayName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-indigo-300 tabular-nums">
                        Lv.{entry.level}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-200 tabular-nums">
                        {entry.totalCatches.toLocaleString('en-US')}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-amber-300 tabular-nums">
                        {entry.shinyCatches.toLocaleString('en-US')}
                      </td>
                      <td className="py-3 pl-3 text-right font-mono text-emerald-300 tabular-nums">
                        {entry.coins.toLocaleString('en-US')} PC
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: HALL OF FAME */}
      {activeTab === 'highlights' && (
        <section className="rpg-card rounded-2xl p-5">
          <h2 className="mb-4 text-lg font-bold text-white">
            Khoảnh Khắc Hiếm & Shiny Gần Nhất
          </h2>
          {overview.recentHighlights.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
              Chưa có lượt bắt Rare / Super Rare / Legendary hoặc Shiny nào được ghi nhận.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {overview.recentHighlights.map((item) => {
                const rarityMeta = rarityConfigs[item.rarity];
                const ball = getBallSpec(item.ballUsed);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5"
                  >
                    <Image
                      src={item.artworkUrl}
                      alt={item.speciesName}
                      width={56}
                      height={56}
                      unoptimized
                      className="h-14 w-14 shrink-0 rounded-lg bg-slate-950/60 object-contain p-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {item.isShiny && <span className="text-xs">✨</span>}
                        <span className="truncate font-bold text-white">{item.speciesName}</span>
                      </div>
                      <p className="truncate text-xs text-slate-400">
                        Bắt bởi <span className="text-slate-200">{item.trainerName}</span>
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${rarityMeta.badgeCss}`}
                        >
                          {rarityMeta.label}
                        </span>
                        <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                          {item.ivPercent}% IV
                        </span>
                        <Image
                          src={ball.iconUrl}
                          alt={ball.name}
                          title={ball.name}
                          width={18}
                          height={18}
                          unoptimized
                          className="ml-auto h-4.5 w-4.5 object-contain"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: POKEDEX CATALOG */}
      {activeTab === 'pokedex' && (
        <section className="rpg-card space-y-4 rounded-2xl p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={dexQuery}
                onChange={(e) => {
                  setDexQuery(e.target.value);
                  setDexPage(1);
                }}
                placeholder="Tìm theo tên Pokémon, số Dex (#25) hoặc hệ (Dragon, Fire)..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {RARITY_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => {
                    setDexRarity(filter.id);
                    setDexPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    dexRarity === filter.id
                      ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/60'
                      : 'bg-slate-900/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {filter.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setShowShiny((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  showShiny
                    ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/70 shadow-sm shadow-amber-500/20'
                    : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {showShiny ? 'Đang xem Shiny ★' : 'Chế độ Shiny'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-slate-400">Dạng tiến hóa:</span>
            {FORM_FILTERS.map((form) => (
              <button
                key={form.id}
                type="button"
                onClick={() => {
                  setDexFormType(form.id);
                  setDexPage(1);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  dexFormType === form.id
                    ? 'bg-indigo-500/25 text-indigo-200 ring-1 ring-indigo-500/60'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {form.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {BALL_CATALOG.map((ball) => (
              <div
                key={ball.id}
                className="flex items-center gap-2.5 rounded-xl border border-slate-800/90 bg-slate-950/60 px-3 py-2"
              >
                <Image
                  src={ball.iconUrl}
                  alt={ball.name}
                  width={28}
                  height={28}
                  unoptimized
                  className="h-7 w-7 shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{ball.name}</p>
                  <p className="font-mono text-[11px] text-slate-400">
                    {ball.shortCode.toUpperCase()} • {ball.price.toLocaleString('en-US')} PC
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/50 px-4 py-2.5 text-xs text-slate-300">
            <span>
              Hiển thị{' '}
              <strong className="font-mono text-white">
                {paginatedCatalog.length > 0 ? (safeDexPage - 1) * DEX_PAGE_SIZE + 1 : 0}–
                {(safeDexPage - 1) * DEX_PAGE_SIZE + paginatedCatalog.length}
              </strong>{' '}
              trong <strong className="font-mono text-emerald-300">{filteredCatalog.length}</strong>{' '}
              loài khớp bộ lọc
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDexPage((p) => Math.max(1, p - 1))}
                disabled={safeDexPage <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-medium text-slate-200 transition hover:border-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Trước
              </button>
              <span className="font-mono text-xs text-slate-300 tabular-nums">
                Trang {safeDexPage} / {dexTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setDexPage((p) => Math.min(dexTotalPages, p + 1))}
                disabled={safeDexPage >= dexTotalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-medium text-slate-200 transition hover:border-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sau
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginatedCatalog.map((species) => {
              const rarityMeta = rarityConfigs[species.rarity];
              const spriteSrc = showShiny
                ? species.shinyAnimatedSpriteUrl
                : species.animatedSpriteUrl;
              return (
                <div
                  key={species.id}
                  className={`flex flex-col justify-between rounded-xl border p-4 transition ${
                    showShiny
                      ? 'border-amber-500/35 bg-slate-900/80 hover:border-amber-400/60'
                      : 'border-slate-800 bg-slate-900/65 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs text-slate-500">
                          #{String(species.dexNumber).padStart(4, '0')} • BST {species.baseStats.bst}
                        </span>
                        {species.formType !== 'base' && (
                          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-200">
                            {FORM_BADGE_LABELS[species.formType]}
                          </span>
                        )}
                      </div>
                      <h3 className="truncate text-base font-bold text-white">
                        {showShiny && <span className="mr-1 text-amber-300">★</span>}
                        {species.name}
                      </h3>
                      <p className="text-xs text-slate-400">{species.types.join(' • ')}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${rarityMeta.badgeCss}`}
                    >
                      {rarityMeta.label}
                    </span>
                  </div>

                  <div className="my-3 flex h-24 items-center justify-center">
                    <Image
                      src={spriteSrc}
                      alt={species.name}
                      width={88}
                      height={88}
                      unoptimized
                      className={`max-h-22 w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] ${
                        species.isStaticSprite ? 'animate-sprite-idle' : ''
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-xs text-slate-300">
                    {species.rarity === 'mega' ? (
                      <span className="font-medium text-rose-300">Hiến tế 5/6 Legend</span>
                    ) : (
                      <span>
                        Bắt gốc:{' '}
                        <strong className="font-mono">
                          {Math.round(species.baseCatchRate * 100)}%
                        </strong>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-mono text-emerald-300">
                      <Coins className="h-3.5 w-3.5" />+{species.baseReward.toLocaleString('en-US')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
