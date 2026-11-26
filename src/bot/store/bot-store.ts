import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BALL_ORDER,
  DEFAULT_BUFF_CONFIG,
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_FISHING_SETUP,
  RARITY_ORDER,
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
  QuestTargetKind,
  RarityEconomyValue,
  RarityId,
  ValuationMode,
} from '@/domain/types';

export interface ChannelHelperSettings {
  readonly enabled: boolean;
  readonly autoCleanSec: number;
  readonly onlyRarePlus: boolean;
}

export interface GoldenHourSchedule {
  readonly startAtMs: number | null;
  readonly channelId: string | null;
  readonly warned5m: boolean;
}

export interface UserBotProfile {
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly buffs: BuffConfig;
  readonly fishingSetup: FishingSetup;
  readonly economy: EconomyConfig;
  readonly remindersEnabled: boolean;
  readonly catchbotReturnAtMs: number | null;
  readonly catchbotChannelId: string | null;
  readonly quests: readonly QuestEntry[];
  readonly logs: readonly CatchLogEntry[];
}

interface PersistedBotState {
  readonly schemaVersion: number;
  readonly users: Record<string, UserBotProfile>;
  readonly enabledChannels: Record<string, ChannelHelperSettings>;
  readonly goldenHour: GoldenHourSchedule;
  readonly hallOfFame: readonly HallOfFameEntry[];
}

const CURRENT_SCHEMA_VERSION = 4;

export const DEFAULT_CHANNEL_SETTINGS: ChannelHelperSettings = {
  enabled: false,
  autoCleanSec: 12,
  onlyRarePlus: false,
};

const DEFAULT_GOLDEN_HOUR: GoldenHourSchedule = {
  startAtMs: null,
  channelId: null,
  warned5m: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number): number {
  const val = record[key];
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const val = record[key];
  return typeof val === 'boolean' ? val : fallback;
}

function readString(record: Record<string, unknown>, key: string, fallback: string): string {
  const val = record[key];
  return typeof val === 'string' ? val : fallback;
}

function isBallId(value: unknown): value is BallId {
  return typeof value === 'string' && (BALL_ORDER as readonly string[]).includes(value);
}

function isRarityId(value: unknown): value is RarityId {
  return typeof value === 'string' && (RARITY_ORDER as readonly string[]).includes(value);
}

function isQuestKind(value: unknown): value is QuestTargetKind {
  return (
    value === 'any_catch' || value === 'fishing' || value === 'rarity' || value === 'other'
  );
}

function sanitizeBuffs(raw: unknown, migrateV1Cooldowns = false): BuffConfig {
  if (!isRecord(raw)) return DEFAULT_BUFF_CONFIG;

  const rawWildCd = readNumber(raw, 'wildCooldownSec', DEFAULT_BUFF_CONFIG.wildCooldownSec);
  const rawFishCd = readNumber(raw, 'fishCooldownSec', DEFAULT_BUFF_CONFIG.fishCooldownSec);

  const migratedWildCd =
    migrateV1Cooldowns && rawWildCd === 7 ? DEFAULT_BUFF_CONFIG.wildCooldownSec : rawWildCd;
  const migratedFishCd =
    migrateV1Cooldowns && rawFishCd === 7 ? DEFAULT_BUFF_CONFIG.fishCooldownSec : rawFishCd;

  const rawValuation = raw['valuationMode'];
  const valuationMode: ValuationMode =
    rawValuation === 'release' || rawValuation === 'market'
      ? rawValuation
      : DEFAULT_BUFF_CONFIG.valuationMode;

  return {
    amuletCoins: Math.min(
      10,
      Math.max(0, readNumber(raw, 'amuletCoins', DEFAULT_BUFF_CONFIG.amuletCoins)),
    ),
    clanCatchRatePct: Math.min(
      25,
      Math.max(0, readNumber(raw, 'clanCatchRatePct', DEFAULT_BUFF_CONFIG.clanCatchRatePct)),
    ),
    patreonNinja: readBoolean(raw, 'patreonNinja', DEFAULT_BUFF_CONFIG.patreonNinja),
    quickHandsSavePct: Math.min(
      20,
      Math.max(0, readNumber(raw, 'quickHandsSavePct', DEFAULT_BUFF_CONFIG.quickHandsSavePct)),
    ),
    eventCatchBoostPct: Math.min(
      30,
      Math.max(0, readNumber(raw, 'eventCatchBoostPct', DEFAULT_BUFF_CONFIG.eventCatchBoostPct)),
    ),
    charmCatchBoostPct: Math.min(
      20,
      Math.max(0, readNumber(raw, 'charmCatchBoostPct', DEFAULT_BUFF_CONFIG.charmCatchBoostPct)),
    ),
    shinyCharmOwned: readBoolean(raw, 'shinyCharmOwned', DEFAULT_BUFF_CONFIG.shinyCharmOwned),
    includePremierBall: readBoolean(
      raw,
      'includePremierBall',
      DEFAULT_BUFF_CONFIG.includePremierBall,
    ),
    valuationMode,
    wildCooldownSec: Math.min(30, Math.max(4, migratedWildCd)),
    fishCooldownSec: Math.min(30, Math.max(4, migratedFishCd)),
    soundEnabled: readBoolean(raw, 'soundEnabled', DEFAULT_BUFF_CONFIG.soundEnabled),
  };
}

function sanitizeFishingSetup(raw: unknown): FishingSetup {
  if (!isRecord(raw)) return DEFAULT_FISHING_SETUP;
  const rodRaw = raw['rod'];
  const lureRaw = raw['lure'];
  return {
    rod:
      rodRaw === 'old' || rodRaw === 'good' || rodRaw === 'super'
        ? rodRaw
        : DEFAULT_FISHING_SETUP.rod,
    lure:
      lureRaw === 'none' || lureRaw === 'pokelure' || lureRaw === 'misty'
        ? lureRaw
        : DEFAULT_FISHING_SETUP.lure,
    goldenHour: readBoolean(raw, 'goldenHour', DEFAULT_FISHING_SETUP.goldenHour),
    tokenToCoinRate: Math.max(
      0,
      readNumber(raw, 'tokenToCoinRate', DEFAULT_FISHING_SETUP.tokenToCoinRate),
    ),
  };
}

function sanitizeEconomy(raw: unknown): EconomyConfig {
  if (!isRecord(raw)) return DEFAULT_ECONOMY_CONFIG;
  const ballPrices = { ...DEFAULT_ECONOMY_CONFIG.ballPrices };
  const rawPrices = raw['ballPrices'];
  if (isRecord(rawPrices)) {
    for (const ballId of BALL_ORDER) {
      ballPrices[ballId] = Math.max(
        0,
        readNumber(rawPrices, ballId, DEFAULT_ECONOMY_CONFIG.ballPrices[ballId]),
      );
    }
  }

  const rarityValues = { ...DEFAULT_ECONOMY_CONFIG.rarityValues };
  const rawValues = raw['rarityValues'];
  if (isRecord(rawValues)) {
    for (const rarityId of RARITY_ORDER) {
      const entry = rawValues[rarityId];
      const defaults = DEFAULT_ECONOMY_CONFIG.rarityValues[rarityId];
      if (isRecord(entry)) {
        const sanitized: RarityEconomyValue = {
          catchCoins: Math.max(0, readNumber(entry, 'catchCoins', defaults.catchCoins)),
          releaseValue: Math.max(0, readNumber(entry, 'releaseValue', defaults.releaseValue)),
          marketValue: Math.max(0, readNumber(entry, 'marketValue', defaults.marketValue)),
        };
        rarityValues[rarityId] = sanitized;
      }
    }
  }

  return { ballPrices, rarityValues };
}

function isValidCatchLog(item: unknown): item is CatchLogEntry {
  if (!isRecord(item)) return false;
  return (
    typeof item['id'] === 'string' &&
    typeof item['timestamp'] === 'number' &&
    (item['source'] === 'wild' || item['source'] === 'fishing') &&
    isRarityId(item['rarityId']) &&
    isBallId(item['ballId']) &&
    typeof item['caught'] === 'boolean' &&
    typeof item['pokemonName'] === 'string' &&
    typeof item['ballCost'] === 'number' &&
    typeof item['coinsEarned'] === 'number' &&
    typeof item['netProfit'] === 'number'
  );
}

function isValidQuestEntry(item: unknown): item is QuestEntry {
  if (!isRecord(item)) return false;
  return (
    typeof item['index'] === 'number' &&
    typeof item['description'] === 'string' &&
    isQuestKind(item['kind']) &&
    (item['rarityFilter'] === null || isRarityId(item['rarityFilter'])) &&
    typeof item['current'] === 'number' &&
    typeof item['goal'] === 'number'
  );
}

function isValidHofEntry(item: unknown): item is HallOfFameEntry {
  if (!isRecord(item)) return false;
  return (
    typeof item['id'] === 'string' &&
    typeof item['userId'] === 'string' &&
    typeof item['displayName'] === 'string' &&
    typeof item['pokemonName'] === 'string' &&
    isRarityId(item['rarityId']) &&
    isBallId(item['ballId']) &&
    typeof item['timestamp'] === 'number'
  );
}

function sanitizeChannelSettings(raw: unknown): ChannelHelperSettings {
  if (typeof raw === 'boolean') {
    return {
      enabled: raw,
      autoCleanSec: DEFAULT_CHANNEL_SETTINGS.autoCleanSec,
      onlyRarePlus: DEFAULT_CHANNEL_SETTINGS.onlyRarePlus,
    };
  }

  if (!isRecord(raw)) {
    return DEFAULT_CHANNEL_SETTINGS;
  }

  return {
    enabled: readBoolean(raw, 'enabled', false),
    autoCleanSec: Math.min(
      60,
      Math.max(0, readNumber(raw, 'autoCleanSec', DEFAULT_CHANNEL_SETTINGS.autoCleanSec)),
    ),
    onlyRarePlus: readBoolean(raw, 'onlyRarePlus', DEFAULT_CHANNEL_SETTINGS.onlyRarePlus),
  };
}

function sanitizeGoldenHour(raw: unknown): GoldenHourSchedule {
  if (!isRecord(raw)) return DEFAULT_GOLDEN_HOUR;
  const startRaw = raw['startAtMs'];
  const startAtMs = typeof startRaw === 'number' && Number.isFinite(startRaw) ? startRaw : null;
  const chRaw = raw['channelId'];
  const channelId = typeof chRaw === 'string' && chRaw.length > 0 ? chRaw : null;
  return {
    startAtMs,
    channelId,
    warned5m: readBoolean(raw, 'warned5m', false),
  };
}

function sanitizeProfile(raw: unknown, migrateV1Cooldowns = false): UserBotProfile {
  if (!isRecord(raw)) {
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

  const rawLogs = raw['logs'];
  const logs = Array.isArray(rawLogs) ? rawLogs.filter(isValidCatchLog) : [];

  const rawQuests = raw['quests'];
  const quests = Array.isArray(rawQuests) ? rawQuests.filter(isValidQuestEntry) : [];

  const rawReturn = raw['catchbotReturnAtMs'];
  const catchbotReturnAtMs =
    typeof rawReturn === 'number' && Number.isFinite(rawReturn) ? rawReturn : null;
  const rawChannel = raw['catchbotChannelId'];
  const catchbotChannelId =
    typeof rawChannel === 'string' && rawChannel.length > 0 ? rawChannel : null;

  return {
    displayName: readString(raw, 'displayName', ''),
    avatarUrl: readString(raw, 'avatarUrl', ''),
    buffs: sanitizeBuffs(raw['buffs'], migrateV1Cooldowns),
    fishingSetup: sanitizeFishingSetup(raw['fishingSetup']),
    economy: sanitizeEconomy(raw['economy']),
    remindersEnabled: readBoolean(raw, 'remindersEnabled', true),
    catchbotReturnAtMs,
    catchbotChannelId,
    quests,
    logs,
  };
}

export function isLegacyCorruptedLog(entry: CatchLogEntry): boolean {
  if (entry.pokemonName.toLowerCase() === 'wild') return true;
  if (entry.ballId === 'mb' && !entry.caught) return true;
  if (
    entry.ballId === 'mb' &&
    entry.ballCost >= 100000 &&
    (entry.rarityId === 'common' || entry.rarityId === 'uncommon' || entry.rarityId === 'rare')
  ) {
    return true;
  }
  return false;
}

export class BotStore {
  private readonly filePath: string;
  private lastLoadedMtimeMs = 0;
  private state: PersistedBotState;

  public constructor(filePath = path.join(process.cwd(), 'data', 'bot-state.json')) {
    this.filePath = filePath;
    this.state = this.loadFromDisk();
  }

  private getDiskMtimeMs(): number {
    try {
      return statSync(this.filePath).mtimeMs;
    } catch {
      return 0;
    }
  }

  private syncFromDiskIfChanged(): void {
    const diskMtime = this.getDiskMtimeMs();
    if (diskMtime > 0 && diskMtime !== this.lastLoadedMtimeMs) {
      this.state = this.loadFromDisk();
    }
  }

  private loadFromDisk(): PersistedBotState {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      this.lastLoadedMtimeMs = this.getDiskMtimeMs();
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) {
        return {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          users: {},
          enabledChannels: {},
          goldenHour: DEFAULT_GOLDEN_HOUR,
          hallOfFame: [],
        };
      }

      const fileVersion = readNumber(parsed, 'schemaVersion', 1);
      const migrateV1Cooldowns = fileVersion < 2;

      const users: Record<string, UserBotProfile> = {};
      const rawUsers = parsed['users'];
      if (isRecord(rawUsers)) {
        for (const [userId, profile] of Object.entries(rawUsers)) {
          users[userId] = sanitizeProfile(profile, migrateV1Cooldowns);
        }
      }

      const enabledChannels: Record<string, ChannelHelperSettings> = {};
      const rawChannels = parsed['enabledChannels'];
      if (isRecord(rawChannels)) {
        for (const [channelId, chVal] of Object.entries(rawChannels)) {
          enabledChannels[channelId] = sanitizeChannelSettings(chVal);
        }
      }

      const rawHof = parsed['hallOfFame'];
      const hallOfFame = Array.isArray(rawHof) ? rawHof.filter(isValidHofEntry) : [];

      const nextState: PersistedBotState = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        users,
        enabledChannels,
        goldenHour: sanitizeGoldenHour(parsed['goldenHour']),
        hallOfFame,
      };

      if (fileVersion < CURRENT_SCHEMA_VERSION) {
        try {
          mkdirSync(path.dirname(this.filePath), { recursive: true });
          writeFileSync(this.filePath, JSON.stringify(nextState, null, 2), 'utf-8');
          this.lastLoadedMtimeMs = this.getDiskMtimeMs();
        } catch {
          // Ignore migration write error
        }
      }

      return nextState;
    } catch {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        users: {},
        enabledChannels: {},
        goldenHour: DEFAULT_GOLDEN_HOUR,
        hallOfFame: [],
      };
    }
  }

  private saveToDisk(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    this.lastLoadedMtimeMs = this.getDiskMtimeMs();
  }

  public getAllUsersSnapshot(): Readonly<Record<string, UserBotProfile>> {
    this.syncFromDiskIfChanged();
    return this.state.users;
  }

  public getAllChannelsSnapshot(): Readonly<Record<string, ChannelHelperSettings>> {
    this.syncFromDiskIfChanged();
    return this.state.enabledChannels;
  }

  public getGoldenHourSchedule(): GoldenHourSchedule {
    this.syncFromDiskIfChanged();
    return this.state.goldenHour;
  }

  public setGoldenHourSchedule(patch: Partial<GoldenHourSchedule>): GoldenHourSchedule {
    this.syncFromDiskIfChanged();
    const next = sanitizeGoldenHour({ ...this.state.goldenHour, ...patch });
    this.state = {
      ...this.state,
      goldenHour: next,
    };
    this.saveToDisk();
    return next;
  }

  public getHallOfFame(): readonly HallOfFameEntry[] {
    this.syncFromDiskIfChanged();
    return this.state.hallOfFame;
  }

  public addHallOfFameEntry(entry: HallOfFameEntry): void {
    this.syncFromDiskIfChanged();
    const nextHof = [entry, ...this.state.hallOfFame].slice(0, 100);
    this.state = {
      ...this.state,
      hallOfFame: nextHof,
    };
    this.saveToDisk();
  }

  public getUserProfile(userId: string): UserBotProfile {
    this.syncFromDiskIfChanged();
    const existing = this.state.users[userId];
    if (existing) return existing;
    return sanitizeProfile(null);
  }

  public updateUserIdentity(userId: string, displayName: string, avatarUrl: string): void {
    this.syncFromDiskIfChanged();
    const current = this.state.users[userId] ?? sanitizeProfile(null);
    if (current.displayName === displayName && current.avatarUrl === avatarUrl) {
      return;
    }
    this.state.users[userId] = {
      ...current,
      displayName: displayName || current.displayName,
      avatarUrl: avatarUrl || current.avatarUrl,
    };
    this.saveToDisk();
  }

  public updateUserBuffs(userId: string, patch: Partial<BuffConfig>): UserBotProfile {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    const updated: UserBotProfile = {
      ...current,
      buffs: sanitizeBuffs({ ...current.buffs, ...patch }),
    };
    this.state.users[userId] = updated;
    this.saveToDisk();
    return updated;
  }

  public updateUserFishingSetup(userId: string, patch: Partial<FishingSetup>): UserBotProfile {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    const updated: UserBotProfile = {
      ...current,
      fishingSetup: sanitizeFishingSetup({ ...current.fishingSetup, ...patch }),
    };
    this.state.users[userId] = updated;
    this.saveToDisk();
    return updated;
  }

  public resetUserBuffs(userId: string): UserBotProfile {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    const updated: UserBotProfile = {
      ...current,
      buffs: DEFAULT_BUFF_CONFIG,
    };
    this.state.users[userId] = updated;
    this.saveToDisk();
    return updated;
  }

  public setUserReminders(userId: string, enabled: boolean): UserBotProfile {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    const updated: UserBotProfile = {
      ...current,
      remindersEnabled: enabled,
    };
    this.state.users[userId] = updated;
    this.saveToDisk();
    return updated;
  }

  public setUserCatchbotSchedule(
    userId: string,
    returnAtMs: number | null,
    channelId: string | null,
  ): UserBotProfile {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    const updated: UserBotProfile = {
      ...current,
      catchbotReturnAtMs: returnAtMs,
      catchbotChannelId: channelId,
    };
    this.state.users[userId] = updated;
    this.saveToDisk();
    return updated;
  }

  public setUserQuests(userId: string, quests: readonly QuestEntry[]): UserBotProfile {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    const updated: UserBotProfile = {
      ...current,
      quests,
    };
    this.state.users[userId] = updated;
    this.saveToDisk();
    return updated;
  }

  /**
   * Advances matching quests upon a successful catch and returns any quests
   * that just reached 100% completion on this catch!
   */
  public advanceUserQuestsOnCatch(
    userId: string,
    source: EncounterSource,
    rarityId: RarityId,
  ): readonly QuestEntry[] {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    if (current.quests.length === 0) return [];

    const newlyCompleted: QuestEntry[] = [];
    let changed = false;

    const nextQuests = current.quests.map((q) => {
      if (q.current >= q.goal) return q;

      let matches = false;
      if (q.kind === 'any_catch') {
        matches = true;
      } else if (q.kind === 'fishing' && source === 'fishing') {
        matches = true;
      } else if (q.kind === 'rarity' && q.rarityFilter === rarityId) {
        matches = true;
      }

      if (!matches) return q;

      changed = true;
      const updatedQuest: QuestEntry = {
        ...q,
        current: Math.min(q.goal, q.current + 1),
      };
      if (updatedQuest.current >= updatedQuest.goal) {
        newlyCompleted.push(updatedQuest);
      }
      return updatedQuest;
    });

    if (changed) {
      this.state.users[userId] = {
        ...current,
        quests: nextQuests,
      };
      this.saveToDisk();
    }

    return newlyCompleted;
  }

  public addUserLog(userId: string, entry: CatchLogEntry): UserBotProfile {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    const updated: UserBotProfile = {
      ...current,
      logs: [entry, ...current.logs],
    };
    this.state.users[userId] = updated;
    this.saveToDisk();
    return updated;
  }

  public deleteUserLog(userId: string, logId: string): boolean {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    const nextLogs = current.logs.filter((item) => item.id !== logId);
    if (nextLogs.length === current.logs.length) return false;

    this.state.users[userId] = {
      ...current,
      logs: nextLogs,
    };
    this.saveToDisk();
    return true;
  }

  public cleanCorruptedLogs(userId: string): number {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    const keptLogs = current.logs.filter((entry) => !isLegacyCorruptedLog(entry));
    const removedCount = current.logs.length - keptLogs.length;

    if (removedCount > 0) {
      this.state.users[userId] = {
        ...current,
        logs: keptLogs,
      };
      this.saveToDisk();
    }

    return removedCount;
  }

  public clearUserLogs(userId: string): UserBotProfile {
    this.syncFromDiskIfChanged();
    const current = this.getUserProfile(userId);
    const updated: UserBotProfile = {
      ...current,
      logs: [],
    };
    this.state.users[userId] = updated;
    this.saveToDisk();
    return updated;
  }

  public getChannelSettings(channelId: string): ChannelHelperSettings {
    this.syncFromDiskIfChanged();
    return this.state.enabledChannels[channelId] ?? DEFAULT_CHANNEL_SETTINGS;
  }

  public isChannelEnabled(channelId: string): boolean {
    return this.getChannelSettings(channelId).enabled;
  }

  public setChannelSettings(
    channelId: string,
    patch: Partial<ChannelHelperSettings>,
  ): ChannelHelperSettings {
    this.syncFromDiskIfChanged();
    const current = this.getChannelSettings(channelId);
    const next = sanitizeChannelSettings({ ...current, ...patch });
    this.state.enabledChannels[channelId] = next;
    this.saveToDisk();
    return next;
  }

  public setChannelEnabled(channelId: string, enabled: boolean): void {
    this.setChannelSettings(channelId, { enabled });
  }
}
