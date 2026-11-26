'use client';

import {
  BarChart3,
  Calculator,
  Fish,
  Radio,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { BallIcon } from '@/components/BallIcon';
import { BallOptimizerView } from '@/components/BallOptimizerView';
import { BuffSettingsView } from '@/components/BuffSettingsView';
import { CooldownBar } from '@/components/CooldownBar';
import { DiscordLiveSyncView } from '@/components/DiscordLiveSyncView';
import { FishingCalculatorView } from '@/components/FishingCalculatorView';
import { SessionTrackerView } from '@/components/SessionTrackerView';
import {
  BALL_SPECS,
  DEFAULT_BUFF_CONFIG,
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_FISHING_SETUP,
  RARITY_SPECS,
} from '@/domain/data/pokemeow-data';
import { optimizerService } from '@/domain/services/optimizer-service';
import type {
  BallId,
  BuffConfig,
  CatchLogEntry,
  EconomyConfig,
  EncounterSource,
  FishingSetup,
  RarityId,
} from '@/domain/types';
import { formatSignedCoins } from '@/lib/format';
import {
  loadBuffConfig,
  loadCatchLogs,
  loadEconomyConfig,
  loadFishingSetup,
  saveBuffConfig,
  saveCatchLogs,
  saveEconomyConfig,
  saveFishingSetup,
} from '@/lib/storage';

type TabId = 'discord_live' | 'optimizer' | 'fishing' | 'tracker' | 'settings';

export function CompanionShell() {
  const [activeTab, setActiveTab] = useState<TabId>('discord_live');
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  const [buffs, setBuffs] = useState<BuffConfig>(DEFAULT_BUFF_CONFIG);
  const [economy, setEconomy] = useState<EconomyConfig>(DEFAULT_ECONOMY_CONFIG);
  const [fishingSetup, setFishingSetup] = useState<FishingSetup>(DEFAULT_FISHING_SETUP);
  const [logs, setLogs] = useState<readonly CatchLogEntry[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    setBuffs(loadBuffConfig());
    setEconomy(loadEconomyConfig());
    setFishingSetup(loadFishingSetup());
    setLogs(loadCatchLogs());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveBuffConfig(buffs);
  }, [buffs, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveEconomyConfig(economy);
  }, [economy, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveFishingSetup(fishingSetup);
  }, [fishingSetup, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveCatchLogs(logs);
  }, [logs, isHydrated]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleAddLog = useCallback(
    (params: {
      source: EncounterSource;
      rarityId: RarityId;
      ballId: BallId;
      caught: boolean;
      pokemonName?: string;
    }) => {
      const profit = optimizerService.computeSingleCatchProfit(
        params.rarityId,
        params.ballId,
        params.caught,
        buffs,
        economy,
      );

      const newEntry: CatchLogEntry = {
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        source: params.source,
        rarityId: params.rarityId,
        ballId: params.ballId,
        caught: params.caught,
        pokemonName: params.pokemonName ?? '',
        ballCost: profit.ballCost,
        coinsEarned: profit.coinsEarned,
        netProfit: profit.netProfit,
      };

      setLogs((prev) => [newEntry, ...prev]);

      const rarityLabel = RARITY_SPECS[params.rarityId].label;
      const ballName = BALL_SPECS[params.ballId].name;
      showToast(
        `${params.caught ? 'Đã ghi bắt được' : 'Đã ghi trượt'} ${rarityLabel} (${ballName}) · ${formatSignedCoins(profit.netProfit)}`,
      );
    },
    [buffs, economy, showToast],
  );

  const handleDeleteLog = useCallback((id: string) => {
    setLogs((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
    showToast('Đã xoá toàn bộ nhật ký phiên chơi.');
  }, [showToast]);

  const tabs: readonly {
    id: TabId;
    label: string;
    icon: typeof Calculator;
    badge?: string;
    badgeTone?: 'live' | 'default';
  }[] = [
    {
      id: 'discord_live',
      label: 'Discord Live Sync',
      icon: Radio,
      badge: 'LIVE',
      badgeTone: 'live',
    },
    { id: 'optimizer', label: 'Ball Optimizer (;p)', icon: Calculator },
    { id: 'fishing', label: 'Fishing (;f)', icon: Fish },
    {
      id: 'tracker',
      label: 'Web Tracker',
      icon: BarChart3,
      badge: logs.length > 0 ? String(logs.length) : undefined,
    },
    { id: 'settings', label: 'Buffs & Giá thị trường', icon: SlidersHorizontal },
  ];

  return (
    <div className="hud-grid-bg min-h-screen pb-14">
      <div className="mx-auto max-w-7xl space-y-4 px-3 pt-4 sm:px-6 sm:pt-6">
        {/* Top Brand Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-500/40 bg-red-500/10 shadow-[0_0_24px_-6px_rgba(239,68,68,0.5)]">
              <BallIcon ballId="pb" size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                  PokéMeow Companion
                </h1>
                <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300 uppercase">
                  Web + Discord Sync
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tính toán xác suất bắt, tối ưu EV, tự nhận diện Gen 6–7 &amp; đồng bộ trực tiếp từ
                Discord Bot.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-400">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <span>Hỗ trợ thụ động chuẩn ToS · Không tự động gửi lệnh</span>
          </div>
        </header>

        {/* Sticky Manual Cooldown Bar */}
        <CooldownBar
          wildCooldownSec={buffs.wildCooldownSec}
          fishCooldownSec={buffs.fishCooldownSec}
          soundEnabled={buffs.soundEnabled}
          onToggleSound={() => setBuffs((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
        />

        {/* Navigation Tabs */}
        <nav
          aria-label="Chức năng chính"
          className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-800/90 bg-slate-900/70 p-1.5"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
                  active
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-600/70'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    active
                      ? tab.badgeTone === 'live'
                        ? 'text-emerald-400'
                        : 'text-cyan-400'
                      : 'text-slate-400'
                  }`}
                />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                      tab.badgeTone === 'live'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-cyan-500/20 text-cyan-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Active View */}
        <main>
          {activeTab === 'discord_live' && <DiscordLiveSyncView />}

          {activeTab === 'optimizer' && (
            <BallOptimizerView
              buffs={buffs}
              economy={economy}
              onTogglePremierBall={() =>
                setBuffs((prev) => ({
                  ...prev,
                  includePremierBall: !prev.includePremierBall,
                }))
              }
              onOpenBuffSettings={() => setActiveTab('settings')}
              onQuickLog={handleAddLog}
            />
          )}

          {activeTab === 'fishing' && (
            <FishingCalculatorView
              buffs={buffs}
              economy={economy}
              fishingSetup={fishingSetup}
              onUpdateFishingSetup={setFishingSetup}
              onQuickLog={handleAddLog}
            />
          )}

          {activeTab === 'tracker' && (
            <SessionTrackerView
              logs={logs}
              buffs={buffs}
              economy={economy}
              onAddLog={handleAddLog}
              onDeleteLog={handleDeleteLog}
              onClearLogs={handleClearLogs}
            />
          )}

          {activeTab === 'settings' && (
            <BuffSettingsView
              buffs={buffs}
              economy={economy}
              onUpdateBuffs={setBuffs}
              onUpdateEconomy={setEconomy}
              onResetDefaults={() => showToast('Đã khôi phục toàn bộ thông số chuẩn Wiki.')}
            />
          )}
        </main>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 bottom-4 z-50 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-2.5 text-xs font-medium text-emerald-200 shadow-2xl backdrop-blur"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
