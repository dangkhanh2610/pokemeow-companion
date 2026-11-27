import {
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type PermissionsBitField,
  type User,
} from 'discord.js';
import { resolveBallId } from '@/game/catalog/ball-catalog';
import type { BattleMoveAction } from '@/game/engine/battle-engine';
import { battleService } from '@/game/services/battle-service';
import { captchaService } from '@/game/services/captcha-service';
import { economyService } from '@/game/services/economy-service';
import { ENCOUNTER_TTL_MS, encounterService } from '@/game/services/encounter-service';
import { evolutionService } from '@/game/services/evolution-service';
import {
  FISHING_BITE_TTL_MS,
  FISHING_CATCH_TTL_MS,
  fishingService,
} from '@/game/services/fishing-service';
import {
  guildConfigService,
  isChannelAllowed,
  validatePrefix,
} from '@/game/services/guild-config-service';
import { leaderboardService } from '@/game/services/leaderboard-service';
import { marketService } from '@/game/services/market-service';
import { megaService } from '@/game/services/mega-service';
import { questService } from '@/game/services/quest-service';
import { trainerService, type TrainerIdentityInput } from '@/game/services/trainer-service';
import type { BallId, CreatureSpecies, LeaderboardMetric, ThrowBallOutcome } from '@/game/types';
import { botEmojiRegistry } from '../emoji-registry';
import {
  buildBagEmbed,
  buildBotStatusEmbed,
  buildCatchButtonsRow,
  buildCatchResultEmbed,
  buildChannelSettingsEmbed,
  buildDailyEmbed,
  buildDexEmbed,
  buildDexPaginationRow,
  buildExpiredEncounterEmbed,
  buildHelpEmbed,
  buildLeaderboardEmbed,
  buildMegaConfirmEmbed,
  buildMegaConfirmRow,
  buildMegaOverviewEmbed,
  buildMegaSuccessEmbed,
  buildPrefixEmbed,
  buildProfileEmbed,
  buildPurchaseSuccessEmbed,
  buildReleaseEmbed,
  buildShopEmbed,
  buildThrowingEmbed,
  buildWildEncounterEmbed,
} from '../ui/embeds';
import {
  buildBattleActionRows,
  buildBattleEmbed,
  buildBuddyEmbed,
  buildBuddyTrainEmbed,
  buildBuyFishingItemEmbed,
  buildCaptchaButtonsRow,
  buildCaptchaEmbed,
  buildCaptchaSuccessEmbed,
  buildErrorNotice,
  buildEvolutionCandidatesEmbed,
  buildEvolutionSuccessEmbed,
  buildFishingBiteEmbed,
  buildFishingCastingEmbed,
  buildFishingExpiredEmbed,
  buildFishingPullRow,
  buildFishingShopEmbed,
  buildGymListEmbed,
  buildMarketBrowseEmbed,
  buildMarketBuyConfirmEmbed,
  buildMarketBuyConfirmRow,
  buildMarketListSuccessEmbed,
  buildMarketPaginationRow,
  buildQuestClaimRow,
  buildQuestClaimSuccessEmbed,
  buildQuestsEmbed,
  buildTradeButtonsRow,
  buildTradeEmbed,
} from '../ui/feature-embeds';

function extractTrainerMeta(user: User): TrainerIdentityInput {
  return {
    userId: user.id,
    username: user.username,
    displayName: user.globalName ?? user.displayName ?? user.username,
    avatarUrl: user.displayAvatarURL({ size: 256 }),
  };
}

function parseMetric(raw: string | undefined): LeaderboardMetric {
  switch (raw?.toLowerCase()) {
    case 'coins':
    case 'pc':
    case 'money':
      return 'coins';
    case 'shinies':
    case 'shiny':
      return 'shinies';
    case 'level':
    case 'lv':
      return 'level';
    case 'catches':
    default:
      return 'catches';
  }
}

function canReplyInMessageChannel(message: Message): boolean {
  if (!message.guild) {
    return false;
  }
  const me = message.guild.members.me;
  if (!me) {
    return true;
  }
  const channel = message.channel;
  if ('permissionsFor' in channel) {
    const perms = channel.permissionsFor(me);
    if (!perms) {
      return true;
    }
    return (
      perms.has(PermissionFlagsBits.ViewChannel) &&
      perms.has(PermissionFlagsBits.SendMessages) &&
      perms.has(PermissionFlagsBits.EmbedLinks)
    );
  }
  return true;
}

function parseChannelMentionId(raw: string | undefined, fallbackId: string): string | null {
  if (!raw) {
    return fallbackId;
  }
  const match = /^<#(\d+)>$/.exec(raw.trim()) ?? /^(\d{15,22})$/.exec(raw.trim());
  return match?.[1] ?? null;
}

function parseUserMentionId(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const match = /^<@!?(\d+)>$/.exec(raw.trim()) ?? /^(\d{15,22})$/.exec(raw.trim());
  return match?.[1] ?? null;
}

const ADMIN_SLASH_COMMANDS = new Set(['bot', 'prefix', 'channel']);
const ADMIN_PREFIX_COMMANDS = new Set(['bot', 'prefix', 'channel']);

export class BotCommandRouter {
  private readonly defaultPrefix: string;
  private readonly botName: string;
  private readonly ownerIds: ReadonlySet<string>;
  private readonly encounterTimers = new Map<string, NodeJS.Timeout>();
  private readonly fishingTimers = new Map<string, NodeJS.Timeout>();

  public constructor(defaultPrefix: string, botName: string, ownerIds: readonly string[] = []) {
    this.defaultPrefix = defaultPrefix;
    this.botName = botName;
    this.ownerIds = new Set(ownerIds);
  }

  public dispose(): void {
    for (const timer of this.encounterTimers.values()) {
      clearTimeout(timer);
    }
    this.encounterTimers.clear();
    for (const timer of this.fishingTimers.values()) {
      clearTimeout(timer);
    }
    this.fishingTimers.clear();
  }

  private clearFishingTimer(encounterId: string): void {
    const existing = this.fishingTimers.get(encounterId);
    if (existing) {
      clearTimeout(existing);
      this.fishingTimers.delete(encounterId);
    }
  }

  private scheduleFishingExpiry(
    encounterId: string,
    sentMessage: Message,
    trainerDisplayName: string,
    delayMs: number,
  ): void {
    this.clearFishingTimer(encounterId);
    const timer = setTimeout(() => {
      this.fishingTimers.delete(encounterId);
      void (async () => {
        try {
          const expired = await fishingService.expireFishingIfActive(encounterId);
          if (!expired) {
            return;
          }
          await sentMessage.edit({
            embeds: [buildFishingExpiredEmbed(trainerDisplayName)],
            components: [],
          });
        } catch {
          // Bỏ qua nếu tin nhắn đã bị xóa
        }
      })();
    }, delayMs);
    timer.unref();
    this.fishingTimers.set(encounterId, timer);
  }

  private clearEncounterTimer(encounterId: string): void {
    const existing = this.encounterTimers.get(encounterId);
    if (existing) {
      clearTimeout(existing);
      this.encounterTimers.delete(encounterId);
    }
  }

  private scheduleEncounterExpiry(
    encounterId: string,
    sentMessage: Message,
    trainerDisplayName: string,
    species: CreatureSpecies,
    isShiny: boolean,
  ): void {
    this.clearEncounterTimer(encounterId);
    const timer = setTimeout(() => {
      this.encounterTimers.delete(encounterId);
      void (async () => {
        try {
          const expired = await encounterService.expireEncounterIfOpen(encounterId);
          if (!expired) {
            return;
          }
          const disabledEmpty: Record<BallId, number> = {
            pokeball: 0,
            greatball: 0,
            ultraball: 0,
            premierball: 0,
            masterball: 0,
          };
          await sentMessage.edit({
            embeds: [buildExpiredEncounterEmbed(trainerDisplayName, species, isShiny)],
            components: [buildCatchButtonsRow(encounterId, disabledEmpty, true)],
          });
        } catch {
          // Bỏ qua nếu tin nhắn đã bị xóa hoặc bot mất quyền edit
        }
      })();
    }, ENCOUNTER_TTL_MS);
    timer.unref();
    this.encounterTimers.set(encounterId, timer);
  }

  private isAdminOrOwner(
    userId: string,
    permissions: Readonly<PermissionsBitField> | null | undefined,
  ): boolean {
    if (this.ownerIds.has(userId)) {
      return true;
    }
    return Boolean(
      permissions?.has(PermissionFlagsBits.Administrator) ||
        permissions?.has(PermissionFlagsBits.ManageGuild),
    );
  }

  private extractPrefixedBody(
    content: string,
    serverPrefix: string,
    botUserId: string | undefined,
  ): string | null {
    if (content.startsWith(serverPrefix)) {
      return content.slice(serverPrefix.length).trim();
    }
    if (botUserId) {
      const mentionPrefix = `<@${botUserId}>`;
      const nickMentionPrefix = `<@!${botUserId}>`;
      if (content.startsWith(mentionPrefix)) {
        return content.slice(mentionPrefix.length).trim();
      }
      if (content.startsWith(nickMentionPrefix)) {
        return content.slice(nickMentionPrefix.length).trim();
      }
    }
    return null;
  }

  private async executePrefixBuy(
    message: Message,
    meta: TrainerIdentityInput,
    serverPrefix: string,
    rawItem: string | undefined,
    rawQty: string | undefined,
  ): Promise<void> {
    const crossIcon = botEmojiRegistry.getCrossMention();
    if (!rawItem) {
      await message.reply(
        `Cách dùng: \`${serverPrefix}s b <số_mục|mã> [số_lượng]\` — ví dụ: \`${serverPrefix}s b 1 10\` hoặc \`${serverPrefix}b pb 10\``,
      );
      return;
    }
    const ballId = resolveBallId(rawItem);
    if (!ballId) {
      await message.reply(
        `${crossIcon} Không tìm thấy vật phẩm \`${rawItem}\`. Hỗ trợ mục \`1\`–\`5\` hoặc mã \`pb\`, \`gb\`, \`ub\`, \`prb\`, \`mb\`.`,
      );
      return;
    }
    const quantity = rawQty ? Number.parseInt(rawQty, 10) : 1;
    const bought = await economyService.buyBall(
      meta,
      ballId,
      Number.isNaN(quantity) ? 0 : quantity,
      `msg-buy:${message.id}`,
    );
    if (!bought.ok) {
      await message.reply(`${crossIcon} ${bought.message}`);
      return;
    }
    await message.reply({
      embeds: [
        buildPurchaseSuccessEmbed(
          meta.displayName,
          bought.ballId,
          bought.quantityBought,
          bought.totalCost,
          bought.newBallQuantity,
          bought.newCoinsBalance,
        ),
      ],
    });
  }

  public async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const meta = extractTrainerMeta(interaction.user);
    const crossIcon = botEmojiRegistry.getCrossMention();
    const timerIcon = botEmojiRegistry.getTimerMention();

    if (ADMIN_SLASH_COMMANDS.has(interaction.commandName)) {
      if (!interaction.guildId) {
        await interaction.reply({
          content: 'Lệnh quản trị này chỉ dùng trong server Discord.',
          ephemeral: true,
        });
        return;
      }
      if (!this.isAdminOrOwner(interaction.user.id, interaction.memberPermissions)) {
        await interaction.reply({
          content:
            `${crossIcon} Chỉ Quản trị viên (Admin / Manage Server) mới có quyền dùng lệnh cấu hình này.`,
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === 'bot') {
        const action = interaction.options.getString('action') ?? 'status';
        if (action === 'on') {
          const nextState = await guildConfigService.setGuildEnabled(
            interaction.guildId,
            true,
            meta.displayName,
          );
          await interaction.reply({
            embeds: [buildBotStatusEmbed(this.botName, nextState, meta.displayName)],
          });
          return;
        }
        if (action === 'off') {
          const nextState = await guildConfigService.setGuildEnabled(
            interaction.guildId,
            false,
            meta.displayName,
          );
          await interaction.reply({
            embeds: [buildBotStatusEmbed(this.botName, nextState, meta.displayName)],
          });
          return;
        }
        const current = await guildConfigService.getGuildSettings(
          interaction.guildId,
          this.defaultPrefix,
        );
        await interaction.reply({ embeds: [buildBotStatusEmbed(this.botName, current)] });
        return;
      }

      if (interaction.commandName === 'prefix') {
        const rawValue = interaction.options.getString('value');
        if (!rawValue) {
          const current = await guildConfigService.getGuildSettings(
            interaction.guildId,
            this.defaultPrefix,
          );
          await interaction.reply({ embeds: [buildPrefixEmbed(this.botName, current.prefix)] });
          return;
        }
        const valid = validatePrefix(rawValue);
        if (!valid) {
          await interaction.reply({
            content:
              `${crossIcon} Prefix không hợp lệ (1–5 ký tự, không có dấu cách, không chứa \`<\`, \`@\` hoặc \`\` \` \`\`).`,
            ephemeral: true,
          });
          return;
        }
        const updated = await guildConfigService.setGuildPrefix(interaction.guildId, valid);
        await interaction.reply({
          embeds: [buildPrefixEmbed(this.botName, updated.prefix, meta.displayName)],
        });
        return;
      }

      if (interaction.commandName === 'channel') {
        const action = interaction.options.getString('action', true);
        const selectedChannel = interaction.options.getChannel('channel');
        const targetChannelId = selectedChannel?.id ?? interaction.channelId;

        if (action === 'allow') {
          const updated = await guildConfigService.allowChannel(
            interaction.guildId,
            targetChannelId,
          );
          await interaction.reply({ embeds: [buildChannelSettingsEmbed(this.botName, updated)] });
          return;
        }
        if (action === 'block') {
          const updated = await guildConfigService.blockChannel(
            interaction.guildId,
            targetChannelId,
          );
          await interaction.reply({ embeds: [buildChannelSettingsEmbed(this.botName, updated)] });
          return;
        }
        if (action === 'reset') {
          const updated = await guildConfigService.resetChannels(interaction.guildId);
          await interaction.reply({ embeds: [buildChannelSettingsEmbed(this.botName, updated)] });
          return;
        }
        const current = await guildConfigService.getGuildSettings(
          interaction.guildId,
          this.defaultPrefix,
        );
        await interaction.reply({ embeds: [buildChannelSettingsEmbed(this.botName, current)] });
        return;
      }
    }

    let activePrefix = this.defaultPrefix;
    if (interaction.guildId) {
      const settings = await guildConfigService.getGuildSettings(
        interaction.guildId,
        this.defaultPrefix,
      );
      activePrefix = settings.prefix;

      if (!settings.enabled) {
        await interaction.reply({
          content: `${crossIcon} Bot hiện đang tạm tắt trong server này bởi Quản trị viên.`,
          ephemeral: true,
        });
        return;
      }
      if (!isChannelAllowed(settings, interaction.channelId)) {
        await interaction.reply({
          content: `${crossIcon} Kênh này không nằm trong danh sách kênh hoạt động của bot.`,
          ephemeral: true,
        });
        return;
      }
    }

    switch (interaction.commandName) {
      case 'p': {
        await interaction.deferReply();
        const result = await encounterService.spawnWildEncounter(meta, interaction.channelId);
        if (!result.ok) {
          if (result.reason === 'CAPTCHA_REQUIRED' && result.captcha) {
            await interaction.editReply({
              embeds: [buildCaptchaEmbed(meta.displayName, result.captcha)],
              components: [buildCaptchaButtonsRow(result.captcha)],
            });
            return;
          }
          if (result.reason === 'SPAWN_IN_FLIGHT') {
            await interaction.editReply(`${timerIcon} Đang xử lý lượt tìm trước đó của bạn...`);
            return;
          }
          if (result.reason === 'COOLDOWN') {
            const sec = ((result.remainingMs ?? 1000) / 1000).toFixed(1);
            await interaction.editReply(`${timerIcon} Bạn đang hồi sức! Chờ **${sec}s** nữa nhé.`);
            return;
          }
          await interaction.editReply(
            `${timerIcon} Bạn đang có một **${result.species?.name ?? 'Pokémon'}** chưa bắt xong! Hãy bấm bóng trên tin nhắn trước đó hoặc đợi hết giờ.`,
          );
          return;
        }
        const displayExpiresAt = new Date(Date.now() + ENCOUNTER_TTL_MS);
        const sentMessage = await interaction.editReply({
          embeds: [
            buildWildEncounterEmbed(
              meta.displayName,
              meta.avatarUrl,
              result.roll,
              displayExpiresAt,
              result.rescueGranted,
            ),
          ],
          components: [buildCatchButtonsRow(result.encounterId, result.ballInventory)],
        });
        this.scheduleEncounterExpiry(
          result.encounterId,
          sentMessage,
          meta.displayName,
          result.roll.species,
          result.roll.isShiny,
        );
        return;
      }

      case 'shop': {
        await interaction.deferReply();
        await trainerService.ensureTrainer(meta);
        const wallet = await trainerService.getShopWallet(meta.userId);
        await interaction.editReply({ embeds: [buildShopEmbed(activePrefix, wallet)] });
        return;
      }

      case 'buy': {
        await interaction.deferReply();
        const rawBall = interaction.options.getString('ball', true);
        const ballId = resolveBallId(rawBall);
        const qty = interaction.options.getInteger('quantity') ?? 1;
        if (!ballId) {
          await interaction.editReply(`${crossIcon} Loại bóng không hợp lệ.`);
          return;
        }
        const bought = await economyService.buyBall(
          meta,
          ballId,
          qty,
          `slash-buy:${interaction.id}`,
        );
        if (!bought.ok) {
          await interaction.editReply(`${crossIcon} ${bought.message}`);
          return;
        }
        await interaction.editReply({
          embeds: [
            buildPurchaseSuccessEmbed(
              meta.displayName,
              bought.ballId,
              bought.quantityBought,
              bought.totalCost,
              bought.newBallQuantity,
              bought.newCoinsBalance,
            ),
          ],
        });
        return;
      }

      case 'bag': {
        await interaction.deferReply();
        await trainerService.ensureTrainer(meta);
        const profile = await trainerService.getTrainerProfile(meta.userId);
        if (!profile) {
          await interaction.editReply(`${crossIcon} Không tìm thấy dữ liệu túi đồ.`);
          return;
        }
        await interaction.editReply({ embeds: [buildBagEmbed(profile, activePrefix)] });
        return;
      }

      case 'dex': {
        await interaction.deferReply();
        await trainerService.ensureTrainer(meta);
        const page = interaction.options.getInteger('page') ?? 1;
        const filter = interaction.options.getString('filter') ?? '';
        const dex = await trainerService.getTrainerDex(meta.userId, page, 10, filter);
        await interaction.editReply({
          embeds: [buildDexEmbed(meta.displayName, dex)],
          components:
            dex.totalPages > 1
              ? [buildDexPaginationRow(meta.userId, dex.filter, dex.page, dex.totalPages)]
              : [],
        });
        return;
      }

      case 'fav': {
        await interaction.deferReply();
        const target = interaction.options.getString('target') ?? undefined;
        const res = await trainerService.toggleFavorite(meta, target);
        if (!res.ok) {
          await interaction.editReply(`${crossIcon} ${res.message}`);
          return;
        }
        const shiny = res.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
        const favIcon = botEmojiRegistry.getFavMention();
        const statusText = res.isFavorite
          ? `${favIcon} Đã thêm vào danh sách Yêu thích (được bảo vệ khỏi \`/release\`).`
          : 'Đã gỡ khỏi danh sách Yêu thích.';
        await interaction.editReply(
          `${statusText}\n└ ${shiny}**${res.speciesName}** (${res.ivPercent}% IV · \`#${res.shortId}\`)`,
        );
        return;
      }

      case 'mega': {
        await interaction.deferReply();
        const pokemonQuery = interaction.options.getString('pokemon')?.trim() ?? '';
        if (!pokemonQuery) {
          await trainerService.ensureTrainer(meta);
          const progress = await megaService.getMegaProgress(meta.userId);
          await interaction.editReply({
            embeds: [buildMegaOverviewEmbed(meta.displayName, progress, activePrefix)],
          });
          return;
        }
        const preview = await megaService.previewMegaEvolution(meta, pokemonQuery);
        if (!preview.ok) {
          await interaction.editReply(`${crossIcon} ${preview.message}`);
          return;
        }
        await interaction.editReply({
          embeds: [buildMegaConfirmEmbed(meta.displayName, preview)],
          components: [buildMegaConfirmRow(meta.userId, preview.megaSpecies.id)],
        });
        return;
      }

      case 'profile': {
        await interaction.deferReply();
        await trainerService.ensureTrainer(meta);
        const profile = await trainerService.getTrainerProfile(meta.userId);
        if (!profile) {
          await interaction.editReply(`${crossIcon} Không tìm thấy hồ sơ huấn luyện viên.`);
          return;
        }
        await interaction.editReply({ embeds: [buildProfileEmbed(profile)] });
        return;
      }

      case 'release': {
        await interaction.deferReply();
        const res = await economyService.releaseDuplicates(meta, `slash-rel:${interaction.id}`);
        await interaction.editReply({ embeds: [buildReleaseEmbed(meta.displayName, res)] });
        return;
      }

      case 'daily': {
        await interaction.deferReply();
        const res = await trainerService.claimDaily(meta, `slash-daily:${interaction.id}`);
        await interaction.editReply({ embeds: [buildDailyEmbed(meta.displayName, res)] });
        return;
      }

      case 'lb': {
        await interaction.deferReply();
        const metric = parseMetric(interaction.options.getString('metric') ?? undefined);
        const entries = await leaderboardService.getLeaderboard(metric, 10);
        await interaction.editReply({ embeds: [buildLeaderboardEmbed(metric, entries)] });
        return;
      }

      case 'help': {
        await interaction.reply({ embeds: [buildHelpEmbed(activePrefix, this.botName)] });
        return;
      }

      case 'quest': {
        await interaction.deferReply();
        const action = interaction.options.getString('action') ?? 'view';
        if (action === 'claim') {
          const claimed = await questService.claimRewards(meta, `slash-quest:${interaction.id}`);
          await interaction.editReply({
            embeds: [buildQuestClaimSuccessEmbed(meta.displayName, claimed)],
          });
          return;
        }
        const summary = await questService.getQuestSummary(meta);
        await interaction.editReply({
          embeds: [buildQuestsEmbed(meta.displayName, summary, activePrefix)],
          components: [buildQuestClaimRow(meta.userId, summary.claimableCount)],
        });
        return;
      }

      case 'buddy': {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'set') {
          const pokemon = interaction.options.getString('pokemon') ?? undefined;
          const res = await evolutionService.setBuddy(meta, pokemon);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildBuddyEmbed(meta.displayName, res.buddy, activePrefix)],
          });
          return;
        }
        if (sub === 'train') {
          const levels = interaction.options.getInteger('levels') ?? 1;
          const res = await evolutionService.trainBuddy(meta, levels, `slash-train:${interaction.id}`);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({ embeds: [buildBuddyTrainEmbed(meta.displayName, res)] });
          return;
        }
        await trainerService.ensureTrainer(meta);
        const buddy = await evolutionService.getBuddyView(meta.userId);
        await interaction.editReply({
          embeds: [buildBuddyEmbed(meta.displayName, buddy, activePrefix)],
        });
        return;
      }

      case 'evolve': {
        await interaction.deferReply();
        const pokemon = interaction.options.getString('pokemon')?.trim() ?? '';
        if (!pokemon) {
          await trainerService.ensureTrainer(meta);
          const candidates = await evolutionService.getEvolutionCandidates(meta.userId);
          await interaction.editReply({
            embeds: [buildEvolutionCandidatesEmbed(meta.displayName, candidates, activePrefix)],
          });
          return;
        }
        const into = interaction.options.getString('into') ?? undefined;
        const res = await evolutionService.evolveCreature(
          meta,
          pokemon,
          into,
          `slash-evo:${interaction.id}`,
        );
        if (!res.ok) {
          await interaction.editReply(buildErrorNotice(res.message));
          return;
        }
        await interaction.editReply({ embeds: [buildEvolutionSuccessEmbed(meta.displayName, res)] });
        return;
      }

      case 'f': {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'shop') {
          const gear = await fishingService.getFishingGear(meta);
          await interaction.editReply({ embeds: [buildFishingShopEmbed(gear, activePrefix)] });
          return;
        }
        if (sub === 'buy') {
          const item = interaction.options.getString('item', true);
          const qty = interaction.options.getInteger('quantity') ?? 1;
          const res = await fishingService.buyFishingItem(
            meta,
            item,
            qty,
            `slash-fbuy:${interaction.id}`,
          );
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({ embeds: [buildBuyFishingItemEmbed(meta.displayName, res)] });
          return;
        }
        const cast = await fishingService.castRod(meta, interaction.channelId);
        if (!cast.ok) {
          if (cast.reason === 'CAPTCHA_REQUIRED' && cast.captcha) {
            await interaction.editReply({
              embeds: [buildCaptchaEmbed(meta.displayName, cast.captcha)],
              components: [buildCaptchaButtonsRow(cast.captcha)],
            });
            return;
          }
          if (cast.reason === 'COOLDOWN') {
            const sec = ((cast.remainingMs ?? 1000) / 1000).toFixed(1);
            await interaction.editReply(`${timerIcon} Bạn vừa mới thả cần! Chờ **${sec}s** nữa nhé.`);
            return;
          }
          await interaction.editReply(`${timerIcon} Bạn đang có một lượt câu cá chưa giật cần xong!`);
          return;
        }
        const sentMessage = await interaction.editReply({
          embeds: [buildFishingCastingEmbed(meta.displayName, meta.avatarUrl, cast)],
          components: [buildFishingPullRow(cast.encounterId)],
        });
        this.scheduleFishingExpiry(
          cast.encounterId,
          sentMessage,
          meta.displayName,
          FISHING_BITE_TTL_MS,
        );
        return;
      }

      case 'market': {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'sell') {
          const pokemon = interaction.options.getString('pokemon', true);
          const price = interaction.options.getInteger('price', true);
          const res = await marketService.listCreature(meta, pokemon, price);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildMarketListSuccessEmbed(meta.displayName, res.listing)],
          });
          return;
        }
        if (sub === 'buy') {
          const listingNo = interaction.options.getInteger('id', true);
          const preview = await marketService.getListingPreview(listingNo);
          if (!preview) {
            await interaction.editReply(
              buildErrorNotice(`Không tìm thấy đơn hàng chợ \`#${listingNo}\` đang mở bán.`),
            );
            return;
          }
          if (preview.sellerId === meta.userId) {
            await interaction.editReply(
              buildErrorNotice(`Đây là Pokémon của bạn. Dùng \`/market cancel ${listingNo}\` để gỡ xuống.`),
            );
            return;
          }
          await interaction.editReply({
            embeds: [buildMarketBuyConfirmEmbed(meta.displayName, preview)],
            components: [buildMarketBuyConfirmRow(meta.userId, listingNo)],
          });
          return;
        }
        if (sub === 'cancel') {
          const listingNo = interaction.options.getInteger('id', true);
          const res = await marketService.cancelListing(meta, listingNo);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply(
            `${botEmojiRegistry.getCheckMention()} Đã gỡ đơn hàng \`#${listingNo}\` (**${res.listing.speciesName}**) khỏi chợ.`,
          );
          return;
        }
        const filter = interaction.options.getString('filter') ?? '';
        const page = interaction.options.getInteger('page') ?? 1;
        const browse = await marketService.browseMarket(page, filter);
        await interaction.editReply({
          embeds: [buildMarketBrowseEmbed(browse, activePrefix)],
          components:
            browse.totalPages > 1
              ? [buildMarketPaginationRow(meta.userId, browse.filter, browse.page, browse.totalPages)]
              : [],
        });
        return;
      }

      case 'trade': {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'start') {
          const targetUser = interaction.options.getUser('user', true);
          if (targetUser.bot) {
            await interaction.editReply(buildErrorNotice('Không thể giao dịch với tài khoản Bot!'));
            return;
          }
          const pokemon = interaction.options.getString('pokemon') ?? undefined;
          const coins = interaction.options.getInteger('coins') ?? 0;
          const res = await marketService.startTrade(
            meta,
            extractTrainerMeta(targetUser),
            pokemon,
            coins,
          );
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildTradeEmbed(res.trade, activePrefix)],
            components: [buildTradeButtonsRow(res.trade)],
          });
          return;
        }
        if (sub === 'offer') {
          const pokemon = interaction.options.getString('pokemon') ?? undefined;
          const coins = interaction.options.getInteger('coins') ?? 0;
          const res = await marketService.setTradeOffer(meta, pokemon, coins);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildTradeEmbed(res.trade, activePrefix)],
            components: [buildTradeButtonsRow(res.trade)],
          });
          return;
        }
        if (sub === 'confirm') {
          const res = await marketService.confirmTrade(meta, undefined, `slash-tr:${interaction.id}`);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildTradeEmbed(res.trade, activePrefix)],
            components: res.trade.status === 'PENDING' ? [buildTradeButtonsRow(res.trade)] : [],
          });
          return;
        }
        if (sub === 'cancel') {
          const res = await marketService.cancelTrade(meta.userId);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildTradeEmbed(res.trade, activePrefix)],
            components: [],
          });
          return;
        }
        const active = await marketService.getActiveTrade(meta.userId);
        if (!active) {
          await interaction.editReply('Bạn hiện không có phiên giao dịch nào đang mở.');
          return;
        }
        await interaction.editReply({
          embeds: [buildTradeEmbed(active, activePrefix)],
          components: [buildTradeButtonsRow(active)],
        });
        return;
      }

      case 'battle': {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'list') {
          await trainerService.ensureTrainer(meta);
          const profile = await trainerService.getTrainerProfile(meta.userId);
          const gyms = battleService.getGymOverview(profile?.gymBadges ?? []);
          await interaction.editReply({
            embeds: [buildGymListEmbed(meta.displayName, gyms, activePrefix)],
          });
          return;
        }
        if (sub === 'gym') {
          const stage = interaction.options.getInteger('stage') ?? undefined;
          const res = await battleService.startGym(meta, stage);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildBattleEmbed(res.battle)],
            components: buildBattleActionRows(res.battle),
          });
          return;
        }
        if (sub === 'pvp') {
          const targetUser = interaction.options.getUser('user', true);
          if (targetUser.bot) {
            await interaction.editReply(buildErrorNotice('Không thể thách đấu PvP với Bot! Hãy dùng `/battle pve` hoặc `/battle gym`.'));
            return;
          }
          const res = await battleService.challengePvp(meta, extractTrainerMeta(targetUser));
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            content: `<@${targetUser.id}>`,
            embeds: [buildBattleEmbed(res.battle)],
            components: buildBattleActionRows(res.battle),
          });
          return;
        }
        const res = await battleService.startPve(meta);
        if (!res.ok) {
          await interaction.editReply(buildErrorNotice(res.message));
          return;
        }
        await interaction.editReply({
          embeds: [buildBattleEmbed(res.battle)],
          components: buildBattleActionRows(res.battle),
        });
        return;
      }

      case 'verify': {
        await interaction.deferReply();
        await trainerService.ensureTrainer(meta);
        const rawAnswer = interaction.options.getString('answer')?.trim();
        if (!rawAnswer) {
          const active = await captchaService.getActiveChallenge(meta.userId);
          if (!active) {
            await interaction.editReply('Bạn hiện không có yêu cầu xác minh nào.');
            return;
          }
          await interaction.editReply({
            embeds: [buildCaptchaEmbed(meta.displayName, active)],
            components: [buildCaptchaButtonsRow(active)],
          });
          return;
        }
        const res = await captchaService.verifyChallenge(
          meta,
          rawAnswer,
          `slash-cap:${interaction.id}`,
        );
        if (!res.ok) {
          await interaction.editReply(buildErrorNotice(res.message));
          return;
        }
        if (res.correct) {
          await interaction.editReply({ embeds: [buildCaptchaSuccessEmbed(meta.displayName, res)] });
          return;
        }
        await interaction.editReply({
          content: res.penaltyUntil
            ? `${crossIcon} Sai 3 lần! Tài khoản bị tạm khóa 5 phút trước khi thử lại.`
            : `${crossIcon} Chưa chính xác! Bạn còn **${res.remainingAttempts}** lần thử.`,
          embeds: [buildCaptchaEmbed(meta.displayName, res.updatedChallenge)],
          components: [buildCaptchaButtonsRow(res.updatedChallenge)],
        });
        return;
      }
    }
  }

  public async handlePrefixMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.guild) {
      return;
    }

    const settings = await guildConfigService.getGuildSettings(
      message.guild.id,
      this.defaultPrefix,
    );

    const body = this.extractPrefixedBody(
      message.content,
      settings.prefix,
      message.client.user?.id,
    );
    if (!body) {
      return;
    }

    if (!canReplyInMessageChannel(message)) {
      return;
    }

    const parts = body.split(/\s+/);
    const command = parts[0]?.toLowerCase() ?? '';
    const arg1 = parts[1];
    const arg2 = parts[2];
    const meta = extractTrainerMeta(message.author);
    const crossIcon = botEmojiRegistry.getCrossMention();
    const timerIcon = botEmojiRegistry.getTimerMention();

    if (ADMIN_PREFIX_COMMANDS.has(command)) {
      if (!this.isAdminOrOwner(message.author.id, message.member?.permissions)) {
        await message.reply(
          `${crossIcon} Chỉ Quản trị viên (Admin / Manage Server) mới có quyền dùng lệnh cấu hình này.`,
        );
        return;
      }

      if (command === 'bot') {
        const sub = arg1?.toLowerCase() ?? 'status';
        if (sub === 'on' || sub === 'enable') {
          const nextState = await guildConfigService.setGuildEnabled(
            message.guild.id,
            true,
            meta.displayName,
          );
          await message.reply({
            embeds: [buildBotStatusEmbed(this.botName, nextState, meta.displayName)],
          });
          return;
        }
        if (sub === 'off' || sub === 'disable') {
          const nextState = await guildConfigService.setGuildEnabled(
            message.guild.id,
            false,
            meta.displayName,
          );
          await message.reply({
            embeds: [buildBotStatusEmbed(this.botName, nextState, meta.displayName)],
          });
          return;
        }
        await message.reply({ embeds: [buildBotStatusEmbed(this.botName, settings)] });
        return;
      }

      if (command === 'prefix') {
        if (!arg1) {
          await message.reply({ embeds: [buildPrefixEmbed(this.botName, settings.prefix)] });
          return;
        }
        const valid = validatePrefix(arg1);
        if (!valid) {
          await message.reply(
            `${crossIcon} Prefix không hợp lệ (1–5 ký tự, không có dấu cách, không chứa \`<\`, \`@\` hoặc \`\` \` \`\`).`,
          );
          return;
        }
        const updated = await guildConfigService.setGuildPrefix(message.guild.id, valid);
        await message.reply({
          embeds: [buildPrefixEmbed(this.botName, updated.prefix, meta.displayName)],
        });
        return;
      }

      if (command === 'channel') {
        const sub = arg1?.toLowerCase() ?? 'list';
        const targetId = parseChannelMentionId(arg2, message.channelId);

        if (sub === 'allow') {
          if (!targetId) {
            await message.reply(`${crossIcon} Kênh không hợp lệ. Ví dụ: \`channel allow #pokenyan\``);
            return;
          }
          const updated = await guildConfigService.allowChannel(message.guild.id, targetId);
          await message.reply({ embeds: [buildChannelSettingsEmbed(this.botName, updated)] });
          return;
        }
        if (sub === 'block') {
          if (!targetId) {
            await message.reply(`${crossIcon} Kênh không hợp lệ. Ví dụ: \`channel block #general\``);
            return;
          }
          const updated = await guildConfigService.blockChannel(message.guild.id, targetId);
          await message.reply({ embeds: [buildChannelSettingsEmbed(this.botName, updated)] });
          return;
        }
        if (sub === 'reset') {
          const updated = await guildConfigService.resetChannels(message.guild.id);
          await message.reply({ embeds: [buildChannelSettingsEmbed(this.botName, updated)] });
          return;
        }
        await message.reply({ embeds: [buildChannelSettingsEmbed(this.botName, settings)] });
        return;
      }
    }

    if (!settings.enabled || !isChannelAllowed(settings, message.channelId)) {
      return;
    }

    switch (command) {
      case 'p':
      case 'pokemon': {
        const result = await encounterService.spawnWildEncounter(meta, message.channelId);
        if (!result.ok) {
          if (result.reason === 'CAPTCHA_REQUIRED' && result.captcha) {
            await message.reply({
              embeds: [buildCaptchaEmbed(meta.displayName, result.captcha)],
              components: [buildCaptchaButtonsRow(result.captcha)],
            });
            return;
          }
          if (result.reason === 'SPAWN_IN_FLIGHT') {
            return;
          }
          if (result.reason === 'COOLDOWN') {
            const sec = ((result.remainingMs ?? 1000) / 1000).toFixed(1);
            await message.reply(`${timerIcon} Bạn đang hồi sức! Chờ **${sec}s** nữa nhé.`);
            return;
          }
          await message.reply(
            `${timerIcon} Bạn đang có một **${result.species?.name ?? 'Pokémon'}** chưa bắt xong! Hãy bấm bóng hoặc đợi hết giờ.`,
          );
          return;
        }
        const displayExpiresAt = new Date(Date.now() + ENCOUNTER_TTL_MS);
        const sentMessage = await message.reply({
          embeds: [
            buildWildEncounterEmbed(
              meta.displayName,
              meta.avatarUrl,
              result.roll,
              displayExpiresAt,
              result.rescueGranted,
            ),
          ],
          components: [buildCatchButtonsRow(result.encounterId, result.ballInventory)],
        });
        this.scheduleEncounterExpiry(
          result.encounterId,
          sentMessage,
          meta.displayName,
          result.roll.species,
          result.roll.isShiny,
        );
        return;
      }

      case 's':
      case 'shop': {
        const sub = arg1?.toLowerCase();
        if (sub === 'b' || sub === 'buy') {
          await this.executePrefixBuy(message, meta, settings.prefix, arg2, parts[3]);
          return;
        }
        await trainerService.ensureTrainer(meta);
        const wallet = await trainerService.getShopWallet(meta.userId);
        await message.reply({ embeds: [buildShopEmbed(settings.prefix, wallet)] });
        return;
      }

      case 'b':
      case 'buy': {
        await this.executePrefixBuy(message, meta, settings.prefix, arg1, arg2);
        return;
      }

      case 'i':
      case 'inv':
      case 'bag':
      case 'bal':
      case 'coins':
      case 'money': {
        await trainerService.ensureTrainer(meta);
        const profile = await trainerService.getTrainerProfile(meta.userId);
        if (!profile) {
          return;
        }
        await message.reply({ embeds: [buildBagEmbed(profile, settings.prefix)] });
        return;
      }

      case 'd':
      case 'dex':
      case 'pokedex': {
        await trainerService.ensureTrainer(meta);
        let page = 1;
        let filter = '';
        if (arg1) {
          if (/^\d+$/.test(arg1)) {
            page = Math.max(1, Number.parseInt(arg1, 10));
            filter = parts.slice(2).join(' ');
          } else {
            filter = arg1;
            const maybePage = arg2 && /^\d+$/.test(arg2) ? Number.parseInt(arg2, 10) : 1;
            page = Math.max(1, maybePage);
          }
        }
        const dex = await trainerService.getTrainerDex(meta.userId, page, 10, filter);
        await message.reply({
          embeds: [buildDexEmbed(meta.displayName, dex)],
          components:
            dex.totalPages > 1
              ? [buildDexPaginationRow(meta.userId, dex.filter, dex.page, dex.totalPages)]
              : [],
        });
        return;
      }

      case 'fav':
      case 'favorite': {
        const target = parts.slice(1).join(' ') || undefined;
        const res = await trainerService.toggleFavorite(meta, target);
        if (!res.ok) {
          await message.reply(`${crossIcon} ${res.message}`);
          return;
        }
        const shiny = res.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
        const favIcon = botEmojiRegistry.getFavMention();
        const statusText = res.isFavorite
          ? `${favIcon} Đã thêm vào danh sách Yêu thích (bảo vệ khỏi \`release\`).`
          : 'Đã gỡ khỏi danh sách Yêu thích.';
        await message.reply(
          `${statusText}\n└ ${shiny}**${res.speciesName}** (${res.ivPercent}% IV · \`#${res.shortId}\`)`,
        );
        return;
      }

      case 'f':
      case 'fish': {
        const sub = arg1?.toLowerCase();
        if (sub === 'shop' || sub === 's') {
          const gear = await fishingService.getFishingGear(meta);
          await message.reply({ embeds: [buildFishingShopEmbed(gear, settings.prefix)] });
          return;
        }
        if (sub === 'buy' || sub === 'b') {
          if (!arg2) {
            await message.reply(
              `Cách dùng: \`${settings.prefix}f buy <mã> [số_lượng]\` (vd: \`${settings.prefix}f buy good\`, \`${settings.prefix}f buy lure 5\`).`,
            );
            return;
          }
          const qty = parts[3] ? Number.parseInt(parts[3], 10) : 1;
          const res = await fishingService.buyFishingItem(
            meta,
            arg2,
            Number.isNaN(qty) ? 0 : qty,
            `msg-fbuy:${message.id}`,
          );
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({ embeds: [buildBuyFishingItemEmbed(meta.displayName, res)] });
          return;
        }
        const cast = await fishingService.castRod(meta, message.channelId);
        if (!cast.ok) {
          if (cast.reason === 'CAPTCHA_REQUIRED' && cast.captcha) {
            await message.reply({
              embeds: [buildCaptchaEmbed(meta.displayName, cast.captcha)],
              components: [buildCaptchaButtonsRow(cast.captcha)],
            });
            return;
          }
          if (cast.reason === 'COOLDOWN') {
            const sec = ((cast.remainingMs ?? 1000) / 1000).toFixed(1);
            await message.reply(`${timerIcon} Bạn vừa mới thả cần! Chờ **${sec}s** nữa nhé.`);
            return;
          }
          await message.reply(`${timerIcon} Bạn đang có một lượt câu cá chưa giật cần xong!`);
          return;
        }
        const sentMessage = await message.reply({
          embeds: [buildFishingCastingEmbed(meta.displayName, meta.avatarUrl, cast)],
          components: [buildFishingPullRow(cast.encounterId)],
        });
        this.scheduleFishingExpiry(
          cast.encounterId,
          sentMessage,
          meta.displayName,
          FISHING_BITE_TTL_MS,
        );
        return;
      }

      case 'q':
      case 'quest':
      case 'quests': {
        const sub = arg1?.toLowerCase();
        if (sub === 'claim' || sub === 'c') {
          const claimed = await questService.claimRewards(meta, `msg-quest:${message.id}`);
          await message.reply({ embeds: [buildQuestClaimSuccessEmbed(meta.displayName, claimed)] });
          return;
        }
        const summary = await questService.getQuestSummary(meta);
        await message.reply({
          embeds: [buildQuestsEmbed(meta.displayName, summary, settings.prefix)],
          components: [buildQuestClaimRow(meta.userId, summary.claimableCount)],
        });
        return;
      }

      case 'bd':
      case 'buddy': {
        const sub = arg1?.toLowerCase();
        if (sub === 'set') {
          const query = parts.slice(2).join(' ') || undefined;
          const res = await evolutionService.setBuddy(meta, query);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildBuddyEmbed(meta.displayName, res.buddy, settings.prefix)],
          });
          return;
        }
        if (sub === 'train') {
          const levels = arg2 ? Number.parseInt(arg2, 10) : 1;
          const res = await evolutionService.trainBuddy(
            meta,
            Number.isNaN(levels) ? 1 : levels,
            `msg-train:${message.id}`,
          );
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({ embeds: [buildBuddyTrainEmbed(meta.displayName, res)] });
          return;
        }
        await trainerService.ensureTrainer(meta);
        const buddy = await evolutionService.getBuddyView(meta.userId);
        await message.reply({ embeds: [buildBuddyEmbed(meta.displayName, buddy, settings.prefix)] });
        return;
      }

      case 'ev':
      case 'evo':
      case 'evolve': {
        const rest = parts.slice(1);
        if (rest.length === 0) {
          await trainerService.ensureTrainer(meta);
          const candidates = await evolutionService.getEvolutionCandidates(meta.userId);
          await message.reply({
            embeds: [buildEvolutionCandidatesEmbed(meta.displayName, candidates, settings.prefix)],
          });
          return;
        }
        const targetQuery = rest[0]!;
        const intoQuery = rest.slice(1).join(' ') || undefined;
        const res = await evolutionService.evolveCreature(
          meta,
          targetQuery,
          intoQuery,
          `msg-evo:${message.id}`,
        );
        if (!res.ok) {
          await message.reply(buildErrorNotice(res.message));
          return;
        }
        await message.reply({ embeds: [buildEvolutionSuccessEmbed(meta.displayName, res)] });
        return;
      }

      case 'mk':
      case 'market': {
        const sub = arg1?.toLowerCase() ?? 'browse';
        if (sub === 'sell' || sub === 's') {
          const rawPrice = parts[parts.length - 1];
          const price = rawPrice && /^\d+$/.test(rawPrice) ? Number.parseInt(rawPrice, 10) : 0;
          const pokemon = parts.slice(2, parts.length - 1).join(' ');
          if (!pokemon || !price) {
            await message.reply(
              `Cách dùng: \`${settings.prefix}mk sell <tên|#mã> <giá_pc>\` (vd: \`${settings.prefix}mk sell Pikachu 5000\`).`,
            );
            return;
          }
          const res = await marketService.listCreature(meta, pokemon, price);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildMarketListSuccessEmbed(meta.displayName, res.listing)],
          });
          return;
        }
        if (sub === 'buy' || sub === 'b') {
          const listingNo = Number.parseInt((arg2 ?? '').replace(/^#/, ''), 10);
          const preview = await marketService.getListingPreview(listingNo);
          if (!preview) {
            await message.reply(buildErrorNotice(`Không tìm thấy đơn hàng chợ \`#${arg2 ?? '?'}\`.`));
            return;
          }
          if (preview.sellerId === meta.userId) {
            await message.reply(
              buildErrorNotice(`Đây là Pokémon của bạn. Dùng \`${settings.prefix}mk cancel ${listingNo}\` để gỡ.`),
            );
            return;
          }
          await message.reply({
            embeds: [buildMarketBuyConfirmEmbed(meta.displayName, preview)],
            components: [buildMarketBuyConfirmRow(meta.userId, listingNo)],
          });
          return;
        }
        if (sub === 'cancel' || sub === 'c') {
          const listingNo = Number.parseInt((arg2 ?? '').replace(/^#/, ''), 10);
          const res = await marketService.cancelListing(meta, listingNo);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply(
            `${botEmojiRegistry.getCheckMention()} Đã gỡ đơn hàng \`#${listingNo}\` (**${res.listing.speciesName}**) khỏi chợ.`,
          );
          return;
        }
        const filter = sub === 'browse' ? parts.slice(2).join(' ') : parts.slice(1).join(' ');
        const browse = await marketService.browseMarket(1, filter);
        await message.reply({
          embeds: [buildMarketBrowseEmbed(browse, settings.prefix)],
          components:
            browse.totalPages > 1
              ? [buildMarketPaginationRow(meta.userId, browse.filter, browse.page, browse.totalPages)]
              : [],
        });
        return;
      }

      case 'tr':
      case 'trade': {
        const sub = arg1?.toLowerCase() ?? 'view';
        if (sub === 'start' || parseUserMentionId(arg1)) {
          const userArg = sub === 'start' ? arg2 : arg1;
          const targetId = parseUserMentionId(userArg);
          if (!targetId) {
            await message.reply(
              `Cách dùng: \`${settings.prefix}tr start @người_chơi [tên_pokemon] [coins]\``,
            );
            return;
          }
          const targetUser = await message.client.users.fetch(targetId).catch(() => null);
          if (!targetUser || targetUser.bot) {
            await message.reply(buildErrorNotice('Không tìm thấy người chơi hợp lệ để giao dịch!'));
            return;
          }
          const offset = sub === 'start' ? 3 : 2;
          const tail = parts.slice(offset);
          let coins = 0;
          if (tail.length > 0 && /^\d+$/.test(tail[tail.length - 1]!)) {
            coins = Number.parseInt(tail.pop()!, 10);
          }
          const pokemon = tail.join(' ') || undefined;
          const res = await marketService.startTrade(
            meta,
            extractTrainerMeta(targetUser),
            pokemon,
            coins,
          );
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildTradeEmbed(res.trade, settings.prefix)],
            components: [buildTradeButtonsRow(res.trade)],
          });
          return;
        }
        if (sub === 'offer') {
          const tail = parts.slice(2);
          let coins = 0;
          if (tail.length > 0 && /^\d+$/.test(tail[tail.length - 1]!)) {
            coins = Number.parseInt(tail.pop()!, 10);
          }
          const pokemon = tail.join(' ') || undefined;
          const res = await marketService.setTradeOffer(meta, pokemon, coins);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildTradeEmbed(res.trade, settings.prefix)],
            components: [buildTradeButtonsRow(res.trade)],
          });
          return;
        }
        if (sub === 'confirm') {
          const res = await marketService.confirmTrade(meta, undefined, `msg-tr:${message.id}`);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildTradeEmbed(res.trade, settings.prefix)],
            components: res.trade.status === 'PENDING' ? [buildTradeButtonsRow(res.trade)] : [],
          });
          return;
        }
        if (sub === 'cancel') {
          const res = await marketService.cancelTrade(meta.userId);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildTradeEmbed(res.trade, settings.prefix)],
            components: [],
          });
          return;
        }
        const active = await marketService.getActiveTrade(meta.userId);
        if (!active) {
          await message.reply(
            `Bạn hiện chưa mở phiên giao dịch nào. Dùng \`${settings.prefix}tr start @người_chơi\` để bắt đầu!`,
          );
          return;
        }
        await message.reply({
          embeds: [buildTradeEmbed(active, settings.prefix)],
          components: [buildTradeButtonsRow(active)],
        });
        return;
      }

      case 'bt':
      case 'battle':
      case 'gym': {
        const isGymCmd = command === 'gym';
        const sub = isGymCmd ? 'gym' : (arg1?.toLowerCase() ?? 'pve');
        const gymArg = isGymCmd ? arg1 : arg2;

        if (sub === 'list' || sub === 'gyms') {
          await trainerService.ensureTrainer(meta);
          const profile = await trainerService.getTrainerProfile(meta.userId);
          const gyms = battleService.getGymOverview(profile?.gymBadges ?? []);
          await message.reply({
            embeds: [buildGymListEmbed(meta.displayName, gyms, settings.prefix)],
          });
          return;
        }
        if (sub === 'gym') {
          const stage =
            gymArg && /^\d+$/.test(gymArg) ? Number.parseInt(gymArg, 10) : undefined;
          const res = await battleService.startGym(meta, stage);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildBattleEmbed(res.battle)],
            components: buildBattleActionRows(res.battle),
          });
          return;
        }
        const mentionTargetId = parseUserMentionId(sub === 'pvp' ? arg2 : arg1);
        if (sub === 'pvp' || mentionTargetId) {
          if (!mentionTargetId) {
            await message.reply(
              `Cách dùng: \`${settings.prefix}bt pvp @đối_thủ\``,
            );
            return;
          }
          const targetUser = await message.client.users.fetch(mentionTargetId).catch(() => null);
          if (!targetUser || targetUser.bot) {
            await message.reply(buildErrorNotice('Không tìm thấy đối thủ hợp lệ để thách đấu PvP!'));
            return;
          }
          const res = await battleService.challengePvp(meta, extractTrainerMeta(targetUser));
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            content: `<@${targetUser.id}>`,
            embeds: [buildBattleEmbed(res.battle)],
            components: buildBattleActionRows(res.battle),
          });
          return;
        }
        const res = await battleService.startPve(meta);
        if (!res.ok) {
          await message.reply(buildErrorNotice(res.message));
          return;
        }
        await message.reply({
          embeds: [buildBattleEmbed(res.battle)],
          components: buildBattleActionRows(res.battle),
        });
        return;
      }

      case 'verify':
      case 'captcha': {
        await trainerService.ensureTrainer(meta);
        const answer = parts.slice(1).join(' ').trim();
        if (!answer) {
          const active = await captchaService.getActiveChallenge(meta.userId);
          if (!active) {
            await message.reply('Bạn hiện không có yêu cầu xác minh nào.');
            return;
          }
          await message.reply({
            embeds: [buildCaptchaEmbed(meta.displayName, active)],
            components: [buildCaptchaButtonsRow(active)],
          });
          return;
        }
        const res = await captchaService.verifyChallenge(meta, answer, `msg-cap:${message.id}`);
        if (!res.ok) {
          await message.reply(buildErrorNotice(res.message));
          return;
        }
        if (res.correct) {
          await message.reply({ embeds: [buildCaptchaSuccessEmbed(meta.displayName, res)] });
          return;
        }
        await message.reply({
          content: res.penaltyUntil
            ? `${crossIcon} Sai 3 lần! Tài khoản bị tạm khóa 5 phút trước khi thử lại.`
            : `${crossIcon} Chưa chính xác! Bạn còn **${res.remainingAttempts}** lần thử.`,
          embeds: [buildCaptchaEmbed(meta.displayName, res.updatedChallenge)],
          components: [buildCaptchaButtonsRow(res.updatedChallenge)],
        });
        return;
      }

      case 'm':
      case 'mega': {
        const query = parts.slice(1).join(' ').trim();
        if (!query) {
          await trainerService.ensureTrainer(meta);
          const progress = await megaService.getMegaProgress(meta.userId);
          await message.reply({
            embeds: [buildMegaOverviewEmbed(meta.displayName, progress, settings.prefix)],
          });
          return;
        }
        const preview = await megaService.previewMegaEvolution(meta, query);
        if (!preview.ok) {
          await message.reply(`${crossIcon} ${preview.message}`);
          return;
        }
        await message.reply({
          embeds: [buildMegaConfirmEmbed(meta.displayName, preview)],
          components: [buildMegaConfirmRow(meta.userId, preview.megaSpecies.id)],
        });
        return;
      }

      case 'pf':
      case 'profile':
      case 'stats': {
        await trainerService.ensureTrainer(meta);
        const profile = await trainerService.getTrainerProfile(meta.userId);
        if (!profile) {
          return;
        }
        await message.reply({ embeds: [buildProfileEmbed(profile)] });
        return;
      }

      case 'r':
      case 'rel':
      case 'release': {
        const res = await economyService.releaseDuplicates(meta, `msg-rel:${message.id}`);
        await message.reply({ embeds: [buildReleaseEmbed(meta.displayName, res)] });
        return;
      }

      case 'dl':
      case 'daily': {
        const res = await trainerService.claimDaily(meta, `msg-daily:${message.id}`);
        await message.reply({ embeds: [buildDailyEmbed(meta.displayName, res)] });
        return;
      }

      case 'lb':
      case 'top':
      case 'leaderboard': {
        const metric = parseMetric(arg1);
        const entries = await leaderboardService.getLeaderboard(metric, 10);
        await message.reply({ embeds: [buildLeaderboardEmbed(metric, entries)] });
        return;
      }

      case 'help':
      case 'h': {
        await message.reply({ embeds: [buildHelpEmbed(settings.prefix, this.botName)] });
        return;
      }
    }
  }

  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const crossIcon = botEmojiRegistry.getCrossMention();
    const timerIcon = botEmojiRegistry.getTimerMention();

    if (interaction.customId.startsWith('mega:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const action = parts[1];
      const ownerId = parts[2];

      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Bạn không thể thao tác nghi thức Mega của huấn luyện viên khác!`,
          ephemeral: true,
        });
        return;
      }

      if (action === 'cancel') {
        await interaction.editReply({
          content: 'Đã hủy nghi thức thức tỉnh Mega.',
          embeds: [],
          components: [],
        });
        return;
      }

      if (action === 'confirm') {
        const megaSpeciesId = Number.parseInt(parts[3] ?? '0', 10);
        const meta = extractTrainerMeta(interaction.user);
        const res = await megaService.executeMegaEvolution(
          meta,
          megaSpeciesId,
          `mega:${interaction.id}`,
        );
        if (!res.ok) {
          await interaction.followUp({
            content: `${crossIcon} ${res.message}`,
            ephemeral: true,
          });
          return;
        }
        await interaction.editReply({
          embeds: [buildMegaSuccessEmbed(meta.displayName, res)],
          components: [],
        });
      }
      return;
    }

    if (interaction.customId.startsWith('dex:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const ownerId = parts[1];
      const targetPage = Number.parseInt(parts[2] ?? '1', 10);
      const filter = decodeURIComponent(parts[3] ?? '');

      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Bạn không thể lật trang Pokédex của huấn luyện viên khác!`,
          ephemeral: true,
        });
        return;
      }

      const meta = extractTrainerMeta(interaction.user);
      const dex = await trainerService.getTrainerDex(
        ownerId,
        Number.isNaN(targetPage) ? 1 : targetPage,
        10,
        filter,
      );
      await interaction.editReply({
        embeds: [buildDexEmbed(meta.displayName, dex)],
        components:
          dex.totalPages > 1
            ? [buildDexPaginationRow(ownerId, dex.filter, dex.page, dex.totalPages)]
            : [],
      });
      return;
    }

    if (interaction.customId.startsWith('captcha:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const ownerId = parts[2];
      const optIdx = parts[3] ?? '';
      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Bạn không thể bấm xác minh thay người chơi khác!`,
          ephemeral: true,
        });
        return;
      }
      const meta = extractTrainerMeta(interaction.user);
      const res = await captchaService.verifyChallenge(meta, optIdx, `btn-cap:${interaction.id}`);
      if (!res.ok) {
        await interaction.followUp({ content: buildErrorNotice(res.message), ephemeral: true });
        return;
      }
      if (res.correct) {
        await interaction.editReply({
          embeds: [buildCaptchaSuccessEmbed(meta.displayName, res)],
          components: [],
        });
        return;
      }
      await interaction.editReply({
        content: res.penaltyUntil
          ? `${crossIcon} Sai 3 lần! Tài khoản tạm khóa 5 phút trước khi thử lại.`
          : `${crossIcon} Sai rồi! Còn **${res.remainingAttempts}** lần thử.`,
        embeds: [buildCaptchaEmbed(meta.displayName, res.updatedChallenge)],
        components: [buildCaptchaButtonsRow(res.updatedChallenge)],
      });
      return;
    }

    if (interaction.customId.startsWith('quest:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const ownerId = parts[2];
      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Bạn không thể nhận thưởng nhiệm vụ của người chơi khác!`,
          ephemeral: true,
        });
        return;
      }
      const meta = extractTrainerMeta(interaction.user);
      const claimed = await questService.claimRewards(meta, `btn-quest:${interaction.id}`);
      await interaction.editReply({
        embeds: [buildQuestClaimSuccessEmbed(meta.displayName, claimed)],
        components: [],
      });
      return;
    }

    if (interaction.customId.startsWith('fish:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const encounterId = parts[2];
      if (!encounterId) {
        return;
      }
      const meta = extractTrainerMeta(interaction.user);
      const pull = await fishingService.pullHook(encounterId, interaction.user.id);
      if (!pull.ok) {
        await interaction.followUp({ content: `${timerIcon} ${pull.message}`, ephemeral: true });
        return;
      }
      const sent = await interaction.editReply({
        embeds: [buildFishingBiteEmbed(meta.displayName, pull)],
        components: [buildCatchButtonsRow(encounterId, pull.ballInventory, false, 'fishcatch')],
      });
      this.scheduleFishingExpiry(
        encounterId,
        sent,
        meta.displayName,
        FISHING_CATCH_TTL_MS,
      );
      return;
    }

    if (interaction.customId.startsWith('mk:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const action = parts[1];
      const ownerId = parts[2];
      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Thao tác chợ này không dành cho bạn!`,
          ephemeral: true,
        });
        return;
      }
      const meta = extractTrainerMeta(interaction.user);
      if (action === 'abort') {
        await interaction.editReply({
          content: 'Đã hủy mua hàng trên chợ.',
          embeds: [],
          components: [],
        });
        return;
      }
      if (action === 'page') {
        const targetPage = Number.parseInt(parts[3] ?? '1', 10);
        const filter = decodeURIComponent(parts[4] ?? '');
        const browse = await marketService.browseMarket(
          Number.isNaN(targetPage) ? 1 : targetPage,
          filter,
        );
        await interaction.editReply({
          embeds: [buildMarketBrowseEmbed(browse, this.defaultPrefix)],
          components:
            browse.totalPages > 1
              ? [buildMarketPaginationRow(ownerId, browse.filter, browse.page, browse.totalPages)]
              : [],
        });
        return;
      }
      if (action === 'buy') {
        const listingNo = Number.parseInt(parts[3] ?? '0', 10);
        const res = await marketService.buyListing(meta, listingNo, `btn-mkbuy:${interaction.id}`);
        if (!res.ok) {
          await interaction.editReply({
            content: buildErrorNotice(res.message),
            embeds: [],
            components: [],
          });
          return;
        }
        await interaction.editReply({
          content: `${botEmojiRegistry.getCheckMention()} **${meta.displayName}** đã mua thành công **${res.listing.speciesName}** (#${res.listing.listingNo}) giá **${res.listing.price.toLocaleString('en-US')} PC**! Số dư còn: **${(res.newBuyerCoins ?? 0).toLocaleString('en-US')} PC**.`,
          embeds: [],
          components: [],
        });
        return;
      }
      return;
    }

    if (interaction.customId.startsWith('tr:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const action = parts[1];
      const tradeId = parts[2];
      const meta = extractTrainerMeta(interaction.user);
      const res =
        action === 'cancel'
          ? await marketService.cancelTrade(interaction.user.id, tradeId)
          : await marketService.confirmTrade(meta, tradeId, `btn-tr:${interaction.id}`);

      if (!res.ok) {
        await interaction.followUp({ content: buildErrorNotice(res.message), ephemeral: true });
        return;
      }
      await interaction.editReply({
        embeds: [buildTradeEmbed(res.trade, this.defaultPrefix)],
        components: res.trade.status === 'PENDING' ? [buildTradeButtonsRow(res.trade)] : [],
      });
      return;
    }

    if (interaction.customId.startsWith('bt:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const sub = parts[1];
      const battleId = parts[2];
      if (!battleId) {
        return;
      }

      if (sub === 'accept' || sub === 'decline') {
        const res = battleService.respondPvpChallenge(
          battleId,
          interaction.user.id,
          sub === 'accept',
        );
        if (!res.ok) {
          await interaction.followUp({ content: buildErrorNotice(res.message), ephemeral: true });
          return;
        }
        await interaction.editReply({
          content: '',
          embeds: [buildBattleEmbed(res.battle)],
          components: buildBattleActionRows(res.battle),
        });
        return;
      }

      const rawMove = sub === 'forfeit' ? 'forfeit' : (parts[3] as BattleMoveAction | undefined);
      const action: BattleMoveAction | 'forfeit' = rawMove ?? 'primary';
      const res = await battleService.takeTurn(
        battleId,
        interaction.user.id,
        action,
        interaction.id,
      );
      if (!res.ok) {
        await interaction.followUp({ content: buildErrorNotice(res.message), ephemeral: true });
        return;
      }
      await interaction.editReply({
        content: '',
        embeds: [buildBattleEmbed(res.battle)],
        components: buildBattleActionRows(res.battle),
      });
      return;
    }

    const isFishingCatch = interaction.customId.startsWith('fishcatch:');
    if (!interaction.customId.startsWith('catch:') && !isFishingCatch) {
      return;
    }

    // Xác nhận tương tác với Discord ngay dưới 3 giây để tránh Unknown Interaction khi Neon cold start
    await interaction.deferUpdate();

    if (interaction.guildId) {
      const settings = await guildConfigService.getGuildSettings(
        interaction.guildId,
        this.defaultPrefix,
      );
      if (!settings.enabled) {
        await interaction.followUp({
          content: `${crossIcon} Bot hiện đang tạm tắt trong server này bởi Quản trị viên.`,
          ephemeral: true,
        });
        return;
      }
      if (!isChannelAllowed(settings, interaction.channelId)) {
        await interaction.followUp({
          content: `${crossIcon} Kênh này không nằm trong danh sách kênh hoạt động của bot.`,
          ephemeral: true,
        });
        return;
      }
    }

    const segments = interaction.customId.split(':');
    const encounterId = segments[1];
    const rawBallId = segments[2];
    if (!encounterId || !rawBallId) {
      return;
    }

    const ballId: BallId | null = resolveBallId(rawBallId);
    if (!ballId) {
      return;
    }

    const outcome: ThrowBallOutcome = isFishingCatch
      ? await fishingService.catchHookedFish(encounterId, interaction.user.id, ballId, interaction.id)
      : await encounterService.throwBall(encounterId, interaction.user.id, ballId, interaction.id);

    if (!outcome.ok) {
      await interaction.followUp({
        content: `${timerIcon} ${outcome.message}`,
        ephemeral: true,
      });
      return;
    }

    if (isFishingCatch) {
      this.clearFishingTimer(encounterId);
    } else {
      this.clearEncounterTimer(encounterId);
    }

    const meta = extractTrainerMeta(interaction.user);
    const emptyInventory: Record<BallId, number> = {
      pokeball: 0,
      greatball: 0,
      ultraball: 0,
      premierball: 0,
      masterball: 0,
    };
    const btnPrefix = isFishingCatch ? 'fishcatch' : 'catch';

    await interaction.editReply({
      embeds: [buildThrowingEmbed(meta.displayName, outcome.species, outcome.isShiny, outcome.ballId)],
      components: [buildCatchButtonsRow(encounterId, emptyInventory, true, btnPrefix)],
    });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1150);
    });

    await interaction.editReply({
      embeds: [buildCatchResultEmbed(meta.displayName, outcome)],
      components: [
        buildCatchButtonsRow(encounterId, outcome.remainingBalls ?? emptyInventory, true, btnPrefix),
      ],
    });
  }
}
