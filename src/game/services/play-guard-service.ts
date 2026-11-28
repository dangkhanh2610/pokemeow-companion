export const DAILY_PLAY_LIMIT = 500;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const COMMAND_MIN_INTERVAL_MS = 1_500;
export const INTERACTION_MIN_INTERVAL_MS = 650;
export const SPAM_WINDOW_MS = 10_000;
export const MAX_COMMANDS_PER_WINDOW = 6;
export const MAX_INTERACTIONS_PER_WINDOW = 10;
export const WARN_THROTTLE_MS = 4_000;
export const STRIKE_WINDOW_MS = 60_000;
export const SPAM_CAPTCHA_STRIKE_THRESHOLD = 4;

/**
 * Returns the YYYY-MM-DD calendar date in Vietnam time (UTC+7).
 */
export function getVietnamDayKey(now: Date = new Date()): string {
  const vnTime = new Date(now.getTime() + VN_OFFSET_MS);
  return vnTime.toISOString().slice(0, 10);
}

/**
 * Returns the UTC Date corresponding to the next 00:00:00 in Vietnam time (UTC+7).
 */
export function getNextVietnamMidnight(now: Date = new Date()): Date {
  const vnTimeMs = now.getTime() + VN_OFFSET_MS;
  const nextVnDayStartMs = (Math.floor(vnTimeMs / DAY_MS) + 1) * DAY_MS;
  return new Date(nextVnDayStartMs - VN_OFFSET_MS);
}

/**
 * Computes effective daily turns used today (resets automatically when the VN date changes).
 */
export function resolveDailyTurnsUsed(
  dailyTurnsUsed: number,
  dailyTurnsDate: string,
  now: Date = new Date(),
): number {
  const todayKey = getVietnamDayKey(now);
  return dailyTurnsDate === todayKey ? Math.max(0, dailyTurnsUsed) : 0;
}

export function formatDailyLimitMessage(resetsAt: Date): string {
  const resetEpoch = Math.floor(resetsAt.getTime() / 1000);
  return (
    `Bạn đã dùng hết **${DAILY_PLAY_LIMIT}/${DAILY_PLAY_LIMIT}** lượt chơi hôm nay! ` +
    `Lượt chơi sẽ làm mới <t:${resetEpoch}:R> (00:00 giờ VN). Bạn vẫn có thể xem \`;box\`, mua đồ \`;s\` hoặc điểm danh \`;dl\`.`
  );
}

export type SpamCheckResult =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly retryAfterMs: number;
      readonly shouldWarn: boolean;
      readonly triggerCaptcha: boolean;
    };

interface UserSpamState {
  commandTimestamps: number[];
  interactionTimestamps: number[];
  lastCommandAcceptedAtMs: number;
  lastInteractionAcceptedAtMs: number;
  lastWarnedAtMs: number;
  strikeTimestamps: number[];
}

const MAX_SPAM_CACHE_USERS = 5_000;
const STALE_USER_MS = 10 * 60 * 1000;

export class CommandSpamGuard {
  private readonly states = new Map<string, UserSpamState>();

  private getOrCreateState(userId: string, nowMs: number): UserSpamState {
    if (!this.states.has(userId) && this.states.size >= MAX_SPAM_CACHE_USERS) {
      for (const [id, entry] of this.states.entries()) {
        const lastActivity = Math.max(
          entry.lastCommandAcceptedAtMs,
          entry.lastInteractionAcceptedAtMs,
          entry.lastWarnedAtMs,
        );
        if (nowMs - lastActivity > STALE_USER_MS) {
          this.states.delete(id);
        }
      }
      if (this.states.size >= MAX_SPAM_CACHE_USERS) {
        const oldestKey = this.states.keys().next().value;
        if (oldestKey !== undefined) {
          this.states.delete(oldestKey);
        }
      }
    }

    let state = this.states.get(userId);
    if (!state) {
      state = {
        commandTimestamps: [],
        interactionTimestamps: [],
        lastCommandAcceptedAtMs: 0,
        lastInteractionAcceptedAtMs: 0,
        lastWarnedAtMs: 0,
        strikeTimestamps: [],
      };
      this.states.set(userId, state);
    }
    return state;
  }

  public checkAndRecord(
    userId: string,
    kind: 'command' | 'interaction' = 'command',
    nowMs: number = Date.now(),
  ): SpamCheckResult {
    const state = this.getOrCreateState(userId, nowMs);
    const minInterval =
      kind === 'command' ? COMMAND_MIN_INTERVAL_MS : INTERACTION_MIN_INTERVAL_MS;
    const maxPerWindow =
      kind === 'command' ? MAX_COMMANDS_PER_WINDOW : MAX_INTERACTIONS_PER_WINDOW;
    const timestamps =
      kind === 'command' ? state.commandTimestamps : state.interactionTimestamps;
    const lastAcceptedAt =
      kind === 'command' ? state.lastCommandAcceptedAtMs : state.lastInteractionAcceptedAtMs;

    const pruned = timestamps.filter((t) => nowMs - t < SPAM_WINDOW_MS);
    if (kind === 'command') {
      state.commandTimestamps = pruned;
    } else {
      state.interactionTimestamps = pruned;
    }

    const intervalElapsed = nowMs - lastAcceptedAt;
    const intervalViolated = lastAcceptedAt > 0 && intervalElapsed < minInterval;
    const windowViolated = pruned.length >= maxPerWindow;

    if (!intervalViolated && !windowViolated) {
      pruned.push(nowMs);
      if (kind === 'command') {
        state.lastCommandAcceptedAtMs = nowMs;
      } else {
        state.lastInteractionAcceptedAtMs = nowMs;
      }
      return { allowed: true };
    }

    let retryAfterMs = intervalViolated ? minInterval - intervalElapsed : 0;
    if (windowViolated && pruned.length > 0) {
      const oldestInWindow = pruned[0]!;
      retryAfterMs = Math.max(retryAfterMs, oldestInWindow + SPAM_WINDOW_MS - nowMs);
    }
    retryAfterMs = Math.max(250, retryAfterMs);

    state.strikeTimestamps = state.strikeTimestamps.filter((t) => nowMs - t < STRIKE_WINDOW_MS);
    state.strikeTimestamps.push(nowMs);

    if (state.strikeTimestamps.length >= SPAM_CAPTCHA_STRIKE_THRESHOLD) {
      state.strikeTimestamps = [];
      state.lastWarnedAtMs = nowMs;
      return {
        allowed: false,
        retryAfterMs,
        shouldWarn: true,
        triggerCaptcha: true,
      };
    }

    const shouldWarn = nowMs - state.lastWarnedAtMs >= WARN_THROTTLE_MS;
    if (shouldWarn) {
      state.lastWarnedAtMs = nowMs;
    }

    return {
      allowed: false,
      retryAfterMs,
      shouldWarn,
      triggerCaptcha: false,
    };
  }

  public resetUser(userId: string): void {
    this.states.delete(userId);
  }
}

export const commandSpamGuard = new CommandSpamGuard();
