import type {
  BuffConfig,
  CatchLogEntry,
  EncounterSource,
  FishingSetup,
  HallOfFameEntry,
  QuestEntry,
  RarityId,
} from '@/domain/types';
import type {
  ChannelHelperSettings,
  GoldenHourSchedule,
  UserBotProfile,
} from './bot-store';

/**
 * Persistence abstraction (Repository Pattern / Dependency Inversion).
 * Allows swapping local JSON storage and PostgreSQL (Prisma) transparently
 * across both the Discord Bot and Next.js Vercel API routes.
 */
export interface IBotStateStore {
  getAllUsersSnapshot(): Promise<Readonly<Record<string, UserBotProfile>>>;
  getAllChannelsSnapshot(): Promise<Readonly<Record<string, ChannelHelperSettings>>>;
  getGoldenHourSchedule(): Promise<GoldenHourSchedule>;
  setGoldenHourSchedule(patch: Partial<GoldenHourSchedule>): Promise<GoldenHourSchedule>;
  getHallOfFame(): Promise<readonly HallOfFameEntry[]>;
  addHallOfFameEntry(entry: HallOfFameEntry): Promise<void>;
  getUserProfile(userId: string): Promise<UserBotProfile>;
  updateUserIdentity(userId: string, displayName: string, avatarUrl: string): Promise<void>;
  updateUserBuffs(userId: string, patch: Partial<BuffConfig>): Promise<UserBotProfile>;
  updateUserFishingSetup(userId: string, patch: Partial<FishingSetup>): Promise<UserBotProfile>;
  resetUserBuffs(userId: string): Promise<UserBotProfile>;
  setUserReminders(userId: string, enabled: boolean): Promise<UserBotProfile>;
  setUserCatchbotSchedule(
    userId: string,
    returnAtMs: number | null,
    channelId: string | null,
  ): Promise<UserBotProfile>;
  setUserQuests(userId: string, quests: readonly QuestEntry[]): Promise<UserBotProfile>;
  advanceUserQuestsOnCatch(
    userId: string,
    source: EncounterSource,
    rarityId: RarityId,
  ): Promise<readonly QuestEntry[]>;
  addUserLog(userId: string, entry: CatchLogEntry): Promise<UserBotProfile>;
  deleteUserLog(userId: string, logId: string): Promise<boolean>;
  cleanCorruptedLogs(userId: string): Promise<number>;
  clearUserLogs(userId: string): Promise<UserBotProfile>;
  getChannelSettings(channelId: string): Promise<ChannelHelperSettings>;
  isChannelEnabled(channelId: string): Promise<boolean>;
  setChannelSettings(
    channelId: string,
    patch: Partial<ChannelHelperSettings>,
  ): Promise<ChannelHelperSettings>;
  setChannelEnabled(channelId: string, enabled: boolean): Promise<void>;
}
