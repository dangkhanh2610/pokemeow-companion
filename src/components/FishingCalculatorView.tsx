'use client';

import { Anchor, CheckCircle2, Sparkles, Waves, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BallIcon } from '@/components/BallIcon';
import {
  BALL_SPECS,
  LURE_ORDER,
  LURE_SPECS,
  RARITY_ORDER,
  RARITY_SPECS,
  ROD_ORDER,
  ROD_SPECS,
} from '@/domain/data/pokemeow-data';
import { optimizerService } from '@/domain/services/optimizer-service';
import { FishingCatchRateStrategy } from '@/domain/strategies/catch-rate-strategy';
import type {
  BallId,
  BuffConfig,
  EconomyConfig,
  EncounterSource,
  FishingSetup,
  RarityId,
} from '@/domain/types';
import { formatCoins, formatPercent, formatRoi, formatSignedCoins } from '@/lib/format';

interface FishingCalculatorViewProps {
  readonly buffs: BuffConfig;
  readonly economy: EconomyConfig;
  readonly fishingSetup: FishingSetup;
  readonly onUpdateFishingSetup: (next: FishingSetup) => void;
  readonly onQuickLog: (params: {
    source: EncounterSource;
    rarityId: RarityId;
    ballId: BallId;
    caught: boolean;
  }) => void;
}

const FISHABLE_RARITIES: readonly RarityId[] = RARITY_ORDER.filter(
  (rarityId) => RARITY_SPECS[rarityId].availableInFishing,
);

export function FishingCalculatorView({
  buffs,
  economy,
  fishingSetup,
  onUpdateFishingSetup,
  onQuickLog,
}: FishingCalculatorViewProps) {
  const [selectedRarity, setSelectedRarity] = useState<RarityId>('super_rare');

  const strategy = useMemo(() => new FishingCatchRateStrategy(fishingSetup), [fishingSetup]);

  const metrics = useMemo(
    () => optimizerService.calculateFishingMetrics(fishingSetup, buffs),
    [fishingSetup, buffs],
  );

  const goldenMultiplier = fishingSetup.goldenHour ? 1.5 : 1;

  const results = useMemo(
    () =>
      optimizerService.optimizeAllRarities(
        strategy,
        buffs,
        economy,
        FISHABLE_RARITIES,
        goldenMultiplier,
      ),
    [strategy, buffs, economy, goldenMultiplier],
  );

  const activeResult = useMemo(
    () => results.find((item) => item.rarityId === selectedRarity) ?? results[0],
    [results, selectedRarity],
  );

  return (
    <div className="space-y-5">
      {/* Rod & Lure Setup */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Rod Selection */}
        <div className="hud-card rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-cyan-300 uppercase">
            <Anchor className="h-4 w-4" />
            1. Chọn cần câu (Fishing Rod)
          </div>
          <div className="space-y-2">
            {ROD_ORDER.map((rodId) => {
              const rod = ROD_SPECS[rodId];
              const active = fishingSetup.rod === rodId;
              return (
                <button
                  key={rodId}
                  type="button"
                  onClick={() => onUpdateFishingSetup({ ...fishingSetup, rod: rodId })}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? 'border-cyan-400/60 bg-cyan-500/15 text-white'
                      : 'border-slate-800 bg-slate-900/75 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold">{rod.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {rod.tokenCost === 0
                        ? 'Rơi từ bắt Wild (1/1,000)'
                        : `${rod.tokenCost.toLocaleString('en-US')} Tokens`}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <div className="text-cyan-300">{formatPercent(rod.spawnRate, 0)} spawn</div>
                    <div className="text-amber-300">
                      1/{rod.shinyDenominator.toLocaleString('en-US')} Shiny
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lure Selection */}
        <div className="hud-card rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-cyan-300 uppercase">
            <Waves className="h-4 w-4" />
            2. Chọn mồi câu (Lure)
          </div>
          <div className="space-y-2">
            {LURE_ORDER.map((lureId) => {
              const lure = LURE_SPECS[lureId];
              const active = fishingSetup.lure === lureId;
              return (
                <button
                  key={lureId}
                  type="button"
                  onClick={() => onUpdateFishingSetup({ ...fishingSetup, lure: lureId })}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? 'border-cyan-400/60 bg-cyan-500/15 text-white'
                      : 'border-slate-800 bg-slate-900/75 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{lure.name}</span>
                    {lure.tokenCost > 0 && (
                      <span className="font-mono text-[11px] text-cyan-300">
                        {lure.tokenCost} Tokens / {lure.uses} lần
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">{lure.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Metrics & Golden Hour */}
        <div className="hud-card flex flex-col justify-between rounded-2xl p-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-amber-300 uppercase">
              <Sparkles className="h-4 w-4" />
              3. Hiệu suất câu cá hiện tại
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="text-[11px] text-slate-400">Tỉ lệ gặp cá</div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums text-cyan-300">
                  {formatPercent(metrics.effectiveSpawnRate, 0)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="text-[11px] text-slate-400">Tỉ lệ Shiny cá</div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-300">
                  1/{metrics.shinyOddsDenominator.toLocaleString('en-US')}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="text-[11px] text-slate-400">Diveball Catch</div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-300">
                  {formatPercent(
                    strategy.calculateCatchRate(RARITY_SPECS.common, BALL_SPECS.db, buffs),
                    0,
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="text-[11px] text-slate-400">Chi phí mồi / lần</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-200">
                  {formatCoins(metrics.lureCostPerCastCoins)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-2.5 border-t border-slate-800 pt-3">
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2">
              <div>
                <div className="text-xs font-semibold text-amber-200">Golden Fishing Hour</div>
                <div className="text-[11px] text-amber-300/80">
                  x2 cơ hội Shiny &amp; tăng giá trị thưởng ước tính
                </div>
              </div>
              <input
                type="checkbox"
                checked={fishingSetup.goldenHour}
                onChange={(e) =>
                  onUpdateFishingSetup({ ...fishingSetup, goldenHour: e.target.checked })
                }
                className="h-4 w-4 accent-amber-400"
              />
            </label>

            <div className="flex items-center justify-between gap-3 text-xs">
              <label htmlFor="token-rate" className="text-slate-400">
                Quy đổi 1 Fishing Token (PC):
              </label>
              <input
                id="token-rate"
                type="number"
                min={0}
                step={50}
                value={fishingSetup.tokenToCoinRate}
                onChange={(e) =>
                  onUpdateFishingSetup({
                    ...fishingSetup,
                    tokenToCoinRate: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-right font-mono text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fishable Rarity Matrix */}
      <section aria-label="Bóng tối ưu khi câu cá theo độ hiếm">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">
            Ma trận chọn bóng câu cá (;f) — So sánh Diveball (85%) với các bóng khác
          </h2>
          <span className="text-xs text-slate-400">Chọn độ hiếm để xem bảng EV chi tiết</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
          {results.map((result) => {
            const rarity = RARITY_SPECS[result.rarityId];
            const bestSpec = BALL_SPECS[result.bestBall.ballId];
            const isSelected = activeResult?.rarityId === result.rarityId;

            return (
              <button
                key={result.rarityId}
                type="button"
                onClick={() => setSelectedRarity(result.rarityId)}
                className={`flex flex-col justify-between rounded-2xl border p-3 text-left transition ${
                  isSelected
                    ? 'border-cyan-400/70 bg-slate-800/95 ring-1 ring-cyan-400/40'
                    : 'border-slate-800 bg-slate-900/75 hover:border-slate-600/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${rarity.colorClass}`}
                  >
                    {rarity.shortLabel}
                  </span>
                  <span className="font-mono text-[11px] text-cyan-300">
                    {formatPercent(result.bestBall.catchRate, 0)}
                  </span>
                </div>

                <div className="my-2.5 flex items-center gap-2">
                  <BallIcon ballId={bestSpec.id} size={26} />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white">{bestSpec.name}</div>
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

      {/* Detailed Fishing Ball Table */}
      {activeResult && (
        <section className="hud-card rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                  RARITY_SPECS[activeResult.rarityId].colorClass
                }`}
              >
                {RARITY_SPECS[activeResult.rarityId].label}
              </span>
              <h3 className="text-base font-semibold text-white">
                So sánh bóng khi câu cá ({LURE_SPECS[fishingSetup.lure].name})
              </h3>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  onQuickLog({
                    source: 'fishing',
                    rarityId: activeResult.rarityId,
                    ballId: activeResult.bestBall.ballId,
                    caught: true,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ghi nhanh: Câu được ({BALL_SPECS[activeResult.bestBall.ballId].name})
              </button>
              <button
                type="button"
                onClick={() =>
                  onQuickLog({
                    source: 'fishing',
                    rarityId: activeResult.rarityId,
                    ballId: activeResult.bestBall.ballId,
                    caught: false,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
              >
                <XCircle className="h-3.5 w-3.5" />
                Ghi nhanh: Sổng mất
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  <th className="py-2.5 pr-3">Loại bóng</th>
                  <th className="px-3 py-2.5">Tỉ lệ bắt cá</th>
                  <th className="px-3 py-2.5 text-right">Giá bóng</th>
                  <th className="px-3 py-2.5 text-right">EV kỳ vọng</th>
                  <th className="px-3 py-2.5 text-right">ROI</th>
                  <th className="py-2.5 pl-3 text-right">Ghi log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {activeResult.evaluations.map((item) => {
                  const ball = BALL_SPECS[item.ballId];
                  return (
                    <tr
                      key={item.ballId}
                      className={
                        item.isBestEv
                          ? 'bg-cyan-500/8 transition hover:bg-cyan-500/15'
                          : 'transition hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <BallIcon ballId={item.ballId} size={24} />
                          <span className="font-semibold text-slate-100">{ball.name}</span>
                          {item.ballId === 'db' && (
                            <span className="rounded-md border border-cyan-500/40 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200">
                              Chuyên câu cá
                            </span>
                          )}
                          {item.isBestEv && (
                            <span className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                              Tối ưu EV
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${item.catchRate * 100}%`,
                                backgroundColor: ball.accentColor,
                              }}
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-200">
                            {formatPercent(item.catchRate, 1)}
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-right font-mono text-xs text-slate-300">
                        {formatCoins(item.effectiveBallCost)}
                      </td>

                      <td
                        className={`px-3 py-3 text-right font-mono text-xs font-bold ${
                          item.expectedValue >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatSignedCoins(item.expectedValue)}
                      </td>

                      <td
                        className={`px-3 py-3 text-right font-mono text-xs ${
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
                                source: 'fishing',
                                rarityId: activeResult.rarityId,
                                ballId: item.ballId,
                                caught: true,
                              })
                            }
                            className="rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:border-emerald-500/50"
                          >
                            +Bắt
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onQuickLog({
                                source: 'fishing',
                                rarityId: activeResult.rarityId,
                                ballId: item.ballId,
                                caught: false,
                              })
                            }
                            className="rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-medium text-rose-300 hover:border-rose-500/50"
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
        </section>
      )}
    </div>
  );
}
