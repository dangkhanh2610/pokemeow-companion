import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Message,
  User,
} from 'discord.js';
import { resolveBallId } from '@/game/catalog/ball-catalog';
import { economyService } from '@/game/services/economy-service';
import { encounterService } from '@/game/services/encounter-service';
import { leaderboardService } from '@/game/services/leaderboard-service';
import { trainerService, type TrainerIdentityInput } from '@/game/services/trainer-service';
import type { BallId, LeaderboardMetric } from '@/game/types';
import {
  buildBagEmbed,
  buildCatchButtonsRow,
  buildCatchResultEmbed,
  buildDailyEmbed,
  buildDexEmbed,
  buildHelpEmbed,
  buildLeaderboardEmbed,
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

export class BotCommandRouter {
  private readonly prefix: string;
  private readonly botName: string;

  public constructor(prefix: string, botName: string) {
    this.prefix = prefix;
    this.botName = botName;
  }

  public async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const meta = extractTrainerMeta(interaction.user);

    switch (interaction.commandName) {
      case 'p': {
        await interaction.deferReply();
        const result = await encounterService.spawnWildEncounter(meta, interaction.channelId);
        if (!result.ok) {
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
        await interaction.editReply({
          embeds: [buildWildEncounterEmbed(meta.displayName, result.roll, result.expiresAt)],
          components: [buildCatchButtonsRow(result.encounterId, result.ballInventory)],
        });
        return;
      }

      case 'shop': {
        await interaction.reply({ embeds: [buildShopEmbed(this.prefix)] });
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
        const dex = await trainerService.getTrainerDex(meta.userId, page, 10);
        await interaction.editReply({ embeds: [buildDexEmbed(meta.displayName, dex)] });
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
        await interaction.reply({ embeds: [buildHelpEmbed(this.prefix, this.botName)] });
        return;
      }
    }
  }

  public async handlePrefixMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.guild) {
      return;
    }

    if (!message.content.startsWith(this.prefix)) {
      return;
    }

    const body = message.content.slice(this.prefix.length).trim();
    if (!body) {
      return;
    }

    const parts = body.split(/\s+/);
    const command = parts[0]?.toLowerCase() ?? '';
    const arg1 = parts[1];
    const arg2 = parts[2];
    const meta = extractTrainerMeta(message.author);

    switch (command) {
      case 'p':
      case 'pokemon': {
        const result = await encounterService.spawnWildEncounter(meta, message.channelId);
        if (!result.ok) {
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
        await message.reply({
          embeds: [buildWildEncounterEmbed(meta.displayName, result.roll, result.expiresAt)],
          components: [buildCatchButtonsRow(result.encounterId, result.ballInventory)],
        });
        return;
      }

      case 'shop': {
        await message.reply({ embeds: [buildShopEmbed(this.prefix)] });
        return;
      }

      case 'buy':
      case 'b': {
        if (!arg1) {
          await message.reply(
            `💡 Cách dùng: \`${this.prefix}buy <pb|gb|ub|prb|mb> [số_lượng]\` — ví dụ: \`${this.prefix}buy pb 10\``,
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
        const parsedPage = arg1 ? Number.parseInt(arg1, 10) : 1;
        const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
        const dex = await trainerService.getTrainerDex(meta.userId, page, 10);
        await message.reply({ embeds: [buildDexEmbed(meta.displayName, dex)] });
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
        await message.reply({ embeds: [buildHelpEmbed(this.prefix, this.botName)] });
        return;
      }
    }
  }

  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith('catch:')) {
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

    const outcome = await encounterService.throwBall(
      encounterId,
      interaction.user.id,
      ballId,
      interaction.id,
    );

    if (!outcome.ok) {
      await interaction.reply({
        content: `⚠️ ${outcome.message}`,
        ephemeral: true,
      });
      return;
    }

    const meta = extractTrainerMeta(interaction.user);
    const emptyInventory: Record<BallId, number> = {
      pokeball: 0,
      greatball: 0,
      ultraball: 0,
      premierball: 0,
      masterball: 0,
    };

    await interaction.update({
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
