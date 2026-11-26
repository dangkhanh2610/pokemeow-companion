import type {
  BuffConfig,
  CatchLogEntry,
  EncounterSource,
  FishingSetup,
  HallOfFameEntry,
  QuestEntry,
  RarityId,
} from '@/domain/types';
import {
  BotStore,
  type ChannelHelperSettings,
  type GoldenHourSchedule,
  type UserBotProfile,
} from './bot-store';
import type { IBotStateStore } from './store-interface';

/**
 * Async adapter around the file-backed JSON BotStore for zero-config local usage
 * when DATABASE_URL is not configured.
 */
export class JsonBotStore implements IBotStateStore {
  private readonly inner: BotStore;

  public constructor(filePath?: string) {
    this.inner = new BotStore(filePath);
  }

  public async getAllUsersSnapshot(): Promise<Readonly<Record<string, UserBotProfile>>> {
    return this.inner.getAllUsersSnapshot();
  }

  public async getAllChannelsSnapshot(): Promise<Readonly<Record<string, ChannelHelperSettings>>> {
    return this.inner.getAllChannelsSnapshot();
  }

  public async getGoldenHourSchedule(): Promise<GoldenHourSchedule> {
    return this.inner.getGoldenHourSchedule();
  }

  public async setGoldenHourSchedule(
    patch: Partial<GoldenHourSchedule>,
  ): Promise<GoldenHourSchedule> {
    return this.inner.setGoldenHourSchedule(patch);
  }

  public async getHallOfFame(): Promise<readonly HallOfFameEntry[]> {
    return this.inner.getHallOfFame();
  }

  public async addHallOfFameEntry(entry: HallOfFameEntry): Promise<void> {
    this.inner.addHallOfFameEntry(entry);
  }

  public async getUserProfile(userId: string): Promise<UserBotProfile> {
    return this.inner.getUserProfile(userId);
  }

  public async updateUserIdentity(
    userId: string,
    displayName: string,
    avatarUrl: string,
  ): Promise<void> {
    this.inner.updateUserIdentity(userId, displayName, avatarUrl);
  }

  public async updateUserBuffs(
    userId: string,
    patch: Partial<BuffConfig>,
  ): Promise<UserBotProfile> {
    return this.inner.updateUserBuffs(userId, patch);
  }

  public async updateUserFishingSetup(
    userId: string,
    patch: Partial<FishingSetup>,
  ): Promise<UserBotProfile> {
    return this.inner.updateUserFishingSetup(userId, patch);
  }

  public async resetUserBuffs(userId: string): Promise<UserBotProfile> {
    return this.inner.resetUserBuffs(userId);
  }

  public async setUserReminders(userId: string, enabled: boolean): Promise<UserBotProfile> {
    return this.inner.setUserReminders(userId, enabled);
  }

  public async setUserCatchbotSchedule(
    userId: string,
    returnAtMs: number | null,
    channelId: string | null,
  ): Promise<UserBotProfile> {
    return this.inner.setUserCatchbotSchedule(userId, returnAtMs, channelId);
  }

  public async setUserQuests(
    userId: string,
    quests: readonly QuestEntry[],
  ): Promise<UserBotProfile> {
    return this.inner.setUserQuests(userId, quests);
  }

  public async advanceUserQuestsOnCatch(
    userId: string,
    source: EncounterSource,
    rarityId: RarityId,
  ): Promise<readonly QuestEntry[]> {
    return this.inner.advanceUserQuestsOnCatch(userId, source, rarityId);
  }

  public async addUserLog(userId: string, entry: CatchLogEntry): Promise<UserBotProfile> {
    return this.inner.addUserLog(userId, entry);
  }

  public async deleteUserLog(userId: string, logId: string): Promise<boolean> {
    return this.inner.deleteUserLog(userId, logId);
  }

  public async cleanCorruptedLogs(userId: string): Promise<number> {
    return this.inner.cleanCorruptedLogs(userId);
  }

  public async clearUserLogs(userId: string): Promise<UserBotProfile> {
    return this.inner.clearUserLogs(userId);
  }

  public async getChannelSettings(channelId: string): Promise<ChannelHelperSettings> {
    return this.inner.getChannelSettings(channelId);
  }

  public async isChannelEnabled(channelId: string): Promise<boolean> {
    return this.inner.isChannelEnabled(channelId);
  }

  public async setChannelSettings(
    channelId: string,
    patch: Partial<ChannelHelperSettings>,
  ): Promise<ChannelHelperSettings> {
    return this.inner.setChannelSettings(channelId, patch);
  }

  public async setChannelEnabled(channelId: string, enabled: boolean): Promise<void> {
    this.inner.setChannelEnabled(channelId, enabled);
  }
}
