import { NextResponse, type NextRequest } from 'next/server';
import {
  isLegacyCorruptedLog,
  type ChannelHelperSettings,
  type GoldenHourSchedule,
} from '@/bot/store/bot-store';
import { createBotStore, isDatabaseConfigured } from '@/bot/store/store-factory';
import type { IBotStateStore } from '@/bot/store/store-interface';
import { optimizerService } from '@/domain/services/optimizer-service';
import type {
  BuffConfig,
  CatchLogEntry,
  FishingSetup,
  HallOfFameEntry,
  PityStats,
  QuestEntry,
  QuickProfitReport,
  SessionStats,
  ValuationMode,
} from '@/domain/types';

export const dynamic = 'force-dynamic';

export interface DiscordSyncedUser {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly buffs: BuffConfig;
  readonly fishingSetup: FishingSetup;
  readonly remindersEnabled: boolean;
  readonly catchbotReturnAtMs: number | null;
  readonly quests: readonly QuestEntry[];
  readonly pity: PityStats;
  readonly stats: SessionStats;
  readonly profitReport: QuickProfitReport;
  readonly corruptedLogsCount: number;
  readonly recentLogs: readonly CatchLogEntry[];
}

export interface DiscordSyncPayload {
  readonly syncedAt: number;
  readonly storageBackend: 'postgresql' | 'json';
  readonly channels: Readonly<Record<string, ChannelHelperSettings>>;
  readonly goldenHour: GoldenHourSchedule;
  readonly hallOfFame: readonly HallOfFameEntry[];
  readonly users: readonly DiscordSyncedUser[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function buildSyncPayload(store: IBotStateStore): Promise<DiscordSyncPayload> {
  const [usersMap, channels, goldenHour, hallOfFame] = await Promise.all([
    store.getAllUsersSnapshot(),
    store.getAllChannelsSnapshot(),
    store.getGoldenHourSchedule(),
    store.getHallOfFame(),
  ]);

  const users: DiscordSyncedUser[] = Object.entries(usersMap)
    .map(([userId, profile]) => {
      const orderedLogs = [...profile.logs].sort((a, b) => b.timestamp - a.timestamp);
      const stats = optimizerService.calculateSessionStats(orderedLogs);
      const profitReport = optimizerService.calculateQuickProfitReport(
        orderedLogs,
        profile.buffs,
        profile.economy,
      );
      const pity = optimizerService.calculatePityStats(orderedLogs);
      const corruptedLogsCount = orderedLogs.filter(isLegacyCorruptedLog).length;

      return {
        userId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        buffs: profile.buffs,
        fishingSetup: profile.fishingSetup,
        remindersEnabled: profile.remindersEnabled,
        catchbotReturnAtMs: profile.catchbotReturnAtMs,
        quests: profile.quests,
        pity,
        stats,
        profitReport,
        corruptedLogsCount,
        recentLogs: orderedLogs.slice(0, 150),
      };
    })
    .sort((a, b) => b.stats.totalEncounters - a.stats.totalEncounters);

  return {
    syncedAt: Date.now(),
    storageBackend: isDatabaseConfigured() ? 'postgresql' : 'json',
    channels,
    goldenHour,
    hallOfFame,
    users,
  };
}

export async function GET(): Promise<NextResponse<DiscordSyncPayload>> {
  const store = createBotStore();
  return NextResponse.json(await buildSyncPayload(store));
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<DiscordSyncPayload | { readonly error: string }>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isRecord(body) || typeof body['action'] !== 'string') {
    return NextResponse.json({ error: 'Missing action field' }, { status: 400 });
  }

  const store = createBotStore();
  const action = body['action'];

  if (action === 'clean_corrupted_logs') {
    const userId = body['userId'];
    if (typeof userId !== 'string' || userId.length === 0) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }
    await store.cleanCorruptedLogs(userId);
    return NextResponse.json(await buildSyncPayload(store));
  }

  if (action === 'delete_log') {
    const userId = body['userId'];
    const logId = body['logId'];
    if (typeof userId !== 'string' || typeof logId !== 'string') {
      return NextResponse.json({ error: 'Missing userId or logId' }, { status: 400 });
    }
    await store.deleteUserLog(userId, logId);
    return NextResponse.json(await buildSyncPayload(store));
  }

  if (action === 'update_user_buffs') {
    const userId = body['userId'];
    const patch = body['patch'];
    if (typeof userId !== 'string' || !isRecord(patch)) {
      return NextResponse.json({ error: 'Invalid userId or patch' }, { status: 400 });
    }

    const safePatch: Partial<BuffConfig> = {
      ...(typeof patch['amuletCoins'] === 'number' ? { amuletCoins: patch['amuletCoins'] } : {}),
      ...(typeof patch['clanCatchRatePct'] === 'number'
        ? { clanCatchRatePct: patch['clanCatchRatePct'] }
        : {}),
      ...(typeof patch['patreonNinja'] === 'boolean' ? { patreonNinja: patch['patreonNinja'] } : {}),
      ...(typeof patch['quickHandsSavePct'] === 'number'
        ? { quickHandsSavePct: patch['quickHandsSavePct'] }
        : {}),
      ...(typeof patch['shinyCharmOwned'] === 'boolean'
        ? { shinyCharmOwned: patch['shinyCharmOwned'] }
        : {}),
      ...(typeof patch['includePremierBall'] === 'boolean'
        ? { includePremierBall: patch['includePremierBall'] }
        : {}),
      ...(patch['valuationMode'] === 'release' || patch['valuationMode'] === 'market'
        ? { valuationMode: patch['valuationMode'] as ValuationMode }
        : {}),
      ...(typeof patch['wildCooldownSec'] === 'number'
        ? { wildCooldownSec: patch['wildCooldownSec'] }
        : {}),
      ...(typeof patch['fishCooldownSec'] === 'number'
        ? { fishCooldownSec: patch['fishCooldownSec'] }
        : {}),
    };

    await store.updateUserBuffs(userId, safePatch);

    if (typeof body['remindersEnabled'] === 'boolean') {
      await store.setUserReminders(userId, body['remindersEnabled']);
    }

    return NextResponse.json(await buildSyncPayload(store));
  }

  if (action === 'update_channel_settings') {
    const channelId = body['channelId'];
    const patch = body['patch'];
    if (typeof channelId !== 'string' || !isRecord(patch)) {
      return NextResponse.json({ error: 'Invalid channelId or patch' }, { status: 400 });
    }

    await store.setChannelSettings(channelId, {
      ...(typeof patch['enabled'] === 'boolean' ? { enabled: patch['enabled'] } : {}),
      ...(typeof patch['autoCleanSec'] === 'number'
        ? { autoCleanSec: patch['autoCleanSec'] }
        : {}),
      ...(typeof patch['onlyRarePlus'] === 'boolean'
        ? { onlyRarePlus: patch['onlyRarePlus'] }
        : {}),
    });

    return NextResponse.json(await buildSyncPayload(store));
  }

  return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
}
