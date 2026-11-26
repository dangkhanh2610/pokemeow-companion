'use client';

import { Fish, Play, RotateCcw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { playCooldownChime } from '@/lib/sound';

interface CooldownBarProps {
  readonly wildCooldownSec: number;
  readonly fishCooldownSec: number;
  readonly soundEnabled: boolean;
  readonly onToggleSound: () => void;
}

interface TimerState {
  readonly endAtMs: number | null;
  readonly totalMs: number;
}

function getRemainingMs(timer: TimerState, nowMs: number): number {
  if (timer.endAtMs === null) return 0;
  return Math.max(0, timer.endAtMs - nowMs);
}

export function CooldownBar({
  wildCooldownSec,
  fishCooldownSec,
  soundEnabled,
  onToggleSound,
}: CooldownBarProps) {
  const [wildTimer, setWildTimer] = useState<TimerState>({
    endAtMs: null,
    totalMs: wildCooldownSec * 1000,
  });
  const [fishTimer, setFishTimer] = useState<TimerState>({
    endAtMs: null,
    totalMs: fishCooldownSec * 1000,
  });
  const [nowMs, setNowMs] = useState<number>(0);

  const prevWildRemainingRef = useRef<number>(0);
  const prevFishRemainingRef = useRef<number>(0);

  const startWildTimer = useCallback(() => {
    const now = Date.now();
    const durationMs = wildCooldownSec * 1000;
    setNowMs(now);
    prevWildRemainingRef.current = durationMs;
    setWildTimer({ endAtMs: now + durationMs, totalMs: durationMs });
  }, [wildCooldownSec]);

  const startFishTimer = useCallback(() => {
    const now = Date.now();
    const durationMs = fishCooldownSec * 1000;
    setNowMs(now);
    prevFishRemainingRef.current = durationMs;
    setFishTimer({ endAtMs: now + durationMs, totalMs: durationMs });
  }, [fishCooldownSec]);

  const resetAllTimers = useCallback(() => {
    prevWildRemainingRef.current = 0;
    prevFishRemainingRef.current = 0;
    setWildTimer({ endAtMs: null, totalMs: wildCooldownSec * 1000 });
    setFishTimer({ endAtMs: null, totalMs: fishCooldownSec * 1000 });
  }, [wildCooldownSec, fishCooldownSec]);

  const isAnyRunning = wildTimer.endAtMs !== null || fishTimer.endAtMs !== null;

  useEffect(() => {
    if (!isAnyRunning) return;

    const intervalId = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);

      if (wildTimer.endAtMs !== null) {
        const remaining = Math.max(0, wildTimer.endAtMs - current);
        if (prevWildRemainingRef.current > 0 && remaining === 0) {
          if (soundEnabled) playCooldownChime('wild');
          setWildTimer({ endAtMs: null, totalMs: wildCooldownSec * 1000 });
        }
        prevWildRemainingRef.current = remaining;
      }

      if (fishTimer.endAtMs !== null) {
        const remaining = Math.max(0, fishTimer.endAtMs - current);
        if (prevFishRemainingRef.current > 0 && remaining === 0) {
          if (soundEnabled) playCooldownChime('fish');
          setFishTimer({ endAtMs: null, totalMs: fishCooldownSec * 1000 });
        }
        prevFishRemainingRef.current = remaining;
      }
    }, 80);

    return () => window.clearInterval(intervalId);
  }, [isAnyRunning, wildTimer.endAtMs, fishTimer.endAtMs, soundEnabled, wildCooldownSec, fishCooldownSec]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === 'p') {
        startWildTimer();
      } else if (key === 'f') {
        startFishTimer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [startWildTimer, startFishTimer]);

  const wildRemainingMs = getRemainingMs(wildTimer, nowMs);
  const fishRemainingMs = getRemainingMs(fishTimer, nowMs);
  const wildPct = wildTimer.endAtMs !== null ? (wildRemainingMs / wildTimer.totalMs) * 100 : 0;
  const fishPct = fishTimer.endAtMs !== null ? (fishRemainingMs / fishTimer.totalMs) * 100 : 0;

  return (
    <section
      aria-label="Đồng hồ đếm ngược cooldown thủ công"
      className="hud-card sticky top-2 z-30 rounded-2xl px-3.5 py-2.5 backdrop-blur-md"
    >
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
            <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
              Cooldown HUD
            </span>
            <span className="hidden rounded bg-slate-800/90 px-1.5 py-0.5 text-[11px] text-slate-400 sm:inline">
              Nhấn phím <kbd className="font-mono text-slate-200">P</kbd> /{' '}
              <kbd className="font-mono text-slate-200">F</kbd> để bấm giờ thủ công
            </span>
          </div>

          <div className="flex items-center gap-1.5 lg:hidden">
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Tắt âm báo' : 'Bật âm báo'}
              className="rounded-lg border border-slate-700/70 bg-slate-800/80 p-1.5 text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:items-center lg:gap-3">
          {/* Wild ;p timer */}
          <div className="relative overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/90 px-3 py-1.5 sm:min-w-[230px]">
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-red-500/15 transition-[width] duration-75"
              style={{ width: `${wildPct}%` }}
            />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-red-400" />
                <div>
                  <div className="text-[11px] font-medium text-slate-400">Catch (;p)</div>
                  <div
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      wildRemainingMs > 0 ? 'text-amber-300' : 'text-emerald-400'
                    }`}
                  >
                    {wildRemainingMs > 0
                      ? `${(wildRemainingMs / 1000).toFixed(1)}s`
                      : 'Sẵn sàng!'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={startWildTimer}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-200 transition hover:bg-red-500/25 active:scale-95"
              >
                <Play className="h-3 w-3" />
                {wildCooldownSec}s
              </button>
            </div>
          </div>

          {/* Fish ;f timer */}
          <div className="relative overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/90 px-3 py-1.5 sm:min-w-[230px]">
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-cyan-500/15 transition-[width] duration-75"
              style={{ width: `${fishPct}%` }}
            />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Fish className="h-4 w-4 text-cyan-400" />
                <div>
                  <div className="text-[11px] font-medium text-slate-400">Fish (;f)</div>
                  <div
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      fishRemainingMs > 0 ? 'text-amber-300' : 'text-emerald-400'
                    }`}
                  >
                    {fishRemainingMs > 0
                      ? `${(fishRemainingMs / 1000).toFixed(1)}s`
                      : 'Sẵn sàng!'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={startFishTimer}
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/25 active:scale-95"
              >
                <Play className="h-3 w-3" />
                {fishCooldownSec}s
              </button>
            </div>
          </div>

          <div className="hidden items-center gap-1.5 lg:flex">
            <button
              type="button"
              onClick={resetAllTimers}
              title="Đặt lại đồng hồ"
              className="rounded-lg border border-slate-700/70 bg-slate-800/80 p-2 text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Tắt âm báo' : 'Bật âm báo'}
              className="rounded-lg border border-slate-700/70 bg-slate-800/80 p-2 text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
