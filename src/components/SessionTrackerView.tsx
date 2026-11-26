'use client';

import {
  Download,
  FileSpreadsheet,
  PlusCircle,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { BallIcon } from '@/components/BallIcon';
import { BALL_ORDER, BALL_SPECS, RARITY_ORDER, RARITY_SPECS } from '@/domain/data/pokemeow-data';
import { optimizerService } from '@/domain/services/optimizer-service';
import type {
  BallId,
  BuffConfig,
  CatchLogEntry,
  EconomyConfig,
  EncounterSource,
  RarityId,
} from '@/domain/types';
import { formatCoins, formatPercent, formatSignedCoins } from '@/lib/format';
import { buildCsvContent, triggerFileDownload } from '@/lib/storage';

interface SessionTrackerViewProps {
  readonly logs: readonly CatchLogEntry[];
  readonly buffs: BuffConfig;
  readonly economy: EconomyConfig;
  readonly onAddLog: (params: {
    source: EncounterSource;
    rarityId: RarityId;
    ballId: BallId;
    caught: boolean;
    pokemonName: string;
  }) => void;
  readonly onDeleteLog: (id: string) => void;
  readonly onClearLogs: () => void;
}

type LogFilter = 'all' | 'wild' | 'fishing' | 'rare_plus';

const RARE_PLUS_SET: ReadonlySet<RarityId> = new Set([
  'super_rare',
  'legendary',
  'shiny_full',
  'shiny_event',
  'golden',
]);

export function SessionTrackerView({
  logs,
  buffs,
  economy,
  onAddLog,
  onDeleteLog,
  onClearLogs,
}: SessionTrackerViewProps) {
  const [source, setSource] = useState<EncounterSource>('wild');
  const [rarityId, setRarityId] = useState<RarityId>('common');
  const [ballId, setBallId] = useState<BallId>('pb');
  const [caught, setCaught] = useState<boolean>(true);
  const [pokemonName, setPokemonName] = useState<string>('');
  const [filter, setFilter] = useState<LogFilter>('all');
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  const stats = useMemo(() => optimizerService.calculateSessionStats(logs), [logs]);

  const previewProfit = useMemo(
    () => optimizerService.computeSingleCatchProfit(rarityId, ballId, caught, buffs, economy),
    [rarityId, ballId, caught, buffs, economy],
  );

  const filteredLogs = useMemo(() => {
    const ordered = [...logs].sort((a, b) => b.timestamp - a.timestamp);
    switch (filter) {
      case 'wild':
        return ordered.filter((entry) => entry.source === 'wild');
      case 'fishing':
        return ordered.filter((entry) => entry.source === 'fishing');
      case 'rare_plus':
        return ordered.filter((entry) => RARE_PLUS_SET.has(entry.rarityId));
      default:
        return ordered;
    }
  }, [logs, filter]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAddLog({
      source,
      rarityId,
      ballId,
      caught,
      pokemonName: pokemonName.trim(),
    });
    setPokemonName('');
  };

  const handleExportJson = () => {
    triggerFileDownload(
      `pokemeow-session-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(logs, null, 2),
      'application/json',
    );
  };

  const handleExportCsv = () => {
    triggerFileDownload(
      `pokemeow-session-${new Date().toISOString().slice(0, 10)}.csv`,
      buildCsvContent(logs),
      'text/csv;charset=utf-8;',
    );
  };

  return (
    <div className="space-y-5">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="hud-card rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-400">Tổng lượt gặp</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
            {stats.totalEncounters.toLocaleString('en-US')}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Bắt thành công: <span className="text-slate-200">{stats.totalCaught}</span>
          </div>
        </div>

        <div className="hud-card rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-400">Tỉ lệ bắt trúng</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-cyan-300">
            {formatPercent(stats.catchSuccessRate, 1)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Tổng chi bóng: <span className="font-mono">{formatCoins(stats.totalSpent)}</span>
          </div>
        </div>

        <div className="hud-card rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-400">Lời / Lỗ ròng (Net Profit)</div>
          <div
            className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
              stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatSignedCoins(stats.netProfit)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Thu ước tính: <span className="font-mono">{formatCoins(stats.totalEarned)}</span>
          </div>
        </div>

        <div className="hud-card rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-400">Bộ sưu tập hiếm</div>
          <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-xs">
            <span className="rounded-lg border border-purple-500/35 bg-purple-500/15 px-2 py-1 text-purple-200">
              L: {stats.rareHighlights.legendary}
            </span>
            <span className="rounded-lg border border-yellow-400/40 bg-yellow-400/15 px-2 py-1 text-yellow-200">
              S: {stats.rareHighlights.shiny}
            </span>
            <span className="rounded-lg border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-amber-200">
              G: {stats.rareHighlights.golden}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Catch Logger Form */}
      <form onSubmit={handleSubmit} className="hud-card rounded-2xl p-4 sm:p-5">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <PlusCircle className="h-4 w-4 text-emerald-400" />
            Ghi nhận lượt bắt mới (Thủ công)
          </h2>
          <span className="font-mono text-xs text-slate-300">
            Ước tính tác động:{' '}
            <strong
              className={previewProfit.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}
            >
              {formatSignedCoins(previewProfit.netProfit)}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label htmlFor="log-source" className="mb-1 block text-xs text-slate-400">
              Nguồn (;p / ;f)
            </label>
            <select
              id="log-source"
              value={source}
              onChange={(e) => setSource(e.target.value === 'fishing' ? 'fishing' : 'wild')}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              <option value="wild">Wild (;p)</option>
              <option value="fishing">Fishing (;f)</option>
            </select>
          </div>

          <div>
            <label htmlFor="log-rarity" className="mb-1 block text-xs text-slate-400">
              Độ hiếm
            </label>
            <select
              id="log-rarity"
              value={rarityId}
              onChange={(e) => setRarityId(e.target.value as RarityId)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              {RARITY_ORDER.map((id) => (
                <option key={id} value={id}>
                  {RARITY_SPECS[id].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="log-ball" className="mb-1 block text-xs text-slate-400">
              Loại bóng dùng
            </label>
            <select
              id="log-ball"
              value={ballId}
              onChange={(e) => setBallId(e.target.value as BallId)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              {BALL_ORDER.map((id) => (
                <option key={id} value={id}>
                  {BALL_SPECS[id].name} ({BALL_SPECS[id].shortCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="log-pokemon" className="mb-1 block text-xs text-slate-400">
              Tên Pokémon (tuỳ chọn)
            </label>
            <input
              id="log-pokemon"
              type="text"
              value={pokemonName}
              onChange={(e) => setPokemonName(e.target.value)}
              placeholder="VD: Rayquaza, Magikarp..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <span className="mb-1 block text-xs text-slate-400">Kết quả</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setCaught(true)}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                  caught
                    ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                Bắt được
              </button>
              <button
                type="button"
                onClick={() => setCaught(false)}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                  !caught
                    ? 'border-rose-500/60 bg-rose-500/20 text-rose-200'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                Chạy mất
              </button>
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95"
            >
              + Thêm vào nhật ký
            </button>
          </div>
        </div>
      </form>

      {/* Breakdown Bars */}
      {logs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="hud-card rounded-2xl p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-300 uppercase">
              <TrendingUp className="h-4 w-4 text-cyan-400" />
              Phân bổ theo Độ hiếm
            </h3>
            <div className="space-y-2.5">
              {RARITY_ORDER.map((id) => {
                const bucket = stats.byRarity[id];
                if (bucket.seen === 0) return null;
                const pct = (bucket.seen / stats.totalEncounters) * 100;
                return (
                  <div key={id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200">{RARITY_SPECS[id].label}</span>
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
              Hiệu quả theo Loại bóng
            </h3>
            <div className="space-y-2.5">
              {BALL_ORDER.map((id) => {
                const bucket = stats.byBall[id];
                if (bucket.used === 0) return null;
                const pct = (bucket.used / stats.totalEncounters) * 100;
                return (
                  <div key={id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-slate-200">
                        <BallIcon ballId={id} size={16} />
                        {BALL_SPECS[id].name}
                      </span>
                      <span className="font-mono text-slate-300">
                        {bucket.caught}/{bucket.used} ({formatSignedCoins(bucket.netProfit)})
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

      {/* History Log Table */}
      <section className="hud-card rounded-2xl p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'wild', label: 'Wild (;p)' },
                { id: 'fishing', label: 'Fishing (;f)' },
                { id: 'rare_plus', label: 'SR / L / Shiny' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  filter === tab.id
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={logs.length === 0}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Xuất CSV
            </button>
            <button
              type="button"
              disabled={logs.length === 0}
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Xuất JSON
            </button>

            {logs.length > 0 &&
              (!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xoá phiên
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClearLogs();
                      setConfirmReset(false);
                    }}
                    className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    Xác nhận xoá hết
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300"
                  >
                    Huỷ
                  </button>
                </div>
              ))}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-900/50 py-10 text-center">
            <p className="text-sm font-medium text-slate-300">
              Chưa có lượt bắt nào được ghi nhận trong bộ lọc này.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Bạn có thể bấm nút <strong>Ghi nhanh</strong> ở tab Ball Optimizer / Fishing
              Calculator hoặc nhập ở biểu mẫu phía trên.
            </p>
          </div>
        ) : (
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
                {filteredLogs.map((entry) => {
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
                          onClick={() => onDeleteLog(entry.id)}
                          title="Xoá dòng này"
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
        )}
      </section>
    </div>
  );
}
