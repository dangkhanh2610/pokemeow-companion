'use client';

import { CheckCircle2, Info, SlidersHorizontal, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BallIcon } from '@/components/BallIcon';
import { BALL_SPECS, RARITY_ORDER, RARITY_SPECS } from '@/domain/data/pokemeow-data';
import { optimizerService } from '@/domain/services/optimizer-service';
import {
  calculateTotalCatchBuff,
  WildCatchRateStrategy,
} from '@/domain/strategies/catch-rate-strategy';
import type {
  BallEvaluation,
  BallId,
  BuffConfig,
  EconomyConfig,
  EncounterSource,
  GenerationGroup,
  RarityId,
} from '@/domain/types';
import { formatCoins, formatPercent, formatRoi, formatSignedCoins } from '@/lib/format';

interface BallOptimizerViewProps {
  readonly buffs: BuffConfig;
  readonly economy: EconomyConfig;
  readonly onTogglePremierBall: () => void;
  readonly onOpenBuffSettings: () => void;
  readonly onQuickLog: (params: {
    source: EncounterSource;
    rarityId: RarityId;
    ballId: BallId;
    caught: boolean;
  }) => void;
}

function getTagBadge(evaluation: BallEvaluation): { label: string; className: string } | null {
  switch (evaluation.recommendationTag) {
    case 'optimal':
      return {
        label: 'Tối ưu EV',
        className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
      };
    case 'safe':
      return {
        label: 'An toàn 100%',
        className: 'border-purple-500/40 bg-purple-500/15 text-purple-200',
      };
    case 'budget':
      return {
        label: 'Tiết kiệm',
        className: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
      };
    case 'overkill':
      return {
        label: 'Lỗ vốn',
        className: 'border-rose-500/35 bg-rose-500/10 text-rose-300',
      };
    default:
      return null;
  }
}

export function BallOptimizerView({
  buffs,
  economy,
  onTogglePremierBall,
  onOpenBuffSettings,
  onQuickLog,
}: BallOptimizerViewProps) {
  const [generationGroup, setGenerationGroup] = useState<GenerationGroup>('gen1_5_8');
  const [selectedRarity, setSelectedRarity] = useState<RarityId>('rare');

  const strategy = useMemo(() => new WildCatchRateStrategy(generationGroup), [generationGroup]);

  const results = useMemo(
    () => optimizerService.optimizeAllRarities(strategy, buffs, economy, RARITY_ORDER),
    [strategy, buffs, economy],
  );

  const activeResult = useMemo(
    () => results.find((item) => item.rarityId === selectedRarity) ?? results[0],
    [results, selectedRarity],
  );

  const totalCatchBuffPct = Math.round(calculateTotalCatchBuff(buffs) * 100);
  const amuletBonusPct = buffs.amuletCoins * 5;

  return (
    <div className="space-y-5">
      {/* Control strip */}
      <div className="hud-card flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Thế hệ Pokémon:
          </span>
          <div className="inline-flex rounded-xl border border-slate-700/70 bg-slate-900/90 p-1">
            <button
              type="button"
              onClick={() => setGenerationGroup('gen1_5_8')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                generationGroup === 'gen1_5_8'
                  ? 'bg-red-500/20 text-red-200 ring-1 ring-red-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Gen 1–5 &amp; 8 (Chuẩn)
            </button>
            <button
              type="button"
              onClick={() => setGenerationGroup('gen6_7')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                generationGroup === 'gen6_7'
                  ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Gen 6 &amp; 7 (Khó bắt hơn)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePremierBall}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
              buffs.includePremierBall
                ? 'border-slate-400/40 bg-slate-100/10 text-slate-100'
                : 'border-slate-700/70 bg-slate-900/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            Premierball: {buffs.includePremierBall ? 'Đang xét' : 'Đang ẩn'}
          </button>

          <button
            type="button"
            onClick={onOpenBuffSettings}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Buff: +{totalCatchBuffPct}% CR · +{amuletBonusPct}% Coins
          </button>
        </div>
      </div>

      {/* Quick Cheat Sheet Grid */}
      <section aria-label="Bảng gợi ý nhanh theo độ hiếm">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">
            Bảng gợi ý bóng tối ưu (Cheat Sheet — {strategy.name})
          </h2>
          <span className="text-xs text-slate-400">Nhấn vào từng thẻ để xem chi tiết EV</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
          {results.map((result) => {
            const rarity = RARITY_SPECS[result.rarityId];
            const bestSpec = BALL_SPECS[result.bestBall.ballId];
            const isSelected = activeResult?.rarityId === result.rarityId;

            return (
              <button
                key={result.rarityId}
                type="button"
                onClick={() => setSelectedRarity(result.rarityId)}
                className={`group flex flex-col justify-between rounded-2xl border p-3 text-left transition ${
                  isSelected
                    ? 'border-cyan-400/70 bg-slate-800/95 ring-1 ring-cyan-400/40'
                    : 'border-slate-800 bg-slate-900/75 hover:border-slate-600/80 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${rarity.colorClass}`}
                  >
                    {rarity.shortLabel}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {formatPercent(result.bestBall.catchRate, 0)}
                  </span>
                </div>

                <div className="my-2.5 flex items-center gap-2">
                  <BallIcon ballId={bestSpec.id} size={28} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-100">
                      {bestSpec.name}
                    </div>
                    <div className="truncate text-[11px] text-slate-400">{rarity.label}</div>
                  </div>
                </div>

                <div
                  className={`font-mono text-xs font-semibold tabular-nums ${
                    result.bestBall.expectedValue >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  EV {formatSignedCoins(result.bestBall.expectedValue)}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Detailed EV Comparison Table */}
      {activeResult && (
        <section className="hud-card rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                    RARITY_SPECS[activeResult.rarityId].colorClass
                  }`}
                >
                  {RARITY_SPECS[activeResult.rarityId].label}
                </span>
                <h3 className="text-base font-semibold text-white">
                  Phân tích Expected Value (EV) từng loại bóng
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Công thức:{' '}
                <span className="font-mono text-slate-300">
                  EV = (Tỉ lệ bắt × Giá trị nhận) − Chi phí bóng hiệu dụng
                </span>{' '}
                (đã tính Amulet Coin &amp; Quick Hands).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onQuickLog({
                    source: 'wild',
                    rarityId: activeResult.rarityId,
                    ballId: activeResult.bestBall.ballId,
                    caught: true,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 active:scale-95"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ghi nhanh: Bắt bằng {BALL_SPECS[activeResult.bestBall.ballId].name}
              </button>
              <button
                type="button"
                onClick={() =>
                  onQuickLog({
                    source: 'wild',
                    rarityId: activeResult.rarityId,
                    ballId: activeResult.bestBall.ballId,
                    caught: false,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 active:scale-95"
              >
                <XCircle className="h-3.5 w-3.5" />
                Ghi nhanh: Trượt
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[660px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  <th className="py-2.5 pr-3">Loại bóng</th>
                  <th className="px-3 py-2.5">Tỉ lệ bắt</th>
                  <th className="px-3 py-2.5 text-right">Giá bóng</th>
                  <th className="px-3 py-2.5 text-right">Thưởng kỳ vọng</th>
                  <th className="px-3 py-2.5 text-right">EV (Lời/Lỗ TB)</th>
                  <th className="px-3 py-2.5 text-right">ROI</th>
                  <th className="py-2.5 pl-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {activeResult.evaluations.map((item) => {
                  const ball = BALL_SPECS[item.ballId];
                  const badge = getTagBadge(item);

                  return (
                    <tr
                      key={item.ballId}
                      className={
                        item.isBestEv
                          ? 'bg-emerald-500/5 transition hover:bg-emerald-500/10'
                          : 'transition hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <BallIcon ballId={item.ballId} size={26} />
                          <div>
                            <div className="flex items-center gap-2 font-semibold text-slate-100">
                              <span>{ball.name}</span>
                              <span className="font-mono text-xs text-slate-400">
                                ({ball.shortCode})
                              </span>
                              {badge && (
                                <span
                                  className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${item.catchRate * 100}%`,
                                backgroundColor: ball.accentColor,
                              }}
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold tabular-nums text-slate-200">
                            {formatPercent(item.catchRate, 1)}
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-slate-300">
                        {formatCoins(item.effectiveBallCost)}
                      </td>

                      <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-slate-300">
                        {formatCoins(item.expectedReward)}
                      </td>

                      <td
                        className={`px-3 py-3 text-right font-mono text-xs font-bold tabular-nums ${
                          item.expectedValue >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatSignedCoins(item.expectedValue)}
                      </td>

                      <td
                        className={`px-3 py-3 text-right font-mono text-xs tabular-nums ${
                          item.roiPct >= 0 ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {formatRoi(item.roiPct)}
                      </td>

                      <td className="py-3 pl-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onQuickLog({
                                source: 'wild',
                                rarityId: activeResult.rarityId,
                                ballId: item.ballId,
                                caught: true,
                              })
                            }
                            title={`Ghi nhận bắt được bằng ${ball.name}`}
                            className="rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-medium text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/15"
                          >
                            +Bắt
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onQuickLog({
                                source: 'wild',
                                rarityId: activeResult.rarityId,
                                ballId: item.ballId,
                                caught: false,
                              })
                            }
                            title={`Ghi nhận trượt bằng ${ball.name}`}
                            className="rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/15"
                          >
                            +Trượt
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            <span>
              Mẹo: Với <strong>Legendary</strong>, <strong>Shiny</strong> hoặc{' '}
              <strong>Golden</strong> có giá thị trường cao, đôi khi dù Pokéball/Ultraball có EV lý
              thuyết tốt hoặc chênh lệch nhỏ, dùng <strong>Masterball</strong> (hoặc{' '}
              <strong>Premierball</strong> cho Shiny Full-odds) giúp loại bỏ hoàn toàn rủi ro chạy
              mất.
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
