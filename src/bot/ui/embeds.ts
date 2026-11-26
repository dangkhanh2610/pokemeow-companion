import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { BALL_CATALOG, getBallSpec } from '@/game/catalog/ball-catalog';
import { defaultCreatureCatalog, RARITY_CONFIGS } from '@/game/catalog/creature-catalog';
import { xpForNextLevel } from '@/game/engine/spawn-engine';
import type { PaginatedDexResult, TrainerBagSummary } from '@/game/services/trainer-service';
import type {
  BallId,
  CreatureSpecies,
  DailyRewardResult,
  EncounterRoll,
  LeaderboardEntry,
  LeaderboardMetric,
  ReleaseResult,
  ThrowBallOutcome,
} from '@/game/types';
import { botEmojiRegistry } from '../emoji-registry';

const FAN_DISCLAIMER =
  'PokéVerse • Fan-made phi lợi nhuận, không liên kết với Nintendo / The Pokémon Company';

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function buildCatchButtonsRow(
  encounterId: string,
  ballInventory: Readonly<Record<BallId, number>>,
  disabledAll = false,
): ActionRowBuilder<ButtonBuilder> {
  const buttons = BALL_CATALOG.map((ball) => {
    const qty = ballInventory[ball.id];
    const style =
      ball.id === 'masterball'
        ? ButtonStyle.Danger
        : ball.id === 'premierball'
          ? ButtonStyle.Success
          : ButtonStyle.Secondary;

    return new ButtonBuilder()
      .setCustomId(`catch:${encounterId}:${ball.id}`)
      .setLabel(`${ball.shortCode.toUpperCase()} (${qty})`)
      .setEmoji(botEmojiRegistry.getBallButtonEmoji(ball.id))
      .setStyle(style)
      .setDisabled(disabledAll || qty <= 0);
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

export function buildWildEncounterEmbed(
  trainerDisplayName: string,
  roll: EncounterRoll,
  expiresAt: Date,
): EmbedBuilder {
  const rarityMeta = RARITY_CONFIGS[roll.species.rarity];
  const imageUrl = roll.isShiny
    ? roll.species.shinyAnimatedSpriteUrl
    : roll.species.animatedSpriteUrl;
  const shinyBanner = roll.isShiny ? '✨ **SHINY!** ' : '';
  const expireEpoch = Math.floor(expiresAt.getTime() / 1000);

  return new EmbedBuilder()
    .setColor(roll.isShiny ? 0xfacc15 : rarityMeta.colorHex)
    .setTitle(`${shinyBanner}Một ${roll.species.name} hoang dã đã xuất hiện!`)
    .setDescription(
      [
        `Huấn luyện viên: **${trainerDisplayName}**`,
        `Độ hiếm: **${rarityMeta.label}** • Hệ: **${roll.species.types.join(' / ')}**`,
        `Chỉ số IV tiềm năng: **${roll.ivPercent}%** (${roll.ivTotal}/186)`,
        `Hết hạn: <t:${expireEpoch}:R> — Chọn bóng bên dưới để ném!`,
      ].join('\n'),
    )
    .setImage(imageUrl)
    .setFooter({ text: FAN_DISCLAIMER });
}

export function buildThrowingEmbed(
  trainerDisplayName: string,
  species: CreatureSpecies,
  isShiny: boolean,
  ballId: BallId,
): EmbedBuilder {
  const ball = getBallSpec(ballId);
  const ballMention = botEmojiRegistry.getBallMention(ballId);
  const shinyTag = isShiny ? '✨ Shiny ' : '';
  const spriteUrl = isShiny ? species.shinyAnimatedSpriteUrl : species.animatedSpriteUrl;

  return new EmbedBuilder()
    .setColor(0xfbbf24)
    .setAuthor({
      name: `${ball.name} đang bay ra...`,
      iconURL: ball.iconUrl,
    })
    .setTitle(`${ballMention} Đang ném **${ball.name}** về phía **${shinyTag}${species.name}**...`)
    .setDescription(
      [
        `Huấn luyện viên: **${trainerDisplayName}**`,
        '✨ Quả bóng đang rung lắc dữ dội... Chờ kết quả!',
      ].join('\n'),
    )
    .setThumbnail(spriteUrl)
    .setFooter({ text: FAN_DISCLAIMER });
}

export function buildCatchResultEmbed(
  trainerDisplayName: string,
  outcome: Extract<ThrowBallOutcome, { readonly ok: true }>,
): EmbedBuilder {
  const ball = getBallSpec(outcome.ballId);
  const ballMention = botEmojiRegistry.getBallMention(outcome.ballId);
  const rarityMeta = RARITY_CONFIGS[outcome.species.rarity];
  const spriteUrl = outcome.isShiny
    ? outcome.species.shinyAnimatedSpriteUrl
    : outcome.species.animatedSpriteUrl;
  const shinyTag = outcome.isShiny ? '✨ Shiny ' : '';
  const chancePct = (outcome.catchChance * 100).toFixed(1);

  if (outcome.caught) {
    const levelLine = outcome.leveledUp
      ? `🎉 **LÊN CẤP!** Bạn đã đạt **Level ${outcome.newLevel}**!`
      : `Cấp hiện tại: **Lv.${outcome.newLevel}**`;

    const embed = new EmbedBuilder()
      .setColor(outcome.isShiny ? 0xfacc15 : 0x10b981)
      .setAuthor({ name: `${ball.name}`, iconURL: ball.iconUrl })
      .setTitle(`✅ Bắt thành công ${shinyTag}${outcome.species.name}!`)
      .setDescription(
        [
          `Huấn luyện viên: **${trainerDisplayName}**`,
          `Bóng sử dụng: ${ballMention} **${ball.name}** (Tỉ lệ: ${chancePct}%)`,
          `Độ hiếm: **${rarityMeta.label}** • IVs: **${outcome.ivPercent}%** (${outcome.ivTotal}/186)`,
          `Phần thưởng: **+${formatNumber(outcome.coinsEarned)} PC** • **+${outcome.xpEarned} XP**`,
          `Số dư mới: **${formatNumber(outcome.newCoinsBalance)} PC** • ${levelLine}`,
        ].join('\n'),
      )
      .setFooter({ text: FAN_DISCLAIMER });

    if (outcome.isShiny || outcome.species.rarity === 'legendary') {
      embed.setImage(spriteUrl);
    } else {
      embed.setThumbnail(spriteUrl);
    }
    return embed;
  }

  return new EmbedBuilder()
    .setColor(0xef4444)
    .setAuthor({ name: `${ball.name}`, iconURL: ball.iconUrl })
    .setTitle(`💨 Ôi không! ${shinyTag}${outcome.species.name} đã chạy thoát!`)
    .setDescription(
      [
        `Huấn luyện viên: **${trainerDisplayName}**`,
        `Bạn đã ném ${ballMention} **${ball.name}** (Tỉ lệ bắt: ${chancePct}%) nhưng thất bại.`,
        `Hãy thử tìm thêm lượt mới bằng \`/p\` hoặc \`;p\` nhé!`,
      ].join('\n'),
    )
    .setThumbnail(spriteUrl)
    .setFooter({ text: FAN_DISCLAIMER });
}

export function buildShopEmbed(prefix: string): EmbedBuilder {
  const lines = BALL_CATALOG.map((ball) => {
    const icon = botEmojiRegistry.getBallMention(ball.id);
    return `${icon} **${ball.name}** (\`${ball.shortCode}\`) — **${formatNumber(ball.price)} PC**\n└ ${ball.description}`;
  });

  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('🛒 Cửa Hàng PokéVerse')
    .setDescription(
      [
        ...lines,
        '',
        `💡 Cách mua: \`/buy ball:pokeball quantity:10\` hoặc \`${prefix}buy pb 10\``,
      ].join('\n'),
    )
    .setFooter({ text: FAN_DISCLAIMER });
}

export function buildBagEmbed(summary: TrainerBagSummary): EmbedBuilder {
  const ballLines = BALL_CATALOG.map((ball) => {
    const icon = botEmojiRegistry.getBallMention(ball.id);
    return `${icon} **${ball.name}** (\`${ball.shortCode}\`): **${summary.balls[ball.id]}**`;
  });

  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(`🎒 Túi Đồ của ${summary.displayName || summary.username}`)
    .setDescription(
      [
        `💰 PokéCoins: **${formatNumber(summary.coins)} PC**`,
        `📦 Bộ sưu tập: **${summary.activeCreatureCount}** Pokémon (**${summary.uniqueSpeciesCount}/${defaultCreatureCatalog.getAll().length}** loài)`,
        '',
        '**Kho Poké Ball:**',
        ...ballLines,
      ].join('\n'),
    )
    .setThumbnail(summary.avatarUrl || null)
    .setFooter({ text: FAN_DISCLAIMER });
}

export function buildProfileEmbed(summary: TrainerBagSummary): EmbedBuilder {
  const nextXp = xpForNextLevel(summary.level);
  const catchRate =
    summary.totalEncounters > 0
      ? ((summary.totalCatches / summary.totalEncounters) * 100).toFixed(1)
      : '0.0';

  const topLines =
    summary.topCreatures.length > 0
      ? summary.topCreatures.map((c, idx) => {
          const shiny = c.isShiny ? '✨ ' : '';
          return `\`#${idx + 1}\` ${shiny}**${c.speciesName}** (${c.rarity}) — **${c.ivPercent}% IV**`;
        })
      : ['Chưa bắt được Pokémon nào. Hãy dùng `/p` hoặc `;p` ngay!'];

  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`🪪 Hồ Sơ Huấn Luyện Viên: ${summary.displayName || summary.username}`)
    .setThumbnail(summary.avatarUrl || null)
    .addFields(
      {
        name: 'Cấp Độ & Kinh Nghiệm',
        value: `Level **${summary.level}**\nXP: **${summary.xp} / ${nextXp}**`,
        inline: true,
      },
      {
        name: 'Kinh Tế & Chuỗi Ngày',
        value: `💰 **${formatNumber(summary.coins)} PC**\n🔥 Streak: **${summary.dailyStreak} ngày**`,
        inline: true,
      },
      {
        name: 'Thành Tích Bắt',
        value: `🎯 Đã bắt: **${formatNumber(summary.totalCatches)}** (${catchRate}%)\n✨ Shiny: **${summary.shinyCatches}** • Loài: **${summary.uniqueSpeciesCount}/${defaultCreatureCatalog.getAll().length}**`,
        inline: false,
      },
      {
        name: 'Top Pokémon Nổi Bật',
        value: topLines.join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: FAN_DISCLAIMER });
}

export function buildDexEmbed(
  trainerDisplayName: string,
  dex: PaginatedDexResult,
): EmbedBuilder {
  const lines =
    dex.items.length > 0
      ? dex.items.map((item, index) => {
          const globalIndex = (dex.page - 1) * 10 + index + 1;
          const shiny = item.isShiny ? '✨ ' : '';
          return `\`${globalIndex}.\` ${shiny}**${item.speciesName}** \`#${item.speciesId}\` — **${item.rarity}** • **${item.ivPercent}% IV**`;
        })
      : ['Kho Pokémon của bạn đang trống. Dùng `/p` hoặc `;p` để bắt Pokémon đầu tiên!'];

  return new EmbedBuilder()
    .setColor(0x14b8a6)
    .setTitle(`📖 Pokédex của ${trainerDisplayName}`)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: `Trang ${dex.page}/${dex.totalPages} • Tổng ${dex.totalCount} Pokémon • ${FAN_DISCLAIMER}`,
    });
}

export function buildDailyEmbed(
  trainerDisplayName: string,
  result: DailyRewardResult,
): EmbedBuilder {
  if (result.alreadyClaimed) {
    const nextEpoch = Math.floor(result.nextAvailableAt.getTime() / 1000);
    return new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('⏳ Bạn đã điểm danh hôm nay rồi!')
      .setDescription(
        [
          `Huấn luyện viên: **${trainerDisplayName}**`,
          `Chuỗi hiện tại: **${result.streak} ngày**`,
          `Quay lại nhận thưởng tiếp theo: <t:${nextEpoch}:R>`,
        ].join('\n'),
      )
      .setFooter({ text: FAN_DISCLAIMER });
  }

  const pbIcon = botEmojiRegistry.getBallMention('pokeball');
  const gbIcon = botEmojiRegistry.getBallMention('greatball');

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('🎁 Điểm Danh Hàng Ngày Thành Công!')
    .setDescription(
      [
        `Huấn luyện viên: **${trainerDisplayName}**`,
        `🔥 Chuỗi điểm danh: **${result.streak} ngày**`,
        `💰 Nhận: **+${formatNumber(result.coinsEarned)} PC**`,
        `${pbIcon} Poké Ball: **+${result.pokeballsEarned}** • ${gbIcon} Great Ball: **+${result.greatballsEarned}**`,
        `Số dư hiện tại: **${formatNumber(result.newCoinsBalance)} PC**`,
      ].join('\n'),
    )
    .setFooter({ text: FAN_DISCLAIMER });
}

export function buildReleaseEmbed(
  trainerDisplayName: string,
  result: ReleaseResult,
): EmbedBuilder {
  if (result.releasedCount === 0) {
    return new EmbedBuilder()
      .setColor(0x64748b)
      .setTitle('🕊️ Không có Pokémon trùng để thả')
      .setDescription(
        `${trainerDisplayName} hiện không có Pokémon trùng nào (hệ thống luôn giữ lại cá thể IV cao nhất mỗi loài, cũng như giữ toàn bộ **Shiny** và **Legendary**).`,
      )
      .setFooter({ text: FAN_DISCLAIMER });
  }

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('🕊️ Đã Thả Pokémon Trùng Thành Công!')
    .setDescription(
      [
        `Huấn luyện viên: **${trainerDisplayName}**`,
        `Số Pokémon đã thả: **${result.releasedCount}** (đã giữ lại IV cao nhất mỗi loài + mọi Shiny/Legendary)`,
        `💰 Tiền thưởng thu về: **+${formatNumber(result.coinsEarned)} PC**`,
        `Số dư mới: **${formatNumber(result.newCoinsBalance)} PC**`,
      ].join('\n'),
    )
    .setFooter({ text: FAN_DISCLAIMER });
}

export function buildLeaderboardEmbed(
  metric: LeaderboardMetric,
  entries: readonly LeaderboardEntry[],
): EmbedBuilder {
  const metricTitles: Record<LeaderboardMetric, string> = {
    catches: '🏆 Bảng Xếp Hạng — Tổng Lượt Bắt',
    coins: '💰 Bảng Xếp Hạng — Đại Gia PokéCoins',
    shinies: '✨ Bảng Xếp Hạng — Thợ Săn Shiny',
    level: '⚡ Bảng Xếp Hạng — Cấp Độ Huấn Luyện Viên',
  };

  const lines =
    entries.length > 0
      ? entries.map((entry) => {
          const medal =
            entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `\`#${entry.rank}\``;
          return `${medal} **${entry.displayName}** — Lv.${entry.level} • 🎯 ${formatNumber(entry.totalCatches)} • ✨ ${entry.shinyCatches} • 💰 ${formatNumber(entry.coins)} PC`;
        })
      : ['Chưa có huấn luyện viên nào trên bảng xếp hạng.'];

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(metricTitles[metric])
    .setDescription(lines.join('\n'))
    .setFooter({ text: FAN_DISCLAIMER });
}

export function buildHelpEmbed(prefix: string, botName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`📘 Hướng Dẫn Chơi ${botName}`)
    .setDescription(
      [
        `Bạn có thể dùng cả **Slash Commands** (\`/\`) lẫn **Prefix** (\`${prefix}\`):`,
        '',
        `• \`/p\` hoặc \`${prefix}p\` — Tìm và bắt Pokémon hoang dã`,
        `• \`/shop\` hoặc \`${prefix}shop\` — Xem cửa hàng Poké Ball`,
        `• \`/buy\` hoặc \`${prefix}buy pb 10\` — Mua bóng (\`pb\`, \`gb\`, \`ub\`, \`prb\`, \`mb\`)`,
        `• \`/bag\` hoặc \`${prefix}bag\` — Xem túi đồ và số dư PokéCoins`,
        `• \`/dex [page]\` hoặc \`${prefix}dex 1\` — Xem Pokédex đã bắt`,
        `• \`/profile\` hoặc \`${prefix}profile\` — Xem hồ sơ huấn luyện viên`,
        `• \`/release\` hoặc \`${prefix}release\` — Thả Pokémon trùng để kiếm thêm PC`,
        `• \`/daily\` hoặc \`${prefix}daily\` — Nhận thưởng điểm danh mỗi 24 giờ`,
        `• \`/lb\` hoặc \`${prefix}lb [catches|coins|shinies|level]\` — Xem bảng xếp hạng`,
        '',
        `*${FAN_DISCLAIMER}. Chỉ nhận ủng hộ tự nguyện để duy trì server.*`,
      ].join('\n'),
    );
}
