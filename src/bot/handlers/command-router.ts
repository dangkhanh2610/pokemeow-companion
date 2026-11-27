import {
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type PermissionsBitField,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import { resolveBallId } from '@/game/catalog/ball-catalog';
import {
  getFishPreview,
  getWildPreview,
} from '@/game/services/activity-lock';
import type { BattleTurnAction } from '@/game/services/battle-service';
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
import { moveShopService } from '@/game/services/move-shop-service';
import { questService } from '@/game/services/quest-service';
import { teamService } from '@/game/services/team-service';
import {
  parseBoxCommandArgs,
  resolveBoxSortMode,
  trainerService,
  type BoxSortMode,
  type TrainerIdentityInput,
} from '@/game/services/trainer-service';
import type { BallId, CreatureSpecies, LeaderboardMetric, ThrowBallOutcome } from '@/game/types';
import { botEmojiRegistry } from '../emoji-registry';
import {
  buildBagEmbed,
  buildBotStatusEmbed,
  buildBoxComponents,
  buildBoxEmbed,
  buildCatchButtonsRow,
  buildCatchResultEmbed,
  buildChannelSettingsEmbed,
  buildDailyEmbed,
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
  buildBattleMessagePayload,
  buildBuddyEmbed,
  buildBuddyTrainEmbed,
  buildBuyFishingItemEmbed,
  buildCaptchaButtonsRow,
  buildCaptchaEmbed,
  buildCaptchaSuccessEmbed,
  buildChallengerListEmbed,
  buildChallengerSelectRow,
  buildCreatureInspectButtons,
  buildCreatureInspectEmbed,
  buildErrorNotice,
  buildEvolutionCandidatesEmbed,
  buildEvolutionSuccessEmbed,
  buildFishingBiteEmbed,
  buildFishingCastingEmbed,
  buildFishingExpiredEmbed,
  buildFishingPullRow,
  buildFishingShopEmbed,
  buildMarketBrowseEmbed,
  buildMarketBuyConfirmEmbed,
  buildMarketBuyConfirmRow,
  buildMarketListSuccessEmbed,
  buildMarketPaginationRow,
  buildMoveShopEmbed,
  buildMoveShopSelectRow,
  buildQuestClaimRow,
  buildQuestClaimSuccessEmbed,
  buildQuestsEmbed,
  buildTeamComponents,
  buildTeamEmbed,
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
            await interaction.editReply(`${timerIcon} Đang xử lý lượt tìm/câu cá trước đó của bạn...`);
            return;
          }
          if (result.reason === 'ACTIVE_FISHING_EXISTS') {
            await interaction.editReply(
              `${timerIcon} Bạn đang có một lượt **câu cá (\`;f\`)** chưa hoàn tất! Không thể tìm Pokémon hoang dã đồng thời.`,
            );
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

      case 'box': {
        await interaction.deferReply();
        await trainerService.ensureTrainer(meta);
        const page = interaction.options.getInteger('page') ?? 1;
        const filter = interaction.options.getString('filter') ?? '';
        const rawSort = interaction.options.getString('sort') ?? 'rarity';
        const sort: BoxSortMode = resolveBoxSortMode(rawSort) ?? 'rarity';
        const box = await trainerService.getTrainerBox(meta.userId, page, 10, filter, sort);
        await interaction.editReply({
          embeds: [buildBoxEmbed(meta.displayName, box, activePrefix)],
          components: buildBoxComponents(meta.userId, box),
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
          if (cast.reason === 'SPAWN_IN_FLIGHT') {
            await interaction.editReply(`${timerIcon} Đang xử lý lượt tìm/câu trước đó của bạn...`);
            return;
          }
          if (cast.reason === 'ACTIVE_WILD_ENCOUNTER') {
            await interaction.editReply(
              `${timerIcon} Bạn đang gặp **${cast.species?.name ?? 'Pokémon hoang dã'}** chưa bắt xong! Hãy bắt hoặc chờ hết giờ trước khi câu cá.`,
            );
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
          const challengers = battleService.getChallengerOverview(profile?.gymBadges ?? []);
          await interaction.editReply({
            embeds: [buildChallengerListEmbed(meta.displayName, challengers, activePrefix)],
            components: [buildChallengerSelectRow(meta.userId, challengers)],
          });
          return;
        }
        if (sub === 'gym') {
          const stage = interaction.options.getInteger('stage') ?? undefined;
          if (stage === undefined) {
            await trainerService.ensureTrainer(meta);
            const profile = await trainerService.getTrainerProfile(meta.userId);
            const challengers = battleService.getChallengerOverview(profile?.gymBadges ?? []);
            await interaction.editReply({
              embeds: [buildChallengerListEmbed(meta.displayName, challengers, activePrefix)],
              components: [buildChallengerSelectRow(meta.userId, challengers)],
            });
            return;
          }
          const res = await battleService.startGym(meta, stage);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply(await buildBattleMessagePayload(res.battle));
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
          const payload = await buildBattleMessagePayload(res.battle);
          await interaction.editReply({
            content: `<@${targetUser.id}>`,
            ...payload,
          });
          return;
        }
        const res = await battleService.startPve(meta);
        if (!res.ok) {
          await interaction.editReply(buildErrorNotice(res.message));
          return;
        }
        await interaction.editReply(await buildBattleMessagePayload(res.battle));
        return;
      }

      case 'team': {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'set') {
          const slot = interaction.options.getInteger('slot', true);
          const pokemon = interaction.options.getString('pokemon', true);
          const res = await teamService.setTeamSlot(meta, pokemon, slot);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildTeamEmbed(meta.displayName, res.team, activePrefix, res.message)],
            components: buildTeamComponents(meta.userId, res.team),
          });
          return;
        }
        if (sub === 'add') {
          const pokemon = interaction.options.getString('pokemon', true);
          const res = await teamService.setTeamSlot(meta, pokemon);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildTeamEmbed(meta.displayName, res.team, activePrefix, res.message)],
            components: buildTeamComponents(meta.userId, res.team),
          });
          return;
        }
        if (sub === 'swap') {
          const from = interaction.options.getInteger('from', true);
          const to = interaction.options.getInteger('to', true);
          const res = await teamService.swapTeamSlots(meta, from, to);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildTeamEmbed(meta.displayName, res.team, activePrefix, res.message)],
            components: buildTeamComponents(meta.userId, res.team),
          });
          return;
        }
        if (sub === 'remove') {
          const slot = interaction.options.getInteger('slot', true);
          const res = await teamService.removeTeamSlot(meta, slot);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildTeamEmbed(meta.displayName, res.team, activePrefix, res.message)],
            components: buildTeamComponents(meta.userId, res.team),
          });
          return;
        }
        if (sub === 'auto') {
          const res = await teamService.autoBuildTeam(meta);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [buildTeamEmbed(meta.displayName, res.team, activePrefix, res.message)],
            components: buildTeamComponents(meta.userId, res.team),
          });
          return;
        }
        await trainerService.ensureTrainer(meta);
        const team = await teamService.getTeamView(meta.userId);
        await interaction.editReply({
          embeds: [buildTeamEmbed(meta.displayName, team, activePrefix)],
          components: buildTeamComponents(meta.userId, team),
        });
        return;
      }

      case 'moves': {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        const checkIcon = botEmojiRegistry.getCheckMention();
        if (sub === 'buy') {
          const moveQuery = interaction.options.getString('move', true);
          const pokemon = interaction.options.getString('pokemon') ?? undefined;
          const slot = interaction.options.getInteger('slot') ?? undefined;
          const res = await moveShopService.buyMove(
            meta,
            pokemon,
            moveQuery,
            slot,
            `slash-msbuy:${interaction.id}`,
          );
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          const slotNote = res.equippedSlot ? ` & tự động lắp vào **Ô #${res.equippedSlot}**` : '';
          await interaction.editReply({
            embeds: [
              buildMoveShopEmbed(
                meta.displayName,
                res.view,
                activePrefix,
                `${checkIcon} Đã mua **${res.boughtMove.name}** (-**${res.spentCoins.toLocaleString('en-US')} PC**)${slotNote}!`,
              ),
            ],
            components: [buildMoveShopSelectRow(meta.userId, res.view)],
          });
          return;
        }
        if (sub === 'equip') {
          const moveQuery = interaction.options.getString('move', true);
          const slot = interaction.options.getInteger('slot', true);
          const pokemon = interaction.options.getString('pokemon') ?? undefined;
          const res = await moveShopService.equipMove(meta, pokemon, moveQuery, slot);
          if (!res.ok) {
            await interaction.editReply(buildErrorNotice(res.message));
            return;
          }
          await interaction.editReply({
            embeds: [
              buildMoveShopEmbed(
                meta.displayName,
                res.view,
                activePrefix,
                `${checkIcon} Đã lắp **${res.equippedMove.name}** vào **Ô #${res.slot}**!`,
              ),
            ],
            components: [buildMoveShopSelectRow(meta.userId, res.view)],
          });
          return;
        }
        await trainerService.ensureTrainer(meta);
        const pokemon = interaction.options.getString('pokemon') ?? undefined;
        const shopRes = await moveShopService.getMoveShop(meta.userId, pokemon);
        if (!shopRes.ok) {
          await interaction.editReply(buildErrorNotice(shopRes.message));
          return;
        }
        await interaction.editReply({
          embeds: [buildMoveShopEmbed(meta.displayName, shopRes.view, activePrefix)],
          components: [buildMoveShopSelectRow(meta.userId, shopRes.view)],
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

      case 'info': {
        await interaction.deferReply();
        await trainerService.ensureTrainer(meta);
        const query = interaction.options.getString('pokemon') ?? undefined;
        const view = await trainerService.inspectCreature(meta.userId, query);
        if (!view) {
          await interaction.editReply(
            buildErrorNotice(
              query
                ? `Không tìm thấy Pokémon nào khớp với \`${query}\` trong kho lẫn Pokédex.`
                : 'Không tìm thấy dữ liệu Pokémon.',
            ),
          );
          return;
        }
        await interaction.editReply({
          embeds: [buildCreatureInspectEmbed(meta.displayName, view, activePrefix)],
          components:
            view.kind === 'OWNED' ? buildCreatureInspectButtons(meta.userId, view) : [],
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
          if (result.reason === 'ACTIVE_FISHING_EXISTS') {
            await message.reply(
              `${timerIcon} Bạn đang có một lượt **câu cá (\`;f\`)** chưa hoàn tất! Hãy hoàn thành hoặc chờ hết giờ trước khi tìm Pokémon hoang dã.`,
            );
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

      case 'box':
      case 'bx': {
        await trainerService.ensureTrainer(meta);
        const parsed = parseBoxCommandArgs(parts.slice(1));
        const box = await trainerService.getTrainerBox(
          meta.userId,
          parsed.page,
          10,
          parsed.filter,
          parsed.sort,
        );
        await message.reply({
          embeds: [buildBoxEmbed(meta.displayName, box, settings.prefix)],
          components: buildBoxComponents(meta.userId, box),
        });
        return;
      }

      case 'd':
      case 'dex':
      case 'pokedex': {
        await trainerService.ensureTrainer(meta);
        const query = parts.slice(1).join(' ').trim();
        if (!query) {
          await message.reply(
            `Để xem danh sách Pokémon đã bắt, hãy dùng \`${settings.prefix}box [sort|lọc]\` (mặc định theo **Rarity**). Để tra cứu chi tiết loài, dùng \`${settings.prefix}dex <tên_pokemon>\` hoặc \`${settings.prefix}info <tên|#mã>\`.`,
          );
          return;
        }
        const view = await trainerService.inspectCreature(meta.userId, query);
        if (!view) {
          await message.reply(
            buildErrorNotice(`Không tìm thấy Pokémon nào khớp với \`${query}\` trong kho lẫn Pokédex.`),
          );
          return;
        }
        await message.reply({
          embeds: [buildCreatureInspectEmbed(meta.displayName, view, settings.prefix)],
          components:
            view.kind === 'OWNED' ? buildCreatureInspectButtons(meta.userId, view) : [],
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
          if (cast.reason === 'SPAWN_IN_FLIGHT') {
            return;
          }
          if (cast.reason === 'ACTIVE_WILD_ENCOUNTER') {
            await message.reply(
              `${timerIcon} Bạn đang có **${cast.species?.name ?? 'Pokémon hoang dã'}** chưa bắt xong! Hãy bắt hoặc chờ hết giờ rồi mới câu cá (\`;f\`).`,
            );
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
      case 'gym':
      case 'npc':
      case 'challenger':
      case 'challengers': {
        const isGymCmd =
          command === 'gym' ||
          command === 'npc' ||
          command === 'challenger' ||
          command === 'challengers';
        const sub = isGymCmd ? 'gym' : (arg1?.toLowerCase() ?? 'pve');
        const gymArg = isGymCmd ? arg1 : arg2;

        if (
          sub === 'list' ||
          sub === 'gyms' ||
          (sub === 'gym' && !(gymArg && /^\d+$/.test(gymArg)))
        ) {
          await trainerService.ensureTrainer(meta);
          const profile = await trainerService.getTrainerProfile(meta.userId);
          const challengers = battleService.getChallengerOverview(profile?.gymBadges ?? []);
          await message.reply({
            embeds: [buildChallengerListEmbed(meta.displayName, challengers, settings.prefix)],
            components: [buildChallengerSelectRow(meta.userId, challengers)],
          });
          return;
        }
        if (sub === 'gym') {
          const stage = Number.parseInt(gymArg!, 10);
          const res = await battleService.startGym(meta, stage);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply(await buildBattleMessagePayload(res.battle));
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
          const payload = await buildBattleMessagePayload(res.battle);
          await message.reply({
            content: `<@${targetUser.id}>`,
            ...payload,
          });
          return;
        }
        const res = await battleService.startPve(meta);
        if (!res.ok) {
          await message.reply(buildErrorNotice(res.message));
          return;
        }
        await message.reply(await buildBattleMessagePayload(res.battle));
        return;
      }

      case 'team':
      case 'party':
      case 'tm3': {
        await trainerService.ensureTrainer(meta);
        const sub = arg1?.toLowerCase();

        if (!sub || sub === 'view' || sub === 'list') {
          const team = await teamService.getTeamView(meta.userId);
          await message.reply({
            embeds: [buildTeamEmbed(meta.displayName, team, settings.prefix)],
            components: buildTeamComponents(meta.userId, team),
          });
          return;
        }

        if (sub === 'auto' || sub === 'best') {
          const res = await teamService.autoBuildTeam(meta);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildTeamEmbed(meta.displayName, res.team, settings.prefix, res.message)],
            components: buildTeamComponents(meta.userId, res.team),
          });
          return;
        }

        if (sub === 'swap' || sub === 'sw') {
          const slotA = arg2 ? Number.parseInt(arg2, 10) : 0;
          const slotB = parts[3] ? Number.parseInt(parts[3], 10) : 0;
          const res = await teamService.swapTeamSlots(meta, slotA, slotB);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildTeamEmbed(meta.displayName, res.team, settings.prefix, res.message)],
            components: buildTeamComponents(meta.userId, res.team),
          });
          return;
        }

        if (sub === 'remove' || sub === 'rm' || sub === 'clear') {
          const target: number | 'all' =
            sub === 'clear' || arg2?.toLowerCase() === 'all'
              ? 'all'
              : Number.parseInt(arg2 ?? '0', 10);
          const res = await teamService.removeTeamSlot(meta, target);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildTeamEmbed(meta.displayName, res.team, settings.prefix, res.message)],
            components: buildTeamComponents(meta.userId, res.team),
          });
          return;
        }

        if (sub === 'set' || sub === 's') {
          const maybeSlot = arg2 && /^[1-3]$/.test(arg2) ? Number.parseInt(arg2, 10) : undefined;
          const pokemon = (maybeSlot !== undefined ? parts.slice(3) : parts.slice(2)).join(' ').trim();
          if (!pokemon) {
            await message.reply(
              `Cách dùng: \`${settings.prefix}team set <1-3> <tên_pokemon|#mã>\` (vd: \`${settings.prefix}team set 1 Charizard\`).`,
            );
            return;
          }
          const res = await teamService.setTeamSlot(meta, pokemon, maybeSlot);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [buildTeamEmbed(meta.displayName, res.team, settings.prefix, res.message)],
            components: buildTeamComponents(meta.userId, res.team),
          });
          return;
        }

        const pokemonQuery = (sub === 'add' ? parts.slice(2) : parts.slice(1)).join(' ').trim();
        if (!pokemonQuery) {
          const team = await teamService.getTeamView(meta.userId);
          await message.reply({
            embeds: [buildTeamEmbed(meta.displayName, team, settings.prefix)],
            components: buildTeamComponents(meta.userId, team),
          });
          return;
        }
        const res = await teamService.setTeamSlot(meta, pokemonQuery);
        if (!res.ok) {
          await message.reply(buildErrorNotice(res.message));
          return;
        }
        await message.reply({
          embeds: [buildTeamEmbed(meta.displayName, res.team, settings.prefix, res.message)],
          components: buildTeamComponents(meta.userId, res.team),
        });
        return;
      }

      case 'ms':
      case 'moves':
      case 'moveshop':
      case 'skill':
      case 'skills':
      case 'learn':
      case 'tm': {
        await trainerService.ensureTrainer(meta);
        const checkIcon = botEmojiRegistry.getCheckMention();
        const sub = arg1?.toLowerCase();

        if (sub === 'buy' || sub === 'b') {
          const moveQuery = arg2;
          if (!moveQuery) {
            await message.reply(
              `Cách dùng: \`${settings.prefix}ms buy <số|tên_chiêu> [tên_pokemon|#mã]\` (vd: \`${settings.prefix}ms buy 1\`).`,
            );
            return;
          }
          const pokemon = parts.slice(3).join(' ').trim() || undefined;
          const res = await moveShopService.buyMove(
            meta,
            pokemon,
            moveQuery,
            undefined,
            `msg-msbuy:${message.id}`,
          );
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          const slotNote = res.equippedSlot ? ` & lắp vào **Ô #${res.equippedSlot}**` : '';
          await message.reply({
            embeds: [
              buildMoveShopEmbed(
                meta.displayName,
                res.view,
                settings.prefix,
                `${checkIcon} Đã mua **${res.boughtMove.name}** (-**${res.spentCoins.toLocaleString('en-US')} PC**)${slotNote}!`,
              ),
            ],
            components: [buildMoveShopSelectRow(meta.userId, res.view)],
          });
          return;
        }

        if (sub === 'equip' || sub === 'eq') {
          const moveQuery = arg2;
          const rawSlot = parts[3];
          const slot = rawSlot && /^\d+$/.test(rawSlot) ? Number.parseInt(rawSlot, 10) : 0;
          if (!moveQuery || slot < 1 || slot > 4) {
            await message.reply(
              `Cách dùng: \`${settings.prefix}ms equip <số|tên_chiêu> <ô_1-4> [tên_pokemon|#mã]\`.`,
            );
            return;
          }
          const pokemon = parts.slice(4).join(' ').trim() || undefined;
          const res = await moveShopService.equipMove(meta, pokemon, moveQuery, slot);
          if (!res.ok) {
            await message.reply(buildErrorNotice(res.message));
            return;
          }
          await message.reply({
            embeds: [
              buildMoveShopEmbed(
                meta.displayName,
                res.view,
                settings.prefix,
                `${checkIcon} Đã lắp **${res.equippedMove.name}** vào **Ô #${res.slot}**!`,
              ),
            ],
            components: [buildMoveShopSelectRow(meta.userId, res.view)],
          });
          return;
        }

        const pokemonQuery = parts.slice(1).join(' ').trim() || undefined;
        const shopRes = await moveShopService.getMoveShop(meta.userId, pokemonQuery);
        if (!shopRes.ok) {
          await message.reply(buildErrorNotice(shopRes.message));
          return;
        }
        await message.reply({
          embeds: [buildMoveShopEmbed(meta.displayName, shopRes.view, settings.prefix)],
          components: [buildMoveShopSelectRow(meta.userId, shopRes.view)],
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

      case 'info':
      case 'v':
      case 'view':
      case 'pi':
      case 'pinfo': {
        await trainerService.ensureTrainer(meta);
        const query = parts.slice(1).join(' ').trim() || undefined;
        const view = await trainerService.inspectCreature(meta.userId, query);
        if (!view) {
          await message.reply(
            buildErrorNotice(
              query
                ? `Không tìm thấy Pokémon nào khớp với \`${query}\` trong kho lẫn Pokédex.`
                : 'Không tìm thấy dữ liệu Pokémon.',
            ),
          );
          return;
        }
        await message.reply({
          embeds: [buildCreatureInspectEmbed(meta.displayName, view, settings.prefix)],
          components:
            view.kind === 'OWNED' ? buildCreatureInspectButtons(meta.userId, view) : [],
        });
        return;
      }

      case 'pf':
      case 'profile':
      case 'stats': {
        await trainerService.ensureTrainer(meta);
        if (command === 'stats' && parts.length > 1) {
          const query = parts.slice(1).join(' ').trim();
          const view = await trainerService.inspectCreature(meta.userId, query);
          if (!view) {
            await message.reply(
              buildErrorNotice(`Không tìm thấy Pokémon nào khớp với \`${query}\`.`),
            );
            return;
          }
          await message.reply({
            embeds: [buildCreatureInspectEmbed(meta.displayName, view, settings.prefix)],
            components:
              view.kind === 'OWNED' ? buildCreatureInspectButtons(meta.userId, view) : [],
          });
          return;
        }
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

    if (interaction.customId.startsWith('boxpage:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const ownerId = parts[1];
      const targetPage = Number.parseInt(parts[2] ?? '1', 10);
      const sort = resolveBoxSortMode(parts[3] ?? 'rarity') ?? 'rarity';
      const filter = decodeURIComponent(parts[4] ?? '');

      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Bạn không thể lật trang kho Pokémon của huấn luyện viên khác!`,
          ephemeral: true,
        });
        return;
      }

      const meta = extractTrainerMeta(interaction.user);
      const box = await trainerService.getTrainerBox(
        ownerId,
        Number.isNaN(targetPage) ? 1 : targetPage,
        10,
        filter,
        sort,
      );
      await interaction.editReply({
        embeds: [buildBoxEmbed(meta.displayName, box, this.defaultPrefix)],
        components: buildBoxComponents(ownerId, box),
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

    if (interaction.customId.startsWith('info:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const action = parts[1];
      const ownerId = parts[2];
      const arg = parts[3] ?? '';

      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Bạn không thể thao tác bảng chỉ số Pokémon của người khác!`,
          ephemeral: true,
        });
        return;
      }

      const meta = extractTrainerMeta(interaction.user);

      if (action === 'ms') {
        const shopRes = await moveShopService.getMoveShopByCreatureId(ownerId, arg);
        if (!shopRes.ok) {
          await interaction.followUp({ content: buildErrorNotice(shopRes.message), ephemeral: true });
          return;
        }
        await interaction.followUp({
          embeds: [buildMoveShopEmbed(meta.displayName, shopRes.view, this.defaultPrefix)],
          components: [buildMoveShopSelectRow(ownerId, shopRes.view)],
        });
        return;
      }

      if (action === 'nav') {
        const offsetIdx = Number.parseInt(arg, 10);
        const view = await trainerService.inspectOwnedByOffset(
          ownerId,
          Number.isNaN(offsetIdx) ? 0 : offsetIdx,
        );
        if (!view) {
          await interaction.followUp({
            content: buildErrorNotice('Không tìm thấy Pokémon ở vị trí này.'),
            ephemeral: true,
          });
          return;
        }
        await interaction.editReply({
          embeds: [buildCreatureInspectEmbed(meta.displayName, view, this.defaultPrefix)],
          components: buildCreatureInspectButtons(ownerId, view),
        });
        return;
      }

      if (action === 'buddy') {
        const res = await evolutionService.setBuddy(meta, arg);
        if (!res.ok) {
          await interaction.followUp({ content: buildErrorNotice(res.message), ephemeral: true });
          return;
        }
      } else if (action === 'fav') {
        const res = await trainerService.toggleFavorite(meta, arg);
        if (!res.ok) {
          await interaction.followUp({ content: buildErrorNotice(res.message), ephemeral: true });
          return;
        }
      } else if (action === 'train') {
        const res = await trainerService.trainSpecificCreature(
          meta,
          arg,
          1,
          `btn-infotrain:${interaction.id}`,
        );
        if (!res.ok) {
          await interaction.followUp({ content: buildErrorNotice(res.message), ephemeral: true });
          return;
        }
      }

      const refreshed = await trainerService.inspectCreatureById(ownerId, arg);
      if (!refreshed) {
        return;
      }
      await interaction.editReply({
        embeds: [buildCreatureInspectEmbed(meta.displayName, refreshed, this.defaultPrefix)],
        components: buildCreatureInspectButtons(ownerId, refreshed),
      });
      return;
    }

    if (interaction.customId.startsWith('team:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const action = parts[1];
      const ownerId = parts[2];
      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Bạn không thể chỉnh sửa đội hình của người chơi khác!`,
          ephemeral: true,
        });
        return;
      }

      const meta = extractTrainerMeta(interaction.user);
      const res =
        action === 'swap12'
          ? await teamService.swapTeamSlots(meta, 1, 2)
          : action === 'swap13'
            ? await teamService.swapTeamSlots(meta, 1, 3)
            : await teamService.autoBuildTeam(meta);

      if (!res.ok) {
        await interaction.followUp({ content: buildErrorNotice(res.message), ephemeral: true });
        return;
      }
      await interaction.editReply({
        embeds: [buildTeamEmbed(meta.displayName, res.team, this.defaultPrefix, res.message)],
        components: buildTeamComponents(ownerId, res.team),
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
        const payload = await buildBattleMessagePayload(res.battle);
        await interaction.editReply({
          content: '',
          ...payload,
        });
        return;
      }

      const indexVal = Number.parseInt(parts[3] ?? '0', 10);
      const safeIndex = Number.isNaN(indexVal) ? 0 : indexVal;
      const action: BattleTurnAction =
        sub === 'forfeit'
          ? { kind: 'forfeit' }
          : sub === 'switch'
            ? { kind: 'switch', teamIndex: safeIndex }
            : { kind: 'slot', slotIndex: safeIndex };

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
      const payload = await buildBattleMessagePayload(res.battle);
      await interaction.editReply({
        content: '',
        ...payload,
      });
      return;
    }

    const isFishingCatch = interaction.customId.startsWith('fishcatch:');
    if (!interaction.customId.startsWith('catch:') && !isFishingCatch) {
      return;
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

    const emptyInventory: Record<BallId, number> = {
      pokeball: 0,
      greatball: 0,
      ultraball: 0,
      premierball: 0,
      masterball: 0,
    };
    const btnPrefix = isFishingCatch ? 'fishcatch' : 'catch';
    const meta = extractTrainerMeta(interaction.user);

    // Kiểm tra nhanh quyền sử dụng & trạng thái guild từ cache (0ms, không chờ DB trước khi tung bóng)
    const cachedSettings = interaction.guildId
      ? guildConfigService.peekCachedSettings(interaction.guildId)
      : undefined;
    if (cachedSettings) {
      if (!cachedSettings.enabled) {
        await interaction.reply({
          content: `${crossIcon} Bot hiện đang tạm tắt trong server này bởi Quản trị viên.`,
          ephemeral: true,
        });
        return;
      }
      if (!isChannelAllowed(cachedSettings, interaction.channelId)) {
        await interaction.reply({
          content: `${crossIcon} Kênh này không nằm trong danh sách kênh hoạt động của bot.`,
          ephemeral: true,
        });
        return;
      }
    }

    const preview = isFishingCatch ? getFishPreview(encounterId) : getWildPreview(encounterId);

    if (preview) {
      if (preview.userId !== interaction.user.id) {
        await interaction.reply({
          content: `${crossIcon} Đây không phải Pokémon của bạn!`,
          ephemeral: true,
        });
        return;
      }

      // Khởi chạy DB xử lý bắt bóng song song với chuyển ngay sang hiệu ứng bóng rung lắc mượt mà
      const throwPromise = isFishingCatch
        ? fishingService.catchHookedFish(encounterId, interaction.user.id, ballId, interaction.id)
        : encounterService.throwBall(encounterId, interaction.user.id, ballId, interaction.id);

      const [, outcome] = await Promise.all([
        interaction.update({
          embeds: [buildThrowingEmbed(meta.displayName, preview.species, preview.isShiny, ballId)],
          components: [buildCatchButtonsRow(encounterId, emptyInventory, true, btnPrefix)],
        }),
        Promise.all([
          throwPromise,
          new Promise<void>((resolve) => {
            setTimeout(resolve, 900);
          }),
        ]).then(([res]) => res),
      ]);

      if (!outcome.ok) {
        await interaction.editReply({
          content: `${timerIcon} ${outcome.message}`,
          embeds: [],
          components: [],
        });
        return;
      }

      if (isFishingCatch) {
        this.clearFishingTimer(encounterId);
      } else {
        this.clearEncounterTimer(encounterId);
      }

      await interaction.editReply({
        content: '',
        embeds: [buildCatchResultEmbed(meta.displayName, outcome)],
        components: [
          buildCatchButtonsRow(encounterId, outcome.remainingBalls ?? emptyInventory, true, btnPrefix),
        ],
      });
      return;
    }

    // Fallback khi cache vừa khởi động lại chưa có preview
    await interaction.deferUpdate();

    if (interaction.guildId && !cachedSettings) {
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

    await interaction.editReply({
      embeds: [buildThrowingEmbed(meta.displayName, outcome.species, outcome.isShiny, outcome.ballId)],
      components: [buildCatchButtonsRow(encounterId, emptyInventory, true, btnPrefix)],
    });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 900);
    });

    await interaction.editReply({
      embeds: [buildCatchResultEmbed(meta.displayName, outcome)],
      components: [
        buildCatchButtonsRow(encounterId, outcome.remainingBalls ?? emptyInventory, true, btnPrefix),
      ],
    });
  }

  public async handleSelectMenuInteraction(
    interaction: StringSelectMenuInteraction,
  ): Promise<void> {
    const crossIcon = botEmojiRegistry.getCrossMention();
    const checkIcon = botEmojiRegistry.getCheckMention();

    if (interaction.customId.startsWith('boxsort:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const ownerId = parts[1];
      const filter = decodeURIComponent(parts[2] ?? '');

      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Bạn không thể đổi sắp xếp kho Pokémon của người khác!`,
          ephemeral: true,
        });
        return;
      }

      const selectedSort: BoxSortMode =
        resolveBoxSortMode(interaction.values[0] ?? 'rarity') ?? 'rarity';
      const meta = extractTrainerMeta(interaction.user);
      const box = await trainerService.getTrainerBox(ownerId, 1, 10, filter, selectedSort);

      await interaction.editReply({
        embeds: [buildBoxEmbed(meta.displayName, box, this.defaultPrefix)],
        components: buildBoxComponents(ownerId, box),
      });
      return;
    }

    if (interaction.customId.startsWith('gympick:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const ownerId = parts[1];
      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Bạn không thể chọn Challenger trên bảng của người chơi khác!`,
          ephemeral: true,
        });
        return;
      }

      const stage = Number.parseInt(interaction.values[0] ?? '1', 10);
      const meta = extractTrainerMeta(interaction.user);
      const res = await battleService.startGym(meta, Number.isNaN(stage) ? 1 : stage);
      if (!res.ok) {
        await interaction.followUp({ content: buildErrorNotice(res.message), ephemeral: true });
        return;
      }

      await interaction.editReply(await buildBattleMessagePayload(res.battle));
      return;
    }

    if (interaction.customId.startsWith('msbuy:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const ownerId = parts[1];
      const creatureId = parts[2];
      if (!ownerId || !creatureId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: `${crossIcon} Bạn không thể mua kỹ năng cho Pokémon của người khác!`,
          ephemeral: true,
        });
        return;
      }

      const moveId = interaction.values[0] ?? '';
      const meta = extractTrainerMeta(interaction.user);
      const currentShop = await moveShopService.getMoveShopByCreatureId(ownerId, creatureId);
      if (!currentShop.ok) {
        await interaction.followUp({ content: buildErrorNotice(currentShop.message), ephemeral: true });
        return;
      }

      const alreadyUnlocked = currentShop.view.unlockedMoveIds.includes(moveId);
      if (alreadyUnlocked) {
        const eqRes = await moveShopService.equipMoveByCreatureId(meta, creatureId, moveId);
        if (!eqRes.ok) {
          await interaction.followUp({ content: buildErrorNotice(eqRes.message), ephemeral: true });
          return;
        }
        await interaction.editReply({
          embeds: [
            buildMoveShopEmbed(
              meta.displayName,
              eqRes.view,
              this.defaultPrefix,
              `${checkIcon} Đã trang bị **${eqRes.equippedMove.name}** vào **Ô #${eqRes.slot}**!`,
            ),
          ],
          components: [buildMoveShopSelectRow(ownerId, eqRes.view)],
        });
        return;
      }

      const buyRes = await moveShopService.buyMoveByCreatureId(
        meta,
        creatureId,
        moveId,
        undefined,
        `sel-msbuy:${interaction.id}`,
      );
      if (!buyRes.ok) {
        await interaction.followUp({ content: buildErrorNotice(buyRes.message), ephemeral: true });
        return;
      }

      const slotNote = buyRes.equippedSlot ? ` & tự lắp vào **Ô #${buyRes.equippedSlot}**` : '';
      await interaction.editReply({
        embeds: [
          buildMoveShopEmbed(
            meta.displayName,
            buyRes.view,
            this.defaultPrefix,
            `${checkIcon} Đã mua **${buyRes.boughtMove.name}** (-**${buyRes.spentCoins.toLocaleString('en-US')} PC**)${slotNote}!`,
          ),
        ],
        components: [buildMoveShopSelectRow(ownerId, buyRes.view)],
      });
    }
  }
}
