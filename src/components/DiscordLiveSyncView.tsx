'use client';

import {
  Award,
  Bot,
  Crown,
  Download,
  FileSpreadsheet,
  Flame,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Waves,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DiscordSyncPayload, DiscordSyncedUser } from '@/app/api/discord-sync/route';
import { BallIcon } from '@/components/BallIcon';
import { BALL_ORDER, BALL_SPECS, RARITY_ORDER, RARITY_SPECS } from '@/domain/data/pokemeow-data';
import type { BuffConfig } from '@/domain/types';
import { formatCoins, formatPercent, formatSignedCoins } from '@/lib/format';
import { buildCsvContent, triggerFileDownload } from '@/lib/storage';

function formatCountdown(targetMs: number, nowMs: number, readyText: string): string {
  const diffSec = Math.max(0, Math.round((targetMs - nowMs) / 1000));
  if (diffSec === 0) return readyText;
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function getTrainerLabel(user: DiscordSyncedUser, idx: number): string {
  if (user.displayName.trim().length > 0) return user.displayName;
  return `Trainer #${idx + 1} (${user.userId.slice(-4)})`;
}

export function DiscordLiveSyncView() {
  const [payload, setPayload] = useState<DiscordSyncPayload | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRemoteControls, setShowRemoteControls] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(0);

  const fetchSync = useCallback(async () => {
    try {
      const res = await fetch('/api/discord-sync', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as DiscordSyncPayload;
      setPayload(data);
      setNowMs(Date.now());
      setErrorMsg(null);
      setSelectedUserId((prev) => {
        if (prev && data.users.some((u) => u.userId === prev)) {
          return prev;
        }
        return data.users[0]?.userId ?? null;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể đọc dữ liệu bot-state.json');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const mutateSync = useCallback(async (body: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/discord-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const updated = (await res.json()) as DiscordSyncPayload;
      setPayload(updated);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Cập nhật thất bại');
    } finally {
      setIsSaving(false);
    }
  }, []);

  useEffect(() => {
    void fetchSync();
  }, [fetchSync]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => {
      void fetchSync();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, fetchSync]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  const activeUser: DiscordSyncedUser | undefined = useMemo(() => {
    if (!payload) return undefined;
    return payload.users.find((u) => u.userId === selectedUserId) ?? payload.users[0];
  }, [payload, selectedUserId]);

  const leaderboardUsers = useMemo(() => {
    if (!payload) return [];
    return [...payload.users]
      .filter((u) => u.stats.totalEncounters > 0)
      .sort((a, b) => b.profitReport.releaseNetProfit - a.profitReport.releaseNetProfit);
  }, [payload]);

  const channelEntries = useMemo(() => {
    if (!payload) return [];
    return Object.entries(payload.channels);
  }, [payload]);

  const handlePatchUserBuffs = (patch: Partial<BuffConfig>, remindersEnabled?: boolean) => {
    if (!activeUser) return;
    void mutateSync({
      action: 'update_user_buffs',
      userId: activeUser.userId,
      patch,
      ...(remindersEnabled !== undefined ? { remindersEnabled } : {}),
    });
  };

  const handleCleanCorrupted = () => {
    if (!activeUser) return;
    void mutateSync({
      action: 'clean_corrupted_logs',
      userId: activeUser.userId,
    });
  };

  const handleDeleteDiscordLog = (logId: string) => {
    if (!activeUser) return;
    void mutateSync({
      action: 'delete_log',
      userId: activeUser.userId,
      logId,
    });
  };

  const handleExportCsv = () => {
    if (!activeUser) return;
    triggerFileDownload(
      `discord-pokemeow-${activeUser.userId}.csv`,
      buildCsvContent(activeUser.recentLogs),
      'text/csv;charset=utf-8;',
    );
  };

  const handleExportJson = () => {
    if (!activeUser) return;
    triggerFileDownload(
      `discord-pokemeow-${activeUser.userId}.json`,
      JSON.stringify(activeUser.recentLogs, null, 2),
      'application/json',
    );
  };

  return (
    <div className="space-y-5">
      {/* Live Status & Remote Control Toggle Bar */}
      <div className="hud-card flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
            <Radio className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Đồng bộ 2 chiều 5s' : 'Đã tạm dừng'}
          </span>
          <span className="text-xs text-slate-300">
            Nguồn:{' '}
            <code className="font-mono text-cyan-300">
              {payload?.storageBackend === 'postgresql'
                ? 'PostgreSQL (Vercel Live)'
                : 'data/bot-state.json'}
            </code>
            {isSaving ? ' · Đang lưu thay đổi...' : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRemoteControls((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              showRemoteControls
                ? 'border-amber-400/60 bg-amber-400/15 text-amber-200'
                : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-400/40'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            Điều khiển Bot từ xa
          </button>

          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500"
          >
            {autoRefresh ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {autoRefresh ? 'Tạm dừng' : 'Tiếp tục'}
          </button>

          <button
            type="button"
            onClick={() => void fetchSync()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Làm mới
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200">
          Lỗi đồng bộ dữ liệu Discord: {errorMsg}
        </div>
      )}

      {/* Global Golden Fishing Hour Banner */}
      {payload?.goldenHour.startAtMs !== null && payload?.goldenHour.startAtMs !== undefined && (
        <div className="flex items-center justify-between rounded-2xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-3 text-xs">
          <div className="flex items-center gap-2 text-cyan-200">
            <Waves className="h-4 w-4 text-cyan-300" />
            <span className="font-semibold">Báo thức Golden Fishing Hour (;seaflute):</span>
          </div>
          <span className="font-mono text-sm font-bold tabular-nums text-cyan-300">
            {formatCountdown(payload.goldenHour.startAtMs, nowMs, 'Đang diễn ra Golden Hour!')}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="hud-card rounded-2xl py-12 text-center text-sm text-slate-400">
          Đang tải dữ liệu phiên chơi từ Discord Bot...
        </div>
      ) : !payload || payload.users.length === 0 ? (
        <div className="hud-card rounded-2xl py-12 text-center">
          <p className="text-sm font-semibold text-slate-200">
            Chưa có người chơi nào được ghi nhận trong <code>data/bot-state.json</code>.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Hãy chạy <code>npm run bot:dev</code>, bật <code>/helper on</code> trên Discord và bắt
            vài con Pokémon để dữ liệu tự đổ về đây!
          </p>
        </div>
      ) : (
        <>
          {/* Trainer Selector Pills with Real Discord Avatar & Name */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Thành viên Server:
            </span>
            {payload.users.map((u, idx) => {
              const isSelected = activeUser?.userId === u.userId;
              const label = getTrainerLabel(u, idx);
              return (
                <button
                  key={u.userId}
                  type="button"
                  onClick={() => setSelectedUserId(u.userId)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? 'border-cyan-400/70 bg-cyan-500/15 text-white ring-1 ring-cyan-400/30'
                      : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white'
                  }`}
                >
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.avatarUrl}
                      alt={label}
                      className="h-5 w-5 rounded-full object-cover ring-1 ring-slate-600"
                    />
                  ) : (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-cyan-300">
                      {label.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span>{label}</span>
                  <span className="rounded-full bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                    {u.stats.totalEncounters} lượt
                  </span>
                </button>
              );
            })}
          </div>

          {activeUser && (
            <>
              {/* Corrupted Legacy Log Cleaner Banner */}
              {activeUser.corruptedLogsCount > 0 && (
                <div className="flex flex-col gap-2.5 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-amber-100">
                    <strong>Phát hiện {activeUser.corruptedLogsCount} bản ghi lỗi cũ</strong> (tính
                    nhầm <code>Masterball -100,000 PC</code> từ phiên bản đầu). Bạn có thể dọn sạch
                    riêng các dòng lỗi này mà vẫn giữ nguyên toàn bộ lượt bắt chuẩn mới nhất!
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleCleanCorrupted}
                    className="shrink-0 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                  >
                    🧹 Dọn {activeUser.corruptedLogsCount} dòng lỗi ngay
                  </button>
                </div>
              )}

              {/* Two-Way Remote Control Panel (Web -> Discord Bot) */}
              {showRemoteControls && (
                <section className="hud-card space-y-4 rounded-2xl border-amber-400/35 p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                      <Sliders className="h-4 w-4 text-amber-300" />
                      Điều khiển trực tiếp Discord Bot cho{' '}
                      {activeUser.displayName || `ID ${activeUser.userId}`}
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      Áp dụng ngay lập tức trên Discord (không cần khởi động lại bot)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* User Discord Buffs */}
                    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
                      <div className="text-xs font-semibold text-slate-200">
                        Cấu hình Buff &amp; Định giá của người chơi này
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handlePatchUserBuffs({ valuationMode: 'release' })}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                            activeUser.buffs.valuationMode === 'release'
                              ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
                              : 'border-slate-700 bg-slate-950 text-slate-400'
                          }`}
                        >
                          💵 Xu mặt (;release)
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePatchUserBuffs({ valuationMode: 'market' })}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                            activeUser.buffs.valuationMode === 'market'
                              ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200'
                              : 'border-slate-700 bg-slate-950 text-slate-400'
                          }`}
                        >
                          💎 Giá chợ (;market)
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-400">
                            Amulet (0–10)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={activeUser.buffs.amuletCoins}
                            onChange={(e) =>
                              handlePatchUserBuffs({
                                amuletCoins: Math.min(10, Math.max(0, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-400">
                            Clan CR (%)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={25}
                            value={activeUser.buffs.clanCatchRatePct}
                            onChange={(e) =>
                              handlePatchUserBuffs({
                                clanCatchRatePct: Math.min(
                                  25,
                                  Math.max(0, Number(e.target.value) || 0),
                                ),
                              })
                            }
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-400">
                            CD ;p (giây)
                          </label>
                          <input
                            type="number"
                            min={4}
                            max={30}
                            value={activeUser.buffs.wildCooldownSec}
                            onChange={(e) =>
                              handlePatchUserBuffs({
                                wildCooldownSec: Math.min(
                                  30,
                                  Math.max(4, Number(e.target.value) || 8),
                                ),
                              })
                            }
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-400">
                            CD ;f (giây)
                          </label>
                          <input
                            type="number"
                            min={4}
                            max={30}
                            value={activeUser.buffs.fishCooldownSec}
                            onChange={(e) =>
                              handlePatchUserBuffs({
                                fishCooldownSec: Math.min(
                                  30,
                                  Math.max(4, Number(e.target.value) || 20),
                                ),
                              })
                            }
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 pt-1 text-xs">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-300">
                          <input
                            type="checkbox"
                            checked={activeUser.buffs.patreonNinja}
                            onChange={(e) =>
                              handlePatchUserBuffs({ patreonNinja: e.target.checked })
                            }
                            className="accent-purple-500"
                          />
                          Patreon Ninja (+5%)
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-300">
                          <input
                            type="checkbox"
                            checked={activeUser.remindersEnabled}
                            onChange={(e) => handlePatchUserBuffs({}, e.target.checked)}
                            className="accent-emerald-500"
                          />
                          Ping nhắc Cooldown
                        </label>
                      </div>
                    </div>

                    {/* Discord Channel Settings */}
                    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
                      <div className="text-xs font-semibold text-slate-200">
                        Cấu hình Kênh Discord (Auto-Clean &amp; Lọc độ hiếm)
                      </div>

                      {channelEntries.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          Chưa có kênh nào chạy <code>/helper on</code>.
                        </p>
                      ) : (
                        channelEntries.map(([chId, ch]) => (
                          <div
                            key={chId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
                          >
                            <span className="font-mono text-slate-300">#{chId.slice(-6)}</span>

                            <label className="inline-flex cursor-pointer items-center gap-1 text-slate-300">
                              <input
                                type="checkbox"
                                checked={ch.enabled}
                                onChange={(e) =>
                                  void mutateSync({
                                    action: 'update_channel_settings',
                                    channelId: chId,
                                    patch: { enabled: e.target.checked },
                                  })
                                }
                                className="accent-emerald-500"
                              />
                              Bật
                            </label>

                            <label className="inline-flex cursor-pointer items-center gap-1 text-slate-300">
                              <input
                                type="checkbox"
                                checked={ch.onlyRarePlus}
                                onChange={(e) =>
                                  void mutateSync({
                                    action: 'update_channel_settings',
                                    channelId: chId,
                                    patch: { onlyRarePlus: e.target.checked },
                                  })
                                }
                                className="accent-amber-400"
                              />
                              Chỉ Rare+
                            </label>

                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-slate-400">Xoá sau:</span>
                              <input
                                type="number"
                                min={0}
                                max={60}
                                value={ch.autoCleanSec}
                                onChange={(e) =>
                                  void mutateSync({
                                    action: 'update_channel_settings',
                                    channelId: chId,
                                    patch: {
                                      autoCleanSec: Math.min(
                                        60,
                                        Math.max(0, Number(e.target.value) || 0),
                                      ),
                                    },
                                  })
                                }
                                className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-right font-mono text-xs text-white"
                              />
                              <span className="text-[11px] text-slate-400">s</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* CatchBot Active Banner */}
              {activeUser.catchbotReturnAtMs !== null && (
                <div className="flex items-center justify-between rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-200">
                    <Bot className="h-4 w-4 text-amber-300" />
                    <span className="font-semibold">Hẹn giờ thu hoạch CatchBot (;cb):</span>
                  </div>
                  <span className="font-mono text-sm font-bold tabular-nums text-amber-300">
                    {formatCountdown(
                      activeUser.catchbotReturnAtMs,
                      nowMs,
                      'Sẵn sàng thu hoạch (;cb)!',
                    )}
                  </span>
                </div>
              )}

              {/* 4 Live KPI Cards + Pity Counter */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="hud-card rounded-2xl p-4">
                  <div className="text-xs font-medium text-slate-400">Lượt bắt trên Discord</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                    {activeUser.stats.totalCaught}/{activeUser.stats.totalEncounters}
                  </div>
                  <div className="mt-1 text-xs text-cyan-300">
                    Tỉ lệ trúng:{' '}
                    <strong>{formatPercent(activeUser.stats.catchSuccessRate, 1)}</strong>
                  </div>
                </div>

                <div className="hud-card rounded-2xl p-4">
                  <div className="text-xs font-medium text-slate-400">
                    💵 Lời/Lỗ Xu Mặt (;release)
                  </div>
                  <div
                    className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                      activeUser.profitReport.releaseNetProfit >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {formatSignedCoins(activeUser.profitReport.releaseNetProfit)}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-400">
                    Nhịp cày: {formatSignedCoins(activeUser.profitReport.releaseCoinsPerHour)}/giờ
                  </div>
                </div>

                <div className="hud-card rounded-2xl p-4">
                  <div className="text-xs font-medium text-slate-400">
                    💎 Lời/Lỗ Tài Sản (;market)
                  </div>
                  <div
                    className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                      activeUser.profitReport.marketNetProfit >= 0
                        ? 'text-emerald-300'
                        : 'text-rose-300'
                    }`}
                  >
                    {formatSignedCoins(activeUser.profitReport.marketNetProfit)}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-400">
                    Chi bóng: {formatCoins(activeUser.profitReport.totalBallSpent)}
                  </div>
                </div>

                <div className="hud-card rounded-2xl p-4">
                  <div className="flex items-center gap-1 text-xs font-medium text-purple-300">
                    <Flame className="h-3.5 w-3.5" />
                    Bộ đếm Độ Đen (Pity)
                  </div>
                  <div className="mt-1 font-mono text-xl font-bold tabular-nums text-white">
                    {activeUser.pity.encountersSinceLegendaryOrShiny} lượt{' '}
                    <span className="text-xs font-normal text-slate-400">chưa L/S</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Chưa ra SR+: <strong>{activeUser.pity.encountersSinceSuperRarePlus}</strong> lượt
                  </div>
                </div>
              </div>

              {/* Daily Quests & Server Leaderboard + Hall of Fame */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Server Leaderboard */}
                <div className="hud-card rounded-2xl p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-amber-300 uppercase">
                    <Crown className="h-4 w-4" />
                    Bảng Xếp Hạng Đua Top Cày Xu Server
                  </h3>
                  <div className="space-y-2">
                    {leaderboardUsers.map((u, idx) => {
                      const label = getTrainerLabel(u, idx);
                      const medals = ['🥇', '🥈', '🥉'];
                      return (
                        <div
                          key={u.userId}
                          className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span>{medals[idx] ?? `#${idx + 1}`}</span>
                            {u.avatarUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={u.avatarUrl}
                                alt={label}
                                className="h-5 w-5 rounded-full object-cover"
                              />
                            )}
                            <span className="font-semibold text-white">{label}</span>
                          </div>
                          <div className="text-right font-mono">
                            <span
                              className={
                                u.profitReport.releaseNetProfit >= 0
                                  ? 'font-bold text-emerald-400'
                                  : 'font-bold text-rose-400'
                              }
                            >
                              {formatSignedCoins(u.profitReport.releaseNetProfit)}
                            </span>
                            <span className="ml-2 text-slate-400">
                              ({u.stats.totalCaught}/{u.stats.totalEncounters})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Active Quests OR Hall of Fame */}
                <div className="hud-card rounded-2xl p-4">
                  {activeUser.quests.length > 0 ? (
                    <>
                      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-300 uppercase">
                        <Target className="h-4 w-4" />
                        Tiến độ Quest hằng ngày (;q)
                      </h3>
                      <div className="space-y-2.5">
                        {activeUser.quests.map((q) => {
                          const pct = Math.min(100, Math.round((q.current / q.goal) * 100));
                          return (
                            <div key={q.index} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate font-medium text-slate-200">
                                  #{q.index}. {q.description}
                                </span>
                                <span className="ml-2 shrink-0 font-mono text-emerald-300">
                                  {q.current}/{q.goal}
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-emerald-400 transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-purple-300 uppercase">
                        <Award className="h-4 w-4" />
                        Bảo Tàng Hàng Hiếm (Hall of Fame) &amp; Quest
                      </h3>
                      {payload.hallOfFame.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          • Gõ <code>;q</code> trên Discord để đồng bộ thanh tiến độ Quest hằng ngày
                          lên đây!
                          <br />• Các pha bắt trúng <strong>Legendary / Shiny / Golden</strong> sẽ
                          tự động được vinh danh tại bảng vàng này.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {payload.hallOfFame.slice(0, 5).map((h) => (
                            <div
                              key={h.id}
                              className="flex items-center justify-between rounded-xl border border-purple-500/25 bg-purple-500/10 px-3 py-1.5 text-xs"
                            >
                              <span className="font-semibold text-purple-100">
                                🌟 {h.pokemonName} ({RARITY_SPECS[h.rarityId].shortLabel})
                              </span>
                              <span className="text-slate-300">
                                {h.displayName || h.userId.slice(-4)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Breakdown Charts */}
              {activeUser.stats.totalEncounters > 0 && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="hud-card rounded-2xl p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-300 uppercase">
                      <TrendingUp className="h-4 w-4 text-cyan-400" />
                      Phân bổ theo Độ hiếm (Discord)
                    </h3>
                    <div className="space-y-2.5">
                      {RARITY_ORDER.map((id) => {
                        const bucket = activeUser.stats.byRarity[id];
                        if (bucket.seen === 0) return null;
                        const pct = (bucket.seen / activeUser.stats.totalEncounters) * 100;
                        return (
                          <div key={id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-200">
                                {RARITY_SPECS[id].label}
                              </span>
                              <span className="font-mono text-slate-300">
                                {bucket.caught}/{bucket.seen} ({formatSignedCoins(bucket.netProfit)})
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: RARITY_SPECS[id].hexColor,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="hud-card rounded-2xl p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-300 uppercase">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      Hiệu quả từng Loại bóng (Xu mặt ;release)
                    </h3>
                    <div className="space-y-2.5">
                      {BALL_ORDER.map((id) => {
                        const bucket = activeUser.profitReport.byBall[id];
                        if (bucket.used === 0) return null;
                        const pct = (bucket.used / activeUser.stats.totalEncounters) * 100;
                        return (
                          <div key={id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5 font-medium text-slate-200">
                                <BallIcon ballId={id} size={16} />
                                {BALL_SPECS[id].name}
                              </span>
                              <span className="font-mono text-slate-300">
                                {bucket.caught}/{bucket.used} (
                                {formatSignedCoins(bucket.releaseNet)})
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: BALL_SPECS[id].accentColor,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Live Catch Feed Table with Delete Control */}
              <section className="hud-card rounded-2xl p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Nhật ký bắt Pokémon trực tiếp từ Discord (150 lượt gần nhất)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Tự động tách biệt nhiều người chơi trong cùng kênh và cho phép xoá dòng lỗi
                      trực tiếp từ Web.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={activeUser.recentLogs.length === 0}
                      onClick={handleExportCsv}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 disabled:opacity-40"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Xuất CSV
                    </button>
                    <button
                      type="button"
                      disabled={activeUser.recentLogs.length === 0}
                      onClick={handleExportJson}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Xuất JSON
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                        <th className="py-2 pr-3">Thời gian</th>
                        <th className="px-3 py-2">Nguồn</th>
                        <th className="px-3 py-2">Độ hiếm / Pokémon</th>
                        <th className="px-3 py-2">Bóng</th>
                        <th className="px-3 py-2">Kết quả</th>
                        <th className="px-3 py-2 text-right">Lời / Lỗ</th>
                        <th className="py-2 pl-3 text-right">Xoá</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {activeUser.recentLogs.map((entry) => {
                        const rarity = RARITY_SPECS[entry.rarityId];
                        const ball = BALL_SPECS[entry.ballId];
                        return (
                          <tr key={entry.id} className="hover:bg-slate-800/35">
                            <td className="py-2.5 pr-3 font-mono text-slate-400">
                              {new Date(entry.timestamp).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
                                  entry.source === 'fishing'
                                    ? 'bg-cyan-500/15 text-cyan-300'
                                    : 'bg-red-500/15 text-red-300'
                                }`}
                              >
                                {entry.source === 'fishing' ? ';f' : ';p'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${rarity.colorClass}`}
                                >
                                  {rarity.shortLabel}
                                </span>
                                <span className="font-medium text-slate-100">
                                  {entry.pokemonName || rarity.label}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5 text-slate-200">
                                <BallIcon ballId={entry.ballId} size={18} />
                                <span>{ball.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`font-semibold ${
                                  entry.caught ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {entry.caught ? 'Bắt được' : 'Chạy mất'}
                              </span>
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${
                                entry.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatSignedCoins(entry.netProfit)}
                            </td>
                            <td className="py-2.5 pl-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteDiscordLog(entry.id)}
                                title="Xoá dòng này khỏi Discord state"
                                className="rounded-lg p-1 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
