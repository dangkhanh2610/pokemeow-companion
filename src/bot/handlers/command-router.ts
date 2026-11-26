import {
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type PermissionsBitField,
  type User,
} from 'discord.js';
import { resolveBallId } from '@/game/catalog/ball-catalog';
import { economyService } from '@/game/services/economy-service';
import { ENCOUNTER_TTL_MS, encounterService } from '@/game/services/encounter-service';
import {
  guildConfigService,
  isChannelAllowed,
  validatePrefix,
} from '@/game/services/guild-config-service';
import { leaderboardService } from '@/game/services/leaderboard-service';
import { megaService } from '@/game/services/mega-service';
import { trainerService, type TrainerIdentityInput } from '@/game/services/trainer-service';
import type { BallId, CreatureSpecies, LeaderboardMetric } from '@/game/types';
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
  buildReleaseEmbed,
  buildShopEmbed,
  buildThrowingEmbed,
  buildWildEncounterEmbed,
} from '../ui/embeds';

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

const ADMIN_SLASH_COMMANDS = new Set(['bot', 'prefix', 'channel']);
const ADMIN_PREFIX_COMMANDS = new Set(['bot', 'prefix', 'channel']);

export class BotCommandRouter {
  private readonly defaultPrefix: string;
  private readonly botName: string;
  private readonly ownerIds: ReadonlySet<string>;
  private readonly encounterTimers = new Map<string, NodeJS.Timeout>();

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
    }, ENCOUNTER_TTL_MS + 500);
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

  public async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const meta = extractTrainerMeta(interaction.user);

    if (ADMIN_SLASH_COMMANDS.has(interaction.commandName)) {
      if (!interaction.guildId) {
        await interaction.reply({
          content: '⚠️ Lệnh quản trị này chỉ dùng trong server Discord.',
          ephemeral: true,
        });
        return;
      }
      if (!this.isAdminOrOwner(interaction.user.id, interaction.memberPermissions)) {
        await interaction.reply({
          content:
            '🔒 Chỉ Quản trị viên (Admin / Manage Server) mới có quyền dùng lệnh cấu hình này.',
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
              '❌ Prefix không hợp lệ (1–5 ký tự, không có dấu cách, không chứa `<`, `@` hoặc `` ` ``).',
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
          content: '🔴 Bot hiện đang tạm tắt trong server này bởi Quản trị viên.',
          ephemeral: true,
        });
        return;
      }
      if (!isChannelAllowed(settings, interaction.channelId)) {
        await interaction.reply({
          content: '🚫 Kênh này không nằm trong danh sách kênh hoạt động của bot.',
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
          if (result.reason === 'SPAWN_IN_FLIGHT') {
            await interaction.editReply('⏳ Đang xử lý lượt tìm trước đó của bạn...');
            return;
          }
          if (result.reason === 'COOLDOWN') {
            const sec = ((result.remainingMs ?? 1000) / 1000).toFixed(1);
            await interaction.editReply(`⏱️ Bạn đang hồi sức! Chờ **${sec}s** nữa nhé.`);
            return;
          }
          await interaction.editReply(
            `⚠️ Bạn đang có một **${result.species?.name ?? 'Pokémon'}** chưa bắt xong! Hãy bấm bóng trên tin nhắn trước đó hoặc đợi hết giờ.`,
          );
          return;
        }
        const sentMessage = await interaction.editReply({
          embeds: [
            buildWildEncounterEmbed(
              meta.displayName,
              meta.avatarUrl,
              result.roll,
              result.expiresAt,
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
        await interaction.reply({ embeds: [buildShopEmbed(activePrefix)] });
        return;
      }

      case 'buy': {
        await interaction.deferReply();
        const rawBall = interaction.options.getString('ball', true);
        const ballId = resolveBallId(rawBall);
        const qty = interaction.options.getInteger('quantity') ?? 1;
        if (!ballId) {
          await interaction.editReply('❌ Loại bóng không hợp lệ.');
          return;
        }
        const bought = await economyService.buyBall(
          meta,
          ballId,
          qty,
          `slash-buy:${interaction.id}`,
        );
        if (!bought.ok) {
          await interaction.editReply(`❌ ${bought.message}`);
          return;
        }
        await interaction.editReply(
          `✅ Đã mua **${bought.quantityBought}x ${bought.ballId}** với giá **${bought.totalCost.toLocaleString('en-US')} PC**. Hiện có: **${bought.newBallQuantity}** quả • Số dư: **${bought.newCoinsBalance.toLocaleString('en-US')} PC**.`,
        );
        return;
      }

      case 'bag': {
        await interaction.deferReply();
        await trainerService.ensureTrainer(meta);
        const profile = await trainerService.getTrainerProfile(meta.userId);
        if (!profile) {
          await interaction.editReply('❌ Không tìm thấy dữ liệu túi đồ.');
          return;
        }
        await interaction.editReply({ embeds: [buildBagEmbed(profile)] });
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
          await interaction.editReply(`❌ ${res.message}`);
          return;
        }
        const shiny = res.isShiny ? '★ ' : '';
        const statusText = res.isFavorite
          ? '♥ Đã thêm vào danh sách Yêu thích (được bảo vệ khỏi `/release`).'
          : '💔 Đã gỡ khỏi danh sách Yêu thích.';
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
          await interaction.editReply(`❌ ${preview.message}`);
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
          await interaction.editReply('❌ Không tìm thấy hồ sơ huấn luyện viên.');
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

    if (ADMIN_PREFIX_COMMANDS.has(command)) {
      if (!this.isAdminOrOwner(message.author.id, message.member?.permissions)) {
        await message.reply(
          '🔒 Chỉ Quản trị viên (Admin / Manage Server) mới có quyền dùng lệnh cấu hình này.',
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
            '❌ Prefix không hợp lệ (1–5 ký tự, không có dấu cách, không chứa `<`, `@` hoặc `` ` ``).',
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
            await message.reply('❌ Kênh không hợp lệ. Ví dụ: `channel allow #pokenyan`');
            return;
          }
          const updated = await guildConfigService.allowChannel(message.guild.id, targetId);
          await message.reply({ embeds: [buildChannelSettingsEmbed(this.botName, updated)] });
          return;
        }
        if (sub === 'block') {
          if (!targetId) {
            await message.reply('❌ Kênh không hợp lệ. Ví dụ: `channel block #general`');
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
          if (result.reason === 'SPAWN_IN_FLIGHT') {
            return;
          }
          if (result.reason === 'COOLDOWN') {
            const sec = ((result.remainingMs ?? 1000) / 1000).toFixed(1);
            await message.reply(`⏱️ Bạn đang hồi sức! Chờ **${sec}s** nữa nhé.`);
            return;
          }
          await message.reply(
            `⚠️ Bạn đang có một **${result.species?.name ?? 'Pokémon'}** chưa bắt xong! Hãy bấm bóng hoặc đợi hết giờ.`,
          );
          return;
        }
        const sentMessage = await message.reply({
          embeds: [
            buildWildEncounterEmbed(
              meta.displayName,
              meta.avatarUrl,
              result.roll,
              result.expiresAt,
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
        await message.reply({ embeds: [buildShopEmbed(settings.prefix)] });
        return;
      }

      case 'buy':
      case 'b': {
        if (!arg1) {
          await message.reply(
            `💡 Cách dùng: \`${settings.prefix}buy <pb|gb|ub|prb|mb> [số_lượng]\` — ví dụ: \`${settings.prefix}buy pb 10\``,
          );
          return;
        }
        const ballId = resolveBallId(arg1);
        if (!ballId) {
          await message.reply(
            `❌ Không tìm thấy bóng \`${arg1}\`. Hỗ trợ: \`pb\`, \`gb\`, \`ub\`, \`prb\`, \`mb\`.`,
          );
          return;
        }
        const quantity = arg2 ? Number.parseInt(arg2, 10) : 1;
        const bought = await economyService.buyBall(
          meta,
          ballId,
          Number.isNaN(quantity) ? 0 : quantity,
          `msg-buy:${message.id}`,
        );
        if (!bought.ok) {
          await message.reply(`❌ ${bought.message}`);
          return;
        }
        await message.reply(
          `✅ Đã mua **${bought.quantityBought}x ${bought.ballId}** (**-${bought.totalCost.toLocaleString('en-US')} PC**). Hiện có: **${bought.newBallQuantity}** quả • Số dư: **${bought.newCoinsBalance.toLocaleString('en-US')} PC**.`,
        );
        return;
      }

      case 'bag': {
        await trainerService.ensureTrainer(meta);
        const profile = await trainerService.getTrainerProfile(meta.userId);
        if (!profile) {
          return;
        }
        await message.reply({ embeds: [buildBagEmbed(profile)] });
        return;
      }

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
          await message.reply(`❌ ${res.message}`);
          return;
        }
        const shiny = res.isShiny ? '★ ' : '';
        const statusText = res.isFavorite
          ? '♥ Đã thêm vào danh sách Yêu thích (bảo vệ khỏi `release`).'
          : '💔 Đã gỡ khỏi danh sách Yêu thích.';
        await message.reply(
          `${statusText}\n└ ${shiny}**${res.speciesName}** (${res.ivPercent}% IV · \`#${res.shortId}\`)`,
        );
        return;
      }

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
          await message.reply(`❌ ${preview.message}`);
          return;
        }
        await message.reply({
          embeds: [buildMegaConfirmEmbed(meta.displayName, preview)],
          components: [buildMegaConfirmRow(meta.userId, preview.megaSpecies.id)],
        });
        return;
      }

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

      case 'release': {
        const res = await economyService.releaseDuplicates(meta, `msg-rel:${message.id}`);
        await message.reply({ embeds: [buildReleaseEmbed(meta.displayName, res)] });
        return;
      }

      case 'daily': {
        const res = await trainerService.claimDaily(meta, `msg-daily:${message.id}`);
        await message.reply({ embeds: [buildDailyEmbed(meta.displayName, res)] });
        return;
      }

      case 'lb':
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
    if (interaction.customId.startsWith('mega:')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split(':');
      const action = parts[1];
      const ownerId = parts[2];

      if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.followUp({
          content: '⚠️ Bạn không thể thao tác nghi thức Mega của huấn luyện viên khác!',
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
            content: `❌ ${res.message}`,
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
          content: '⚠️ Bạn không thể lật trang Pokédex của huấn luyện viên khác!',
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

    if (!interaction.customId.startsWith('catch:')) {
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
          content: '🔴 Bot hiện đang tạm tắt trong server này bởi Quản trị viên.',
          ephemeral: true,
        });
        return;
      }
      if (!isChannelAllowed(settings, interaction.channelId)) {
        await interaction.followUp({
          content: '🚫 Kênh này không nằm trong danh sách kênh hoạt động của bot.',
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

    const outcome = await encounterService.throwBall(
      encounterId,
      interaction.user.id,
      ballId,
      interaction.id,
    );

    if (!outcome.ok) {
      await interaction.followUp({
        content: `⚠️ ${outcome.message}`,
        ephemeral: true,
      });
      return;
    }

    this.clearEncounterTimer(encounterId);

    const meta = extractTrainerMeta(interaction.user);
    const emptyInventory: Record<BallId, number> = {
      pokeball: 0,
      greatball: 0,
      ultraball: 0,
      premierball: 0,
      masterball: 0,
    };

    await interaction.editReply({
      embeds: [buildThrowingEmbed(meta.displayName, outcome.species, outcome.isShiny, outcome.ballId)],
      components: [buildCatchButtonsRow(encounterId, emptyInventory, true)],
    });

    const [, profile] = await Promise.all([
      new Promise<void>((resolve) => {
        setTimeout(resolve, 1250);
      }),
      trainerService.getTrainerProfile(interaction.user.id),
    ]);

    await interaction.editReply({
      embeds: [buildCatchResultEmbed(meta.displayName, outcome)],
      components: [buildCatchButtonsRow(encounterId, profile?.balls ?? emptyInventory, true)],
    });
  }
}
