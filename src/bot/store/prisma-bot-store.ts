import type { Prisma, PrismaClient } from '@prisma/client';
import {
  DEFAULT_BUFF_CONFIG,
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_FISHING_SETUP,
} from '@/domain/data/pokemeow-data';
import type {
  BallId,
  BuffConfig,
  CatchLogEntry,
  EconomyConfig,
  EncounterSource,
  FishingSetup,
  HallOfFameEntry,
  QuestEntry,
  RarityId,
} from '@/domain/types';
import { getPrismaClient } from '@/lib/prisma';
import {
  DEFAULT_CHANNEL_SETTINGS,
  isLegacyCorruptedLog,
  type ChannelHelperSettings,
  type GoldenHourSchedule,
  type UserBotProfile,
} from './bot-store';
import type { IBotStateStore } from './store-interface';

const GOLDEN_HOUR_KEY = 'golden_hour';

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function defaultProfile(): UserBotProfile {
  return {
    displayName: '',
    avatarUrl: '',
    buffs: DEFAULT_BUFF_CONFIG,
    fishingSetup: DEFAULT_FISHING_SETUP,
    economy: DEFAULT_ECONOMY_CONFIG,
    remindersEnabled: true,
    catchbotReturnAtMs: null,
    catchbotChannelId: null,
    quests: [],
    logs: [],
  };
}

function mapDbLogToDomain(row: {
  readonly id: string;
  readonly timestamp: bigint;
  readonly source: string;
  readonly rarityId: string;
  readonly ballId: string;
  readonly caught: boolean;
  readonly pokemonName: string;
  readonly ballCost: number;
  readonly coinsEarned: number;
  readonly netProfit: number;
}): CatchLogEntry {
  return {
    id: row.id,
    timestamp: Number(row.timestamp),
    source: row.source === 'fishing' ? 'fishing' : 'wild',
    rarityId: row.rarityId as RarityId,
    ballId: row.ballId as BallId,
    caught: row.caught,
    pokemonName: row.pokemonName,
    ballCost: row.ballCost,
    coinsEarned: row.coinsEarned,
    netProfit: row.netProfit,
  };
}

function mapDbUserToProfile(row: {
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly buffsJson: Prisma.JsonValue;
  readonly fishingSetupJson: Prisma.JsonValue;
  readonly economyJson: Prisma.JsonValue;
  readonly remindersEnabled: boolean;
  readonly catchbotReturnAtMs: bigint | null;
  readonly catchbotChannelId: string | null;
  readonly questsJson: Prisma.JsonValue;
  readonly logs: readonly {
    readonly id: string;
    readonly timestamp: bigint;
    readonly source: string;
    readonly rarityId: string;
    readonly ballId: string;
    readonly caught: boolean;
    readonly pokemonName: string;
    readonly ballCost: number;
    readonly coinsEarned: number;
    readonly netProfit: number;
  }[];
}): UserBotProfile {
  const buffs = {
    ...DEFAULT_BUFF_CONFIG,
    ...(typeof row.buffsJson === 'object' && row.buffsJson !== null
      ? (row.buffsJson as Partial<BuffConfig>)
      : {}),
  };
  const fishingSetup = {
    ...DEFAULT_FISHING_SETUP,
    ...(typeof row.fishingSetupJson === 'object' && row.fishingSetupJson !== null
      ? (row.fishingSetupJson as Partial<FishingSetup>)
      : {}),
  };
  const economy = {
    ...DEFAULT_ECONOMY_CONFIG,
    ...(typeof row.economyJson === 'object' && row.economyJson !== null
      ? (row.economyJson as Partial<EconomyConfig>)
      : {}),
  };
  const quests = Array.isArray(row.questsJson) ? (row.questsJson as unknown as QuestEntry[]) : [];

  return {
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    buffs,
    fishingSetup,
    economy,
    remindersEnabled: row.remindersEnabled,
    catchbotReturnAtMs: row.catchbotReturnAtMs !== null ? Number(row.catchbotReturnAtMs) : null,
    catchbotChannelId: row.catchbotChannelId,
    quests,
    logs: row.logs.map(mapDbLogToDomain),
  };
}

/**
 * PostgreSQL-backed store powered by Prisma for Vercel + Neon/Supabase deployment.
 * Uses $transaction for multi-table ACID consistency.
 */
export class PrismaBotStore implements IBotStateStore {
  private readonly prisma: PrismaClient;

  public constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? getPrismaClient();
  }

  private async ensureUserExists(userId: string): Promise<void> {
    await this.prisma.userProfile.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        buffsJson: toJsonValue(DEFAULT_BUFF_CONFIG),
        fishingSetupJson: toJsonValue(DEFAULT_FISHING_SETUP),
        economyJson: toJsonValue(DEFAULT_ECONOMY_CONFIG),
        questsJson: toJsonValue([]),
      },
    });
  }

  public async getAllUsersSnapshot(): Promise<Readonly<Record<string, UserBotProfile>>> {
    const rows = await this.prisma.userProfile.findMany({
      include: {
        logs: {
          orderBy: { timestamp: 'desc' },
          take: 500,
        },
      },
    });

    const result: Record<string, UserBotProfile> = {};
    for (const row of rows) {
      result[row.userId] = mapDbUserToProfile(row);
    }
    return result;
  }

  public async getAllChannelsSnapshot(): Promise<Readonly<Record<string, ChannelHelperSettings>>> {
    const rows = await this.prisma.channelSetting.findMany();
    const result: Record<string, ChannelHelperSettings> = {};
    for (const row of rows) {
      result[row.channelId] = {
        enabled: row.enabled,
        autoCleanSec: row.autoCleanSec,
        onlyRarePlus: row.onlyRarePlus,
      };
    }
    return result;
  }

  public async getGoldenHourSchedule(): Promise<GoldenHourSchedule> {
    const row = await this.prisma.globalSchedule.findUnique({
      where: { key: GOLDEN_HOUR_KEY },
    });
    if (!row) {
      return { startAtMs: null, channelId: null, warned5m: false };
    }
    return {
      startAtMs: row.startAtMs !== null ? Number(row.startAtMs) : null,
      channelId: row.channelId,
      warned5m: row.warned5m,
    };
  }

  public async setGoldenHourSchedule(
    patch: Partial<GoldenHourSchedule>,
  ): Promise<GoldenHourSchedule> {
    const current = await this.getGoldenHourSchedule();
    const next: GoldenHourSchedule = {
      startAtMs: patch.startAtMs !== undefined ? patch.startAtMs : current.startAtMs,
      channelId: patch.channelId !== undefined ? patch.channelId : current.channelId,
      warned5m: patch.warned5m !== undefined ? patch.warned5m : current.warned5m,
    };

    await this.prisma.globalSchedule.upsert({
      where: { key: GOLDEN_HOUR_KEY },
      update: {
        startAtMs: next.startAtMs !== null ? BigInt(Math.round(next.startAtMs)) : null,
        channelId: next.channelId,
        warned5m: next.warned5m,
      },
      create: {
        key: GOLDEN_HOUR_KEY,
        startAtMs: next.startAtMs !== null ? BigInt(Math.round(next.startAtMs)) : null,
        channelId: next.channelId,
        warned5m: next.warned5m,
      },
    });

    return next;
  }

  public async getHallOfFame(): Promise<readonly HallOfFameEntry[]> {
    const rows = await this.prisma.hallOfFame.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      displayName: row.displayName,
      pokemonName: row.pokemonName,
      rarityId: row.rarityId as RarityId,
      ballId: row.ballId as BallId,
      timestamp: Number(row.timestamp),
    }));
  }

  public async addHallOfFameEntry(entry: HallOfFameEntry): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userProfile.upsert({
        where: { userId: entry.userId },
        update: {},
        create: {
          userId: entry.userId,
          displayName: entry.displayName,
          buffsJson: toJsonValue(DEFAULT_BUFF_CONFIG),
          fishingSetupJson: toJsonValue(DEFAULT_FISHING_SETUP),
          economyJson: toJsonValue(DEFAULT_ECONOMY_CONFIG),
          questsJson: toJsonValue([]),
        },
      });

      await tx.hallOfFame.upsert({
        where: { id: entry.id },
        update: {},
        create: {
          id: entry.id,
          userId: entry.userId,
          displayName: entry.displayName,
          pokemonName: entry.pokemonName,
          rarityId: entry.rarityId,
          ballId: entry.ballId,
          timestamp: BigInt(Math.round(entry.timestamp)),
        },
      });
    });
  }

  public async getUserProfile(userId: string): Promise<UserBotProfile> {
    const row = await this.prisma.userProfile.findUnique({
      where: { userId },
      include: {
        logs: {
          orderBy: { timestamp: 'desc' },
          take: 500,
        },
      },
    });
    if (!row) return defaultProfile();
    return mapDbUserToProfile(row);
  }

  public async updateUserIdentity(
    userId: string,
    displayName: string,
    avatarUrl: string,
  ): Promise<void> {
    await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        ...(displayName ? { displayName } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      create: {
        userId,
        displayName,
        avatarUrl,
        buffsJson: toJsonValue(DEFAULT_BUFF_CONFIG),
        fishingSetupJson: toJsonValue(DEFAULT_FISHING_SETUP),
        economyJson: toJsonValue(DEFAULT_ECONOMY_CONFIG),
        questsJson: toJsonValue([]),
      },
    });
  }

  public async updateUserBuffs(
    userId: string,
    patch: Partial<BuffConfig>,
  ): Promise<UserBotProfile> {
    const current = await this.getUserProfile(userId);
    const nextBuffs: BuffConfig = {
      ...current.buffs,
      ...patch,
      amuletCoins: Math.min(10, Math.max(0, patch.amuletCoins ?? current.buffs.amuletCoins)),
      clanCatchRatePct: Math.min(
        25,
        Math.max(0, patch.clanCatchRatePct ?? current.buffs.clanCatchRatePct),
      ),
      quickHandsSavePct: Math.min(
        20,
        Math.max(0, patch.quickHandsSavePct ?? current.buffs.quickHandsSavePct),
      ),
      wildCooldownSec: Math.min(
        30,
        Math.max(4, patch.wildCooldownSec ?? current.buffs.wildCooldownSec),
      ),
      fishCooldownSec: Math.min(
        30,
        Math.max(4, patch.fishCooldownSec ?? current.buffs.fishCooldownSec),
      ),
    };

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { buffsJson: toJsonValue(nextBuffs) },
      create: {
        userId,
        buffsJson: toJsonValue(nextBuffs),
        fishingSetupJson: toJsonValue(DEFAULT_FISHING_SETUP),
        economyJson: toJsonValue(DEFAULT_ECONOMY_CONFIG),
        questsJson: toJsonValue([]),
      },
    });

    return { ...current, buffs: nextBuffs };
  }

  public async updateUserFishingSetup(
    userId: string,
    patch: Partial<FishingSetup>,
  ): Promise<UserBotProfile> {
    const current = await this.getUserProfile(userId);
    const nextSetup: FishingSetup = { ...current.fishingSetup, ...patch };

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { fishingSetupJson: toJsonValue(nextSetup) },
      create: {
        userId,
        buffsJson: toJsonValue(DEFAULT_BUFF_CONFIG),
        fishingSetupJson: toJsonValue(nextSetup),
        economyJson: toJsonValue(DEFAULT_ECONOMY_CONFIG),
        questsJson: toJsonValue([]),
      },
    });

    return { ...current, fishingSetup: nextSetup };
  }

  public async resetUserBuffs(userId: string): Promise<UserBotProfile> {
    return this.updateUserBuffs(userId, DEFAULT_BUFF_CONFIG);
  }

  public async setUserReminders(userId: string, enabled: boolean): Promise<UserBotProfile> {
    await this.ensureUserExists(userId);
    await this.prisma.userProfile.update({
      where: { userId },
      data: { remindersEnabled: enabled },
    });
    return this.getUserProfile(userId);
  }

  public async setUserCatchbotSchedule(
    userId: string,
    returnAtMs: number | null,
    channelId: string | null,
  ): Promise<UserBotProfile> {
    await this.ensureUserExists(userId);
    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        catchbotReturnAtMs: returnAtMs !== null ? BigInt(Math.round(returnAtMs)) : null,
        catchbotChannelId: channelId,
      },
    });
    return this.getUserProfile(userId);
  }

  public async setUserQuests(
    userId: string,
    quests: readonly QuestEntry[],
  ): Promise<UserBotProfile> {
    await this.ensureUserExists(userId);
    await this.prisma.userProfile.update({
      where: { userId },
      data: { questsJson: toJsonValue(quests) },
    });
    return this.getUserProfile(userId);
  }

  public async advanceUserQuestsOnCatch(
    userId: string,
    source: EncounterSource,
    rarityId: RarityId,
  ): Promise<readonly QuestEntry[]> {
    const current = await this.getUserProfile(userId);
    if (current.quests.length === 0) return [];

    const newlyCompleted: QuestEntry[] = [];
    let changed = false;

    const nextQuests = current.quests.map((q) => {
      if (q.current >= q.goal) return q;
      let matches = false;
      if (q.kind === 'any_catch') matches = true;
      else if (q.kind === 'fishing' && source === 'fishing') matches = true;
      else if (q.kind === 'rarity' && q.rarityFilter === rarityId) matches = true;

      if (!matches) return q;
      changed = true;
      const updatedQuest: QuestEntry = { ...q, current: Math.min(q.goal, q.current + 1) };
      if (updatedQuest.current >= updatedQuest.goal) {
        newlyCompleted.push(updatedQuest);
      }
      return updatedQuest;
    });

    if (changed) {
      await this.setUserQuests(userId, nextQuests);
    }
    return newlyCompleted;
  }

  public async addUserLog(userId: string, entry: CatchLogEntry): Promise<UserBotProfile> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userProfile.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          buffsJson: toJsonValue(DEFAULT_BUFF_CONFIG),
          fishingSetupJson: toJsonValue(DEFAULT_FISHING_SETUP),
          economyJson: toJsonValue(DEFAULT_ECONOMY_CONFIG),
          questsJson: toJsonValue([]),
        },
      });

      await tx.catchLog.upsert({
        where: { id: entry.id },
        update: {},
        create: {
          id: entry.id,
          userId,
          timestamp: BigInt(Math.round(entry.timestamp)),
          source: entry.source,
          rarityId: entry.rarityId,
          ballId: entry.ballId,
          caught: entry.caught,
          pokemonName: entry.pokemonName,
          ballCost: entry.ballCost,
          coinsEarned: entry.coinsEarned,
          netProfit: entry.netProfit,
        },
      });
    });

    return this.getUserProfile(userId);
  }

  public async deleteUserLog(userId: string, logId: string): Promise<boolean> {
    const deleted = await this.prisma.catchLog.deleteMany({
      where: { id: logId, userId },
    });
    return deleted.count > 0;
  }

  public async cleanCorruptedLogs(userId: string): Promise<number> {
    const profile = await this.getUserProfile(userId);
    const corruptedIds = profile.logs.filter(isLegacyCorruptedLog).map((l) => l.id);
    if (corruptedIds.length === 0) return 0;

    const deleted = await this.prisma.catchLog.deleteMany({
      where: {
        userId,
        id: { in: corruptedIds },
      },
    });
    return deleted.count;
  }

  public async clearUserLogs(userId: string): Promise<UserBotProfile> {
    await this.prisma.catchLog.deleteMany({ where: { userId } });
    return this.getUserProfile(userId);
  }

  public async getChannelSettings(channelId: string): Promise<ChannelHelperSettings> {
    const row = await this.prisma.channelSetting.findUnique({ where: { channelId } });
    if (!row) return DEFAULT_CHANNEL_SETTINGS;
    return {
      enabled: row.enabled,
      autoCleanSec: row.autoCleanSec,
      onlyRarePlus: row.onlyRarePlus,
    };
  }

  public async isChannelEnabled(channelId: string): Promise<boolean> {
    const settings = await this.getChannelSettings(channelId);
    return settings.enabled;
  }

  public async setChannelSettings(
    channelId: string,
    patch: Partial<ChannelHelperSettings>,
  ): Promise<ChannelHelperSettings> {
    const current = await this.getChannelSettings(channelId);
    const next: ChannelHelperSettings = {
      enabled: patch.enabled ?? current.enabled,
      autoCleanSec: Math.min(60, Math.max(0, patch.autoCleanSec ?? current.autoCleanSec)),
      onlyRarePlus: patch.onlyRarePlus ?? current.onlyRarePlus,
    };

    await this.prisma.channelSetting.upsert({
      where: { channelId },
      update: next,
      create: {
        channelId,
        ...next,
      },
    });

    return next;
  }

  public async setChannelEnabled(channelId: string, enabled: boolean): Promise<void> {
    await this.setChannelSettings(channelId, { enabled });
  }
}
