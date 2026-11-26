import {
  EmbedBuilder,
  type Client,
  type Message,
  type PartialMessage,
} from 'discord.js';
import { detectGenerationGroup } from '@/domain/data/gen6-7-pokemon';
import { BALL_SPECS, RARITY_SPECS } from '@/domain/data/pokemeow-data';
import { optimizerService } from '@/domain/services/optimizer-service';
import {
  FishingCatchRateStrategy,
  WildCatchRateStrategy,
} from '@/domain/strategies/catch-rate-strategy';
import type { CatchLogEntry, EncounterSource, RarityId } from '@/domain/types';
import { formatPercent, formatSignedCoins } from '@/lib/format';
import type { BotConfig } from '../config';
import {
  parseManualCommandTrigger,
  parsePokemeowCaptchaAlert,
  parsePokemeowCatchOutcome,
  parsePokemeowCatchbotTimer,
  parsePokemeowCooldownWait,
  parsePokemeowEncounter,
  parsePokemeowQuests,
  parsePokemeowSeaFlute,
  type PokemeowMessageInput,
} from '../parsers/pokemeow-embed-parser';
import type { IBotStateStore } from '../store/store-interface';
import { formatDurationRemaining } from './interaction-handler';

interface ActiveSpawnRecord {
  readonly messageId: string;
  readonly channelId: string;
  readonly userId: string | null;
  readonly source: EncounterSource;
  readonly rarityId: RarityId;
  readonly pokemonName: string;
  readonly timestamp: number;
}

interface ManualActorRecord {
  readonly userId: string;
  readonly source: EncounterSource;
  readonly timestamp: number;
}

interface SentHelperMessageRecord {
  readonly message: Message;
  readonly deleteTimer: NodeJS.Timeout | null;
}

const MAX_CACHE_ENTRIES = 300;
const SPAWN_TTL_MS = 90_000;
const MANUAL_ACTOR_TTL_MS = 30_000;
const LATENCY_BUFFER_MS = 500;
const BACKGROUND_POLL_INTERVAL_MS = 15_000;

const LOW_TIER_RARITIES: ReadonlySet<RarityId> = new Set(['common', 'uncommon']);
const HOF_RARITIES: ReadonlySet<RarityId> = new Set([
  'legendary',
  'shiny_full',
  'shiny_event',
  'golden',
]);

function addBoundedSet(set: Set<string>, value: string): void {
  if (set.size >= MAX_CACHE_ENTRIES) {
    const oldest = set.values().next().value;
    if (typeof oldest === 'string') {
      set.delete(oldest);
    }
  }
  set.add(value);
}

function setBoundedMap<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (map.size >= MAX_CACHE_ENTRIES && !map.has(key)) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) {
      map.delete(oldestKey);
    }
  }
  map.set(key, value);
}

function normalizeNameKey(raw: string): string {
  return raw.trim().toLowerCase();
}

async function safeDeleteMessage(msg: Message): Promise<void> {
  try {
    if (msg.deletable) {
      await msg.delete();
    }
  } catch {
    // Ignore if already deleted by user or missing permission
  }
}

export class PassiveHelperHandler {
  private readonly store: IBotStateStore;
  private readonly config: BotConfig;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly hintedMessageIds = new Set<string>();
  private readonly alertedCaptchaIds = new Set<string>();
  private readonly scheduledCatchbotMsgIds = new Set<string>();
  private readonly scheduledSeaFluteMsgIds = new Set<string>();
  private readonly syncedQuestMsgIds = new Set<string>();
  private readonly loggedOutcomeKeys = new Set<string>();
  private readonly activeSpawns = new Map<string, ActiveSpawnRecord>();
  private readonly lastUserSpawnInChannel = new Map<string, ActiveSpawnRecord>();
  private readonly lastChannelSpawn = new Map<string, ActiveSpawnRecord>();
  private readonly lastChannelManualActor = new Map<string, ManualActorRecord>();
  private readonly knownMemberNames = new Map<string, string>();
  private readonly sentHintMessages = new Map<string, SentHelperMessageRecord>();
  private readonly sentReminderMessages = new Map<string, SentHelperMessageRecord>();
  private pollerInterval: NodeJS.Timeout | null = null;

  public constructor(store: IBotStateStore, config: BotConfig) {
    this.store = store;
    this.config = config;
  }

  public startCatchbotPoller(client: Client): void {
    if (this.pollerInterval) {
      clearInterval(this.pollerInterval);
    }

    this.pollerInterval = setInterval(() => {
      void this.checkDueSchedules(client);
    }, BACKGROUND_POLL_INTERVAL_MS);
  }

  public dispose(): void {
    if (this.pollerInterval) {
      clearInterval(this.pollerInterval);
      this.pollerInterval = null;
    }

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    for (const record of this.sentHintMessages.values()) {
      if (record.deleteTimer) clearTimeout(record.deleteTimer);
    }
    this.sentHintMessages.clear();

    for (const record of this.sentReminderMessages.values()) {
      if (record.deleteTimer) clearTimeout(record.deleteTimer);
    }
    this.sentReminderMessages.clear();
  }

  private async checkDueSchedules(client: Client): Promise<void> {
    const now = Date.now();

    const users = await this.store.getAllUsersSnapshot();
    for (const [userId, profile] of Object.entries(users)) {
      if (
        profile.catchbotReturnAtMs !== null &&
        profile.catchbotReturnAtMs <= now &&
        profile.catchbotChannelId
      ) {
        const channelId = profile.catchbotChannelId;
        await this.store.setUserCatchbotSchedule(userId, null, null);

        try {
          const channel = await client.channels.fetch(channelId);
          if (channel?.isSendable()) {
            await channel.send({
              content: `🤖 <@${userId}> **CatchBot (\`;cb\`) đã hoàn thành chuyến đi!** Hãy gõ \`;cb\` để thu hoạch Pokémon và cho chạy tiếp nhé!`,
            });
          }
        } catch (error) {
          console.error('[Helper] Không thể gửi thông báo thu hoạch CatchBot:', error);
        }
      }
    }

    const gh = await this.store.getGoldenHourSchedule();
    if (gh.startAtMs !== null && gh.channelId) {
      const remainingMs = gh.startAtMs - now;

      if (remainingMs <= 0) {
        const channelId = gh.channelId;
        await this.store.setGoldenHourSchedule({ startAtMs: null, channelId: null, warned5m: false });
        try {
          const channel = await client.channels.fetch(channelId);
          if (channel?.isSendable()) {
            await channel.send({
              content:
                '✨🌊 **GOLDEN FISHING HOUR ĐÃ CHÍNH THỨC BẮT ĐẦU!** Hãy gõ `;f` (`/fish`) ngay để săn cá Golden & x2 tỉ lệ Shiny!',
            });
          }
        } catch {
          // Ignore send errors
        }
      } else if (remainingMs <= 5 * 60_000 && !gh.warned5m) {
        await this.store.setGoldenHourSchedule({ warned5m: true });
        try {
          const channel = await client.channels.fetch(gh.channelId);
          if (channel?.isSendable()) {
            await channel.send({
              content: `🌊⏰ **CÒN ${Math.max(1, Math.ceil(remainingMs / 60_000))} PHÚT NỮA ĐẾN GOLDEN FISHING HOUR!** Chuẩn bị sẵn Super Rod, PokéLure / Misty's Lure & Diveball nhé!`,
            });
          }
        } catch {
          // Ignore send errors
        }
      }
    }
  }

  public async handleMessageUpdate(message: Message | PartialMessage): Promise<void> {
    try {
      const fullMessage = message.partial ? await message.fetch() : message;
      await this.handleMessage(fullMessage);
    } catch (error) {
      console.error('[Helper] Không thể đọc tin nhắn cập nhật (MessageUpdate):', error);
    }
  }

  private rememberHumanMember(message: Message): void {
    const user = message.author;
    if (user.bot) return;

    setBoundedMap(this.knownMemberNames, normalizeNameKey(user.username), user.id);
    if (user.globalName) {
      setBoundedMap(this.knownMemberNames, normalizeNameKey(user.globalName), user.id);
    }
    if (message.member?.displayName) {
      setBoundedMap(this.knownMemberNames, normalizeNameKey(message.member.displayName), user.id);
    }
  }

  public async handleMessage(message: Message): Promise<void> {
    if (!message.inGuild()) return;

    if (!message.author.bot) {
      this.rememberHumanMember(message);
    }

    const channelSettings = await this.store.getChannelSettings(message.channelId);
    if (!channelSettings.enabled) {
      return;
    }

    if (message.author.id === this.config.pokemeowBotId) {
      await this.handlePokemeowMessage(
        message,
        channelSettings.autoCleanSec,
        channelSettings.onlyRarePlus,
      );
      return;
    }

    if (!message.author.bot) {
      await this.handleUserTrigger(message, channelSettings.autoCleanSec);
    }
  }

  private extractMessageInput(message: Message): PokemeowMessageInput {
    const authors: string[] = [];
    const titles: string[] = [];
    const descriptions: string[] = [];
    const fieldsParts: string[] = [];
    const footers: string[] = [];
    let embedColor: number | null = null;

    for (const embed of message.embeds) {
      if (embed.author?.name) authors.push(embed.author.name);
      if (embed.title) titles.push(embed.title);
      if (embed.description) descriptions.push(embed.description);
      for (const field of embed.fields) {
        fieldsParts.push(`${field.name}: ${field.value}`);
      }
      if (embed.footer?.text) footers.push(embed.footer.text);
      if (embedColor === null && embed.color !== null) {
        embedColor = embed.color;
      }
    }

    let componentsText = '';
    if (message.components.length > 0) {
      try {
        componentsText = JSON.stringify(message.components.map((comp) => comp.toJSON()));
      } catch {
        componentsText = '';
      }
    }

    return {
      content: message.content,
      embedAuthor: authors.join('\n'),
      embedTitle: titles.join('\n'),
      embedDescription: descriptions.join('\n'),
      embedFieldsText: fieldsParts.join('\n'),
      embedFooter: footers.join('\n'),
      embedColor,
      componentsText,
      interactionCommandName: message.interaction?.commandName ?? '',
    };
  }

  private async resolveTargetUserId(
    message: Message,
    trainerNameHint?: string,
    matchedSpawn?: ActiveSpawnRecord,
  ): Promise<string | null> {
    if (message.interactionMetadata?.user.id) {
      const u = message.interactionMetadata.user;
      await this.store.updateUserIdentity(
        u.id,
        u.globalName ?? u.username,
        u.displayAvatarURL({ size: 128 }),
      );
      return u.id;
    }

    if (message.interactionMetadata?.triggeringInteractionMetadata?.user.id) {
      const u = message.interactionMetadata.triggeringInteractionMetadata.user;
      await this.store.updateUserIdentity(
        u.id,
        u.globalName ?? u.username,
        u.displayAvatarURL({ size: 128 }),
      );
      return u.id;
    }

    const mentionedUser = message.mentions.users.find(
      (u) => !u.bot && u.id !== this.config.pokemeowBotId,
    );
    if (mentionedUser) {
      await this.store.updateUserIdentity(
        mentionedUser.id,
        mentionedUser.globalName ?? mentionedUser.username,
        mentionedUser.displayAvatarURL({ size: 128 }),
      );
      return mentionedUser.id;
    }

    if (matchedSpawn?.userId) {
      return matchedSpawn.userId;
    }

    if (trainerNameHint && trainerNameHint.trim().length > 0) {
      const key = normalizeNameKey(trainerNameHint);
      const fromKnown = this.knownMemberNames.get(key);
      if (fromKnown) return fromKnown;

      if (message.inGuild()) {
        const cachedMember = message.guild.members.cache.find(
          (m) =>
            !m.user.bot &&
            (normalizeNameKey(m.displayName) === key ||
              normalizeNameKey(m.user.username) === key ||
              (m.user.globalName !== null && normalizeNameKey(m.user.globalName) === key)),
        );
        if (cachedMember) {
          await this.store.updateUserIdentity(
            cachedMember.id,
            cachedMember.displayName,
            cachedMember.user.displayAvatarURL({ size: 128 }),
          );
          return cachedMember.id;
        }
      }
    }

    const recentManual = this.lastChannelManualActor.get(message.channelId);
    if (recentManual && Date.now() - recentManual.timestamp <= MANUAL_ACTOR_TTL_MS) {
      return recentManual.userId;
    }

    return null;
  }

  private async findMatchingSpawn(
    message: Message,
    trainerNameHint?: string,
  ): Promise<ActiveSpawnRecord | undefined> {
    const direct = this.activeSpawns.get(message.id);
    if (direct) return direct;

    const interactedId = message.interactionMetadata?.interactedMessageId;
    if (interactedId) {
      const byInteraction = this.activeSpawns.get(interactedId);
      if (byInteraction) return byInteraction;
    }

    const candidateUserId = await this.resolveTargetUserId(message, trainerNameHint);
    if (candidateUserId) {
      const perUserSpawn = this.lastUserSpawnInChannel.get(
        `${message.channelId}:${candidateUserId}`,
      );
      if (perUserSpawn && Date.now() - perUserSpawn.timestamp <= SPAWN_TTL_MS) {
        return perUserSpawn;
      }
    }

    const latestInChannel = this.lastChannelSpawn.get(message.channelId);
    if (latestInChannel && Date.now() - latestInChannel.timestamp <= SPAWN_TTL_MS) {
      return latestInChannel;
    }

    return undefined;
  }

  private clearUserCooldownTimers(userId: string): void {
    for (const source of ['wild', 'fishing'] as const) {
      const key = `${userId}:${source}`;
      const existing = this.timers.get(key);
      if (existing) {
        clearTimeout(existing);
        this.timers.delete(key);
      }
    }
  }

  private cleanupSentHintForSpawn(spawnMessageId: string): void {
    const record = this.sentHintMessages.get(spawnMessageId);
    if (!record) return;
    if (record.deleteTimer) {
      clearTimeout(record.deleteTimer);
    }
    this.sentHintMessages.delete(spawnMessageId);
    void safeDeleteMessage(record.message);
  }

  private cleanupPreviousReminder(userId: string, source: EncounterSource): void {
    const key = `${userId}:${source}`;
    const record = this.sentReminderMessages.get(key);
    if (!record) return;
    if (record.deleteTimer) {
      clearTimeout(record.deleteTimer);
    }
    this.sentReminderMessages.delete(key);
    void safeDeleteMessage(record.message);
  }

  private async handlePokemeowMessage(
    message: Message,
    autoCleanSec: number,
    onlyRarePlus: boolean,
  ): Promise<void> {
    const input = this.extractMessageInput(message);

    // 0A. Passive CAPTCHA Emergency Alert
    if (parsePokemeowCaptchaAlert(input)) {
      if (this.alertedCaptchaIds.has(message.id)) return;
      addBoundedSet(this.alertedCaptchaIds, message.id);

      const userId = await this.resolveTargetUserId(message);
      if (userId) {
        this.clearUserCooldownTimers(userId);
      }

      const mentionText = userId ? `<@${userId}> ` : '';
      try {
        if (message.channel.isSendable()) {
          await message.channel.send({
            content: `🚨 ${mentionText}**CẢNH BÁO CAPTCHA!** Hãy **DỪNG GÕ LỆNH NGAY** và tự kiểm tra tin nhắn của PokéMeow để nhập mã xác minh thủ công!`,
          });
        }
      } catch (error) {
        console.error('[Helper] Không thể gửi cảnh báo CAPTCHA:', error);
      }
      return;
    }

    // 0B. Exact remaining cooldown sync
    const cooldownWait = parsePokemeowCooldownWait(input);
    if (cooldownWait) {
      const recentActor = this.lastChannelManualActor.get(message.channelId);
      const userId = await this.resolveTargetUserId(message);
      const source = cooldownWait.source ?? recentActor?.source ?? 'wild';
      if (userId) {
        await this.setCooldownTimerMs(
          message,
          userId,
          source,
          cooldownWait.waitSeconds * 1000 + LATENCY_BUFFER_MS,
          autoCleanSec,
          true,
        );
      }
      return;
    }

    // 0C. Sea Flute (;seaflute) Golden Fishing Hour
    const seaFlute = parsePokemeowSeaFlute(input);
    if (seaFlute && !this.scheduledSeaFluteMsgIds.has(message.id)) {
      addBoundedSet(this.scheduledSeaFluteMsgIds, message.id);
      const startAtMs = Date.now() + seaFlute.startsInSeconds * 1000;
      await this.store.setGoldenHourSchedule({
        startAtMs,
        channelId: message.channelId,
        warned5m: seaFlute.startsInSeconds <= 300,
      });

      const unix = Math.floor(startAtMs / 1000);
      try {
        if (message.channel.isSendable()) {
          await message.channel.send({
            content: `🌊 Đã tự đặt báo thức **Golden Fishing Hour** lúc <t:${unix}:T> (<t:${unix}:R>) — bot sẽ gọi cả nhóm trước 5 phút!`,
          });
        }
      } catch {
        // Ignore send errors
      }
      return;
    }

    // 0D. Daily Quests (;q / ;quest)
    const parsedQuests = parsePokemeowQuests(input);
    if (parsedQuests && !this.syncedQuestMsgIds.has(message.id)) {
      const userId = await this.resolveTargetUserId(message);
      if (userId) {
        addBoundedSet(this.syncedQuestMsgIds, message.id);
        await this.store.setUserQuests(userId, parsedQuests);
        try {
          if (message.channel.isSendable()) {
            const note = await message.channel.send({
              content: `🎯 <@${userId}> Đã đồng bộ **${parsedQuests.length} nhiệm vụ hằng ngày** (xem bằng \`/quest view\`). Bot sẽ báo ngay khi bạn hoàn thành!`,
            });
            if (autoCleanSec > 0) {
              setTimeout(() => {
                void safeDeleteMessage(note);
              }, Math.max(12, autoCleanSec) * 1000);
            }
          }
        } catch {
          // Ignore send errors
        }
        return;
      }
    }

    // 0E. CatchBot (;cb) countdown
    const catchbotTimer = parsePokemeowCatchbotTimer(input);
    if (catchbotTimer && !this.scheduledCatchbotMsgIds.has(message.id)) {
      const userId = await this.resolveTargetUserId(message);
      if (userId) {
        addBoundedSet(this.scheduledCatchbotMsgIds, message.id);
        const returnAtMs = Date.now() + catchbotTimer.remainingSeconds * 1000;
        await this.store.setUserCatchbotSchedule(userId, returnAtMs, message.channelId);

        try {
          if (message.channel.isSendable()) {
            const reply = await message.channel.send({
              content: `🤖 <@${userId}> Đã tự đặt hẹn nhắc thu hoạch **CatchBot (\`;cb\`)** sau **${formatDurationRemaining(catchbotTimer.remainingSeconds * 1000)}**!`,
            });
            if (autoCleanSec > 0) {
              setTimeout(() => {
                void safeDeleteMessage(reply);
              }, Math.max(10, autoCleanSec) * 1000);
            }
          }
        } catch {
          // Ignore send errors
        }
        return;
      }
    }

    // 1. Active Pokémon Spawn
    const parsedSpawn = parsePokemeowEncounter(input);
    if (parsedSpawn) {
      if (this.hintedMessageIds.has(message.id)) return;
      addBoundedSet(this.hintedMessageIds, message.id);

      const resolvedUserId = await this.resolveTargetUserId(message, parsedSpawn.trainerName);
      const spawnRecord: ActiveSpawnRecord = {
        messageId: message.id,
        channelId: message.channelId,
        userId: resolvedUserId,
        source: parsedSpawn.source,
        rarityId: parsedSpawn.rarityId,
        pokemonName: parsedSpawn.pokemonName,
        timestamp: Date.now(),
      };

      setBoundedMap(this.activeSpawns, message.id, spawnRecord);
      this.lastChannelSpawn.set(message.channelId, spawnRecord);
      if (resolvedUserId) {
        setBoundedMap(
          this.lastUserSpawnInChannel,
          `${message.channelId}:${resolvedUserId}`,
          spawnRecord,
        );
      }

      const profile = await this.store.getUserProfile(resolvedUserId ?? 'default');

      if (resolvedUserId) {
        this.cleanupPreviousReminder(resolvedUserId, parsedSpawn.source);
        const totalDelayMs =
          (parsedSpawn.source === 'fishing'
            ? profile.buffs.fishCooldownSec
            : profile.buffs.wildCooldownSec) *
            1000 +
          LATENCY_BUFFER_MS;
        const elapsedSinceCastMs = Math.max(0, Date.now() - message.createdTimestamp);
        const remainingMs = Math.max(1000, totalDelayMs - elapsedSinceCastMs);

        await this.setCooldownTimerMs(
          message,
          resolvedUserId,
          parsedSpawn.source,
          remainingMs,
          autoCleanSec,
          false,
        );
      }

      if (onlyRarePlus && LOW_TIER_RARITIES.has(parsedSpawn.rarityId)) {
        return;
      }

      const genGroup =
        parsedSpawn.source === 'wild'
          ? detectGenerationGroup(parsedSpawn.pokemonName, 'gen1_5_8')
          : 'gen1_5_8';

      const strategy =
        parsedSpawn.source === 'fishing'
          ? new FishingCatchRateStrategy(profile.fishingSetup)
          : new WildCatchRateStrategy(genGroup);

      const result = optimizerService.evaluateRarity(
        parsedSpawn.rarityId,
        strategy,
        profile.buffs,
        profile.economy,
      );

      const rarity = RARITY_SPECS[parsedSpawn.rarityId];
      const bestBall = BALL_SPECS[result.bestBall.ballId];
      const safeAlternative = result.evaluations.find(
        (item) => item.recommendationTag === 'safe' && item.ballId !== result.bestBall.ballId,
      );

      const lines: string[] = [];
      if (genGroup === 'gen6_7') {
        lines.push('⚠️ **Gen 6–7 (Kalos/Alola):** Tỉ lệ bắt gốc thấp hơn chuẩn!');
      }
      lines.push(
        `Tối ưu EV: **${bestBall.name} (\`${bestBall.shortCode}\`)** — **${formatPercent(result.bestBall.catchRate, 1)}** · EV \`${formatSignedCoins(result.bestBall.expectedValue)}\``,
      );

      if (safeAlternative) {
        const safeBall = BALL_SPECS[safeAlternative.ballId];
        lines.push(
          `An toàn 100%: **${safeBall.name} (\`${safeBall.shortCode}\`)** — **${formatPercent(safeAlternative.catchRate, 1)}**`,
        );
      }

      const titleTarget =
        parsedSpawn.pokemonName.length > 0
          ? `${parsedSpawn.pokemonName} (${rarity.label})`
          : rarity.label;

      const embed = new EmbedBuilder()
        .setColor(Number.parseInt(rarity.hexColor.replace('#', ''), 16))
        .setTitle(
          `💡 Gợi ý bóng (${parsedSpawn.source === 'fishing' ? ';f' : ';p'}${genGroup === 'gen6_7' ? ' · Gen 6–7' : ''}) — ${titleTarget}`,
        )
        .setDescription(lines.join('\n'));

      try {
        if (message.channel.isSendable()) {
          const sentHint = await message.channel.send({ embeds: [embed] });
          const deleteTimer =
            autoCleanSec > 0
              ? setTimeout(() => {
                  this.sentHintMessages.delete(message.id);
                  void safeDeleteMessage(sentHint);
                }, autoCleanSec * 1000)
              : null;

          setBoundedMap(this.sentHintMessages, message.id, {
            message: sentHint,
            deleteTimer,
          });
        }
      } catch (error) {
        console.error('[Helper] Không thể gửi gợi ý bóng:', error);
      }
      return;
    }

    // 2. Catch or Escape Outcome
    const preliminaryOutcome = parsePokemeowCatchOutcome(input);
    if (!preliminaryOutcome) return;

    const matchedSpawn = await this.findMatchingSpawn(message, preliminaryOutcome.trainerName);
    const parsedOutcome = matchedSpawn
      ? parsePokemeowCatchOutcome(input, {
          source: matchedSpawn.source,
          rarityId: matchedSpawn.rarityId,
          pokemonName: matchedSpawn.pokemonName,
        })
      : preliminaryOutcome;

    if (!parsedOutcome) return;

    if (autoCleanSec > 0) {
      this.cleanupSentHintForSpawn(message.id);
      if (matchedSpawn && matchedSpawn.messageId !== message.id) {
        this.cleanupSentHintForSpawn(matchedSpawn.messageId);
      }
    }

    const outcomeKey = `${message.id}:${parsedOutcome.caught ? 'caught' : 'fled'}`;
    if (this.loggedOutcomeKeys.has(outcomeKey)) return;
    addBoundedSet(this.loggedOutcomeKeys, outcomeKey);

    const userId = await this.resolveTargetUserId(message, parsedOutcome.trainerName, matchedSpawn);
    if (!userId) return;

    const profile = await this.store.getUserProfile(userId);
    const baseProfit = optimizerService.computeSingleCatchProfit(
      parsedOutcome.rarityId,
      parsedOutcome.ballId,
      parsedOutcome.caught,
      profile.buffs,
      profile.economy,
    );

    const secondaryVal = optimizerService.getSecondaryValue(
      parsedOutcome.rarityId,
      profile.buffs,
      profile.economy,
    );
    const coinsEarned =
      parsedOutcome.caught && parsedOutcome.coinsEarnedOverride !== null
        ? parsedOutcome.coinsEarnedOverride + secondaryVal
        : baseProfit.coinsEarned;
    const netProfit = parsedOutcome.caught
      ? coinsEarned - baseProfit.ballCost
      : -baseProfit.ballCost;

    const entry: CatchLogEntry = {
      id: `${message.id}-${Date.now()}`,
      timestamp: Date.now(),
      source: parsedOutcome.source,
      rarityId: parsedOutcome.rarityId,
      ballId: parsedOutcome.ballId,
      caught: parsedOutcome.caught,
      pokemonName: parsedOutcome.pokemonName,
      ballCost: baseProfit.ballCost,
      coinsEarned,
      netProfit,
    };

    await this.store.addUserLog(userId, entry);

    if (parsedOutcome.caught) {
      if (HOF_RARITIES.has(parsedOutcome.rarityId)) {
        await this.store.addHallOfFameEntry({
          id: entry.id,
          userId,
          displayName: profile.displayName || parsedOutcome.trainerName,
          pokemonName: parsedOutcome.pokemonName || RARITY_SPECS[parsedOutcome.rarityId].label,
          rarityId: parsedOutcome.rarityId,
          ballId: parsedOutcome.ballId,
          timestamp: entry.timestamp,
        });
      }

      const completedQuests = await this.store.advanceUserQuestsOnCatch(
        userId,
        parsedOutcome.source,
        parsedOutcome.rarityId,
      );
      if (completedQuests.length > 0 && message.channel.isSendable()) {
        for (const q of completedQuests) {
          try {
            await message.channel.send({
              content: `🎉 <@${userId}> **Chúc mừng hoàn thành Quest #${q.index}:** *${q.description}*! Gõ \`;q\` để kiểm tra và nhận thưởng nhé!`,
            });
          } catch {
            // Ignore send errors
          }
        }
      }
    }
  }

  private async handleUserTrigger(message: Message, autoCleanSec: number): Promise<void> {
    const trimmed = message.content.trim().toLowerCase();
    const userId = message.author.id;
    const displayName =
      message.member?.displayName ?? message.author.globalName ?? message.author.username;

    if (/^;(?:p|pokemon|f|fish|cb|catchbot|q|quest|quests|seaflute)(?:\s|$)/.test(trimmed)) {
      await this.store.updateUserIdentity(
        userId,
        displayName,
        message.author.displayAvatarURL({ size: 128 }),
      );
    }

    if (/^;(?:cb|catchbot|q|quest|quests|seaflute)(?:\s|$)/.test(trimmed)) {
      this.lastChannelManualActor.set(message.channelId, {
        userId,
        source: 'wild',
        timestamp: Date.now(),
      });
      return;
    }

    const source = parseManualCommandTrigger(message.content);
    if (!source) return;

    this.cleanupPreviousReminder(userId, source);

    this.lastChannelManualActor.set(message.channelId, {
      userId,
      source,
      timestamp: Date.now(),
    });

    const profile = await this.store.getUserProfile(userId);
    const delaySec =
      source === 'fishing' ? profile.buffs.fishCooldownSec : profile.buffs.wildCooldownSec;

    await this.setCooldownTimerMs(
      message,
      userId,
      source,
      delaySec * 1000 + LATENCY_BUFFER_MS,
      autoCleanSec,
      true,
    );
  }

  private async setCooldownTimerMs(
    message: Message,
    userId: string,
    source: EncounterSource,
    durationMs: number,
    autoCleanSec: number,
    overwriteExisting: boolean,
  ): Promise<void> {
    const profile = await this.store.getUserProfile(userId);
    if (!profile.remindersEnabled) return;

    const key = `${userId}:${source}`;
    const existing = this.timers.get(key);

    if (existing && !overwriteExisting) {
      return;
    }

    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.timers.delete(key);
      void this.sendCooldownReminder(message, userId, source, autoCleanSec);
    }, durationMs);

    this.timers.set(key, timer);
  }

  private async sendCooldownReminder(
    message: Message,
    userId: string,
    source: EncounterSource,
    autoCleanSec: number,
  ): Promise<void> {
    if (!(await this.store.isChannelEnabled(message.channelId))) return;
    const commandLabel = source === 'fishing' ? '`/fish` (`;f`)' : '`/pokemon` (`;p`)';
    try {
      if (message.channel.isSendable()) {
        this.cleanupPreviousReminder(userId, source);
        const sentReminder = await message.channel.send({
          content: `⏰ <@${userId}> Cooldown ${commandLabel} đã sẵn sàng!`,
        });

        const key = `${userId}:${source}`;
        const deleteTimer =
          autoCleanSec > 0
            ? setTimeout(() => {
                this.sentReminderMessages.delete(key);
                void safeDeleteMessage(sentReminder);
              }, Math.max(15, autoCleanSec) * 1000)
            : null;

        setBoundedMap(this.sentReminderMessages, key, {
          message: sentReminder,
          deleteTimer,
        });
      }
    } catch (error) {
      console.error('[Helper] Không thể gửi nhắc cooldown:', error);
    }
  }
}
