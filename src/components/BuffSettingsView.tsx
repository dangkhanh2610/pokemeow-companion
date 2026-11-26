'use client';

import { RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { BallIcon } from '@/components/BallIcon';
import {
  BALL_ORDER,
  BALL_SPECS,
  DEFAULT_BUFF_CONFIG,
  RARITY_ORDER,
  RARITY_SPECS,
  createDefaultEconomyConfig,
} from '@/domain/data/pokemeow-data';
import type { BallId, BuffConfig, EconomyConfig, RarityId } from '@/domain/types';

interface BuffSettingsViewProps {
  readonly buffs: BuffConfig;
  readonly economy: EconomyConfig;
  readonly onUpdateBuffs: (next: BuffConfig) => void;
  readonly onUpdateEconomy: (next: EconomyConfig) => void;
  readonly onResetDefaults: () => void;
}

export function BuffSettingsView({
  buffs,
  economy,
  onUpdateBuffs,
  onUpdateEconomy,
  onResetDefaults,
}: BuffSettingsViewProps) {
  const handleBallPriceChange = (ballId: BallId, rawValue: string) => {
    const parsed = Math.max(0, Math.round(Number(rawValue) || 0));
    onUpdateEconomy({
      ...economy,
      ballPrices: {
        ...economy.ballPrices,
        [ballId]: parsed,
      },
    });
  };

  const handleRarityValueChange = (
    rarityId: RarityId,
    field: 'catchCoins' | 'releaseValue' | 'marketValue',
    rawValue: string,
  ) => {
    const parsed = Math.max(0, Math.round(Number(rawValue) || 0));
    onUpdateEconomy({
      ...economy,
      rarityValues: {
        ...economy.rarityValues,
        [rarityId]: {
          ...economy.rarityValues[rarityId],
          [field]: parsed,
        },
      },
    });
  };

  const resetAll = () => {
    onUpdateBuffs(DEFAULT_BUFF_CONFIG);
    onUpdateEconomy(createDefaultEconomyConfig());
    onResetDefaults();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">
            Cấu hình Buff tài khoản, Chế độ định giá EV &amp; Giá thị trường
          </h2>
          <p className="text-xs text-slate-400">
            Mọi thay đổi tự động lưu cục bộ trong trình duyệt và cập nhật trực tiếp công thức EV.
          </p>
        </div>

        <button
          type="button"
          onClick={resetAll}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-400/50 hover:text-amber-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Khôi phục mặc định (Chuẩn Wiki)
        </button>
      </div>

      {/* Account & Clan Buffs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="hud-card space-y-4 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-amber-300 uppercase">
            <Sparkles className="h-4 w-4" />
            Buffs, Chế độ Định giá &amp; Perks
          </div>

          {/* Valuation Mode Toggle */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-200">
              Chế độ tính EV &amp; Lời/Lỗ:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateBuffs({ ...buffs, valuationMode: 'release' })}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                  buffs.valuationMode === 'release'
                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                    : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold">💵 Xu mặt (;release)</div>
                <div className="text-[11px] opacity-80">Dành cho người cày xu xả trùng</div>
              </button>

              <button
                type="button"
                onClick={() => onUpdateBuffs({ ...buffs, valuationMode: 'market' })}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                  buffs.valuationMode === 'market'
                    ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold">💎 Giá chợ (;market)</div>
                <div className="text-[11px] opacity-80">Tính cả giá bán chợ đồ hiếm</div>
              </button>
            </div>
          </div>

          {/* Amulet Coins */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <label htmlFor="amulet-slider" className="font-medium text-slate-200">
                Amulet Coins (0–10)
              </label>
              <span className="font-mono font-semibold text-amber-300">
                {buffs.amuletCoins} (+{buffs.amuletCoins * 5}% PokéCoins)
              </span>
            </div>
            <input
              id="amulet-slider"
              type="range"
              min={0}
              max={10}
              value={buffs.amuletCoins}
              onChange={(e) =>
                onUpdateBuffs({ ...buffs, amuletCoins: Number(e.target.value) })
              }
              className="w-full accent-amber-400"
            />
          </div>

          {/* Clan Catch Rate */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <label htmlFor="clan-cr-slider" className="font-medium text-slate-200">
                Clan Catch Rate Perk (CR)
              </label>
              <span className="font-mono font-semibold text-cyan-300">
                +{buffs.clanCatchRatePct}%
              </span>
            </div>
            <input
              id="clan-cr-slider"
              type="range"
              min={0}
              max={25}
              value={buffs.clanCatchRatePct}
              onChange={(e) =>
                onUpdateBuffs({ ...buffs, clanCatchRatePct: Number(e.target.value) })
              }
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Quick Hands */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <label htmlFor="quickhands-slider" className="font-medium text-slate-200">
                Quick Hands (Tỉ lệ giữ lại bóng khi bắt trúng)
              </label>
              <span className="font-mono font-semibold text-emerald-300">
                {buffs.quickHandsSavePct}%
              </span>
            </div>
            <input
              id="quickhands-slider"
              type="range"
              min={0}
              max={20}
              value={buffs.quickHandsSavePct}
              onChange={(e) =>
                onUpdateBuffs({ ...buffs, quickHandsSavePct: Number(e.target.value) })
              }
              className="w-full accent-emerald-400"
            />
          </div>

          {/* Event & Charm boosts */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="event-cr" className="mb-1 block text-xs text-slate-300">
                Event Catch Boost (%)
              </label>
              <input
                id="event-cr"
                type="number"
                min={0}
                max={30}
                value={buffs.eventCatchBoostPct}
                onChange={(e) =>
                  onUpdateBuffs({
                    ...buffs,
                    eventCatchBoostPct: Math.min(30, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="charm-cr" className="mb-1 block text-xs text-slate-300">
                Catch Charm / Khác (%)
              </label>
              <input
                id="charm-cr"
                type="number"
                min={0}
                max={20}
                value={buffs.charmCatchBoostPct}
                onChange={(e) =>
                  onUpdateBuffs({
                    ...buffs,
                    charmCatchBoostPct: Math.min(20, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2.5 text-xs">
              <div>
                <div className="font-semibold text-slate-100">Patreon Ninja</div>
                <div className="text-[11px] text-slate-400">+5% tỉ lệ bắt mọi bóng</div>
              </div>
              <input
                type="checkbox"
                checked={buffs.patreonNinja}
                onChange={(e) => onUpdateBuffs({ ...buffs, patreonNinja: e.target.checked })}
                className="h-4 w-4 accent-purple-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2.5 text-xs">
              <div>
                <div className="font-semibold text-slate-100">Shiny Charm</div>
                <div className="text-[11px] text-slate-400">x2 cơ hội Shiny khi tính toán</div>
              </div>
              <input
                type="checkbox"
                checked={buffs.shinyCharmOwned}
                onChange={(e) => onUpdateBuffs({ ...buffs, shinyCharmOwned: e.target.checked })}
                className="h-4 w-4 accent-amber-400"
              />
            </label>
          </div>

          {/* Custom Cooldown Durations */}
          <div className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-3">
            <div>
              <label htmlFor="wild-cd" className="mb-1 block text-xs text-slate-300">
                Cooldown Catch (;p) giây
              </label>
              <input
                id="wild-cd"
                type="number"
                min={4}
                max={30}
                value={buffs.wildCooldownSec}
                onChange={(e) =>
                  onUpdateBuffs({
                    ...buffs,
                    wildCooldownSec: Math.min(30, Math.max(4, Number(e.target.value) || 8)),
                  })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="fish-cd" className="mb-1 block text-xs text-slate-300">
                Cooldown Fish (;f) giây
              </label>
              <input
                id="fish-cd"
                type="number"
                min={4}
                max={30}
                value={buffs.fishCooldownSec}
                onChange={(e) =>
                  onUpdateBuffs({
                    ...buffs,
                    fishCooldownSec: Math.min(30, Math.max(4, Number(e.target.value) || 20)),
                  })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>
        </section>

        {/* Ball Prices */}
        <section className="hud-card rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-cyan-300 uppercase">
            <ShieldCheck className="h-4 w-4" />
            Giá PokéBall (PokéCoins)
          </div>
          <p className="mb-4 text-xs text-slate-400">
            Premierball không bán trực tiếp trong shop cơ bản — bạn có thể tự định giá cơ hội theo
            nhu cầu giữ bóng.
          </p>

          <div className="space-y-2.5">
            {BALL_ORDER.map((ballId) => {
              const spec = BALL_SPECS[ballId];
              return (
                <div
                  key={ballId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2"
                >
                  <div className="flex items-center gap-2.5">
                    <BallIcon ballId={ballId} size={24} />
                    <div>
                      <div className="text-xs font-semibold text-slate-100">{spec.name}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {spec.shopBuyable ? 'Shop' : 'Event / Quests'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={50}
                      aria-label={`Giá ${spec.name}`}
                      value={economy.ballPrices[ballId]}
                      onChange={(e) => handleBallPriceChange(ballId, e.target.value)}
                      className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-right font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                    />
                    <span className="font-mono text-xs text-slate-400">PC</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Rarity Values Table */}
      <section className="hud-card rounded-2xl p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-white">
            Giá trị thưởng, Xu thả (;release) &amp; Giá chợ (;market) theo Độ hiếm
          </h3>
          <p className="text-xs text-slate-400">
            <strong>Catch Coins</strong> rơi ngay khi bắt (nhân Amulet Coin).{' '}
            <strong>Release Value</strong> là xu khi gõ <code>;r d</code>.{' '}
            <strong>Market Value</strong> là giá ước tính khi treo chợ.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-3">Độ hiếm</th>
                <th className="px-3 py-2 text-right">Catch Coins (PC)</th>
                <th className="px-3 py-2 text-right">Release (;r d) (PC)</th>
                <th className="py-2 pl-3 text-right">Market (;m) (PC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {RARITY_ORDER.map((rarityId) => {
                const rarity = RARITY_SPECS[rarityId];
                const values = economy.rarityValues[rarityId];
                return (
                  <tr key={rarityId}>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${rarity.colorClass}`}
                      >
                        {rarity.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step={50}
                        aria-label={`Catch coins cho ${rarity.label}`}
                        value={values.catchCoins}
                        onChange={(e) =>
                          handleRarityValueChange(rarityId, 'catchCoins', e.target.value)
                        }
                        className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-right font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step={50}
                        aria-label={`Release value cho ${rarity.label}`}
                        value={values.releaseValue}
                        onChange={(e) =>
                          handleRarityValueChange(rarityId, 'releaseValue', e.target.value)
                        }
                        className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-right font-mono text-xs text-emerald-300 focus:border-emerald-400 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <input
                        type="number"
                        min={0}
                        step={100}
                        aria-label={`Market value cho ${rarity.label}`}
                        value={values.marketValue}
                        onChange={(e) =>
                          handleRarityValueChange(rarityId, 'marketValue', e.target.value)
                        }
                        className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-right font-mono text-xs text-cyan-200 focus:border-cyan-400 focus:outline-none"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
