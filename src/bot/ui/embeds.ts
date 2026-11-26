import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { BALL_CATALOG, getBallSpec } from '@/game/catalog/ball-catalog';
import { defaultCreatureCatalog, RARITY_CONFIGS } from '@/game/catalog/creature-catalog';
import { xpForNextLevel } from '@/game/engine/spawn-engine';
import type { GuildSettings, GuildToggleState } from '@/game/services/guild-config-service';
import type { PaginatedDexResult, TrainerBagSummary } from '@/game/services/trainer-service';
import type {
  BallId,
  CreatureSpecies,
  DailyRewardResult,
  EncounterRoll,
  LeaderboardEntry,
  LeaderboardMetric,
  RarityTier,
  ReleaseResult,
  ThrowBallOutcome,
} from '@/game/types';
import { botEmojiRegistry } from '../emoji-registry';

const FAN_DISCLAIMER =
  'PokeNyan · Fan-made phi lợi nhuận, không liên kết với Nintendo / The Pokémon Company';

const RARITY_LABELS: Readonly<Record<RarityTier, string>> = {
  common: 'COMMON',
  uncommon: 'UNCOMMON',
  rare: 'RARE',
  super_rare: 'SUPER RARE',
  legendary: 'LEGENDARY',
  mega: 'MEGA',
};

const BALL_SHORT_LABELS: Readonly<Record<BallId, string>> = {
  pokeball: 'Poké',
  greatball: 'Great',
  ultraball: 'Ultra',
  premierball: 'Premier',
  masterball: 'Master',
};

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatDexNo(id: number): string {
  return `#${String(id).padStart(4, '0')}`;
}

function formatTypeTags(types: readonly string[]): string {
  return types.map((t) => `\`${t.toUpperCase()}\``).join(' ');
}

function buildIvProgressBar(ivPercent: number): string {
  const segments = 10;
  const filled = Math.max(0, Math.min(segments, Math.round((ivPercent / 100) * segments)));
  return `${'▰'.repeat(filled)}${'▱'.repeat(segments - filled)}`;
}

export function buildCatchButtonsRow(
  encounterId: string,
  ballInventory: Readonly<Record<BallId, number>>,
  disabledAll = false,
): ActionRowBuilder<ButtonBuilder> {
  const buttons = BALL_CATALOG.map((ball) => {
    const qty = ballInventory[ball.id];
    const isMasterAvailable = ball.id === 'masterball' && qty > 0 && !disabledAll;
    const style = isMasterAvailable ? ButtonStyle.Primary : ButtonStyle.Secondary;

    return new ButtonBuilder()
      .setCustomId(`catch:${encounterId}:${ball.id}`)
      .setLabel(`${BALL_SHORT_LABELS[ball.id]} · ${qty}`)
      .setEmoji(botEmojiRegistry.getBallButtonEmoji(ball.id))
      .setStyle(style)
      .setDisabled(disabledAll || qty <= 0);
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

export function buildDexPaginationRow(
  ownerUserId: string,
  filter: string,
  page: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  const encodedFilter = encodeURIComponent(filter).slice(0, 40);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`dex:${ownerUserId}:${Math.max(1, page - 1)}:${encodedFilter}`)
      .setLabel('◀ Trước')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`dex:${ownerUserId}:${Math.min(totalPages, page + 1)}:${encodedFilter}`)
      .setLabel('Sau ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );
}

export function buildWildEncounterEmbed(
  trainerDisplayName: string,
  trainerAvatarUrl: string,
  roll: EncounterRoll,
  expiresAt: Date,
  rescueGranted = false,
): EmbedBuilder {
  const rarityMeta = RARITY_CONFIGS[roll.species.rarity];
  const imageUrl = roll.isShiny
    ? roll.species.shinyAnimatedSpriteUrl
    : roll.species.animatedSpriteUrl;
  const expireEpoch = Math.floor(expiresAt.getTime() / 1000);
  const shinyPrefix = roll.isShiny ? '★ SHINY · ' : '';
  const rarityTag = `\`${RARITY_LABELS[roll.species.rarity]}\``;
  const shinyTag = roll.isShiny ? ' `SHINY`' : '';
  const baseCatchPct = Math.round(roll.species.baseCatchRate * 100);
  const rescueLine = rescueGranted
    ? `\n${botEmojiRegistry.getBallMention('pokeball')} **Tiếp tế khẩn cấp:** +3 Poké Ball miễn phí vì bạn đã cạn túi!`
    : '';

  return new EmbedBuilder()
    .setColor(roll.isShiny ? 0xfacc15 : rarityMeta.colorHex)
    .setAuthor({
      name: `${trainerDisplayName}  ·  Wild Encounter`,
      iconURL: trainerAvatarUrl || undefined,
    })
    .setTitle(`${shinyPrefix}${formatDexNo(roll.species.dexNumber)}  ${roll.species.name}`)
    .setDescription(
      `${rarityTag}${shinyTag}  ${formatTypeTags(roll.species.types)}\nBỏ chạy <t:${expireEpoch}:R>${rescueLine}`,
    )
    .addFields(
      {
        name: 'Tiềm Năng IV',
        value: `\`${buildIvProgressBar(roll.ivPercent)}\`  **${roll.ivPercent}%**\n${roll.ivTotal} / 186 IVs`,
        inline: true,
      },
      {
        name: 'Chỉ Số Loài',
        value: `BST **${roll.species.baseStats.bst}**\nTỉ lệ gốc **${baseCatchPct}%**`,
        inline: true,
      },
    )
    .setImage(imageUrl)
    .setFooter({ text: 'PokeNyan  ·  Chọn Poké Ball bên dưới để ném' });
}

export function buildExpiredEncounterEmbed(
  trainerDisplayName: string,
  species: CreatureSpecies,
  isShiny: boolean,
): EmbedBuilder {
  const shinyPrefix = isShiny ? '★ SHINY · ' : '';
  const spriteUrl = isShiny ? species.shinyAnimatedSpriteUrl : species.animatedSpriteUrl;

  return new EmbedBuilder()
    .setColor(0x475569)
    .setTitle(`${shinyPrefix}${formatDexNo(species.dexNumber)}  ${species.name}`)
    .setDescription(
      `Đã hết thời gian chờ — Pokémon hoang dã của **${trainerDisplayName}** đã bỏ đi.`,
    )
    .setThumbnail(spriteUrl)
    .setFooter({ text: 'PokeNyan  ·  Gõ /p hoặc lệnh tìm mới để tiếp tục' });
}

export function buildThrowingEmbed(
  trainerDisplayName: string,
  species: CreatureSpecies,
  isShiny: boolean,
  ballId: BallId,
): EmbedBuilder {
  const ball = getBallSpec(ballId);
  const ballMention = botEmojiRegistry.getBallMention(ballId);
  const shinyPrefix = isShiny ? '★ SHINY · ' : '';
  const spriteUrl = isShiny ? species.shinyAnimatedSpriteUrl : species.animatedSpriteUrl;

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setAuthor({
      name: `${ball.name}  ·  Đang ném bóng`,
      iconURL: ball.iconUrl,
    })
    .setTitle(`${shinyPrefix}${formatDexNo(species.dexNumber)}  ${species.name}`)
    .setDescription(
      [
        `**${trainerDisplayName}** đã ném ${ballMention} **${ball.name}**`,
        '`◦ ◦ ◦`  Quả bóng đang rung lắc...',
      ].join('\n'),
    )
    .setThumbnail(spriteUrl)
    .setFooter({ text: 'PokeNyan  ·  Đang chờ kết quả' });
}

export function buildCatchResultEmbed(
  trainerDisplayName: string,
  outcome: Extract<ThrowBallOutcome, { readonly ok: true }>,
): EmbedBuilder {
  const ball = getBallSpec(outcome.ballId);
  const ballMention = botEmojiRegistry.getBallMention(outcome.ballId);
  const spriteUrl = outcome.isShiny
    ? outcome.species.shinyAnimatedSpriteUrl
    : outcome.species.animatedSpriteUrl;
  const shinyPrefix = outcome.isShiny ? '★ SHINY · ' : '';
  const chancePct = (outcome.catchChance * 100).toFixed(1);

  if (outcome.caught) {
    const levelLine = outcome.leveledUp
      ? `  ·  **LEVEL UP → Lv.${outcome.newLevel}**`
      : '';

    const embed = new EmbedBuilder()
      .setColor(outcome.isShiny ? 0xfacc15 : 0x10b981)
      .setAuthor({
        name: `Bắt thành công  ·  ${ball.name}`,
        iconURL: ball.iconUrl,
      })
      .setTitle(`${shinyPrefix}${formatDexNo(outcome.species.dexNumber)}  ${outcome.species.name}`)
      .setDescription(
        `${ballMention} **${trainerDisplayName}** đã thu phục thành công!${levelLine}\n\`${RARITY_LABELS[outcome.species.rarity]}\`  ${formatTypeTags(outcome.species.types)}`,
      )
      .addFields(
        {
          name: 'Tiềm Năng IV',
          value: `\`${buildIvProgressBar(outcome.ivPercent)}\`  **${outcome.ivPercent}%**\n${outcome.ivTotal} / 186 IVs`,
          inline: true,
        },
        {
          name: 'Phần Thưởng',
          value: `**+${formatNumber(outcome.coinsEarned)} PC**\n**+${outcome.xpEarned} XP** · Tỉ lệ ${chancePct}%`,
          inline: true,
        },
      )
      .setFooter({
        text: `PokeNyan  ·  Số dư ${formatNumber(outcome.newCoinsBalance)} PC  ·  Lv.${outcome.newLevel}`,
      });

    if (
      outcome.isShiny ||
      outcome.species.rarity === 'legendary' ||
      outcome.species.rarity === 'mega'
    ) {
      embed.setImage(spriteUrl);
    } else {
      embed.setThumbnail(spriteUrl);
    }
    return embed;
  }

  return new EmbedBuilder()
    .setColor(0xef4444)
    .setAuthor({
      name: `Đã bỏ chạy  ·  ${ball.name}`,
      iconURL: ball.iconUrl,
    })
    .setTitle(`${shinyPrefix}${formatDexNo(outcome.species.dexNumber)}  ${outcome.species.name}`)
    .setDescription(
      `**${trainerDisplayName}** đã ném ${ballMention} **${ball.name}** (tỉ lệ **${chancePct}%**) nhưng Pokémon đã thoát ra ngoài.`,
    )
    .setThumbnail(spriteUrl)
    .setFooter({ text: 'PokeNyan  ·  Gõ /p để tiếp tục tìm kiếm' });
}

export function buildShopEmbed(prefix: string): EmbedBuilder {
  const lines = BALL_CATALOG.map((ball) => {
    const icon = botEmojiRegistry.getBallMention(ball.id);
    return `${icon} **${ball.name}** (\`${ball.shortCode}\`) — **${formatNumber(ball.price)} PC**\n└ ${ball.description}`;
  });

  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('Cửa Hàng PokeNyan')
    .setDescription(
      [
        ...lines,
        '',
        `Cách mua: \`/buy ball:pokeball quantity:10\` hoặc \`${prefix}buy pb 10\``,
      ].join('\n'),
    )
    .setFooter({ text: 'PokeNyan  ·  Cửa hàng vật phẩm' });
}

export function buildBagEmbed(summary: TrainerBagSummary): EmbedBuilder {
  const ballLines = BALL_CATALOG.map((ball) => {
    const icon = botEmojiRegistry.getBallMention(ball.id);
    return `${icon} **${ball.name}** (\`${ball.shortCode}\`): **${summary.balls[ball.id]}**`;
  });

  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(`Túi Đồ · ${summary.displayName || summary.username}`)
    .setDescription(
      [
        `PokéCoins: **${formatNumber(summary.coins)} PC**`,
        `Bộ sưu tập: **${summary.activeCreatureCount}** Pokémon (**${summary.uniqueSpeciesCount}/${defaultCreatureCatalog.getAll().length}** loài)`,
        '',
        '**Kho Poké Ball**',
        ...ballLines,
      ].join('\n'),
    )
    .setThumbnail(summary.avatarUrl || null)
    .setFooter({ text: 'PokeNyan  ·  Kho đồ cá nhân' });
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
          const shiny = c.isShiny ? '★ ' : '';
          return `\`#${idx + 1}\` ${shiny}**${c.speciesName}** (\`${c.rarity.toUpperCase()}\`) — **${c.ivPercent}% IV**`;
        })
      : ['Chưa bắt được Pokémon nào. Hãy dùng `/p` ngay!'];

  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`Hồ Sơ Huấn Luyện Viên · ${summary.displayName || summary.username}`)
    .setThumbnail(summary.avatarUrl || null)
    .addFields(
      {
        name: 'Cấp Độ & Kinh Nghiệm',
        value: `Level **${summary.level}**\nXP: **${summary.xp} / ${nextXp}**`,
        inline: true,
      },
      {
        name: 'Kinh Tế & Chuỗi Ngày',
        value: `**${formatNumber(summary.coins)} PC**\nStreak: **${summary.dailyStreak} ngày**`,
        inline: true,
      },
      {
        name: 'Thành Tích Bắt',
        value: `Đã bắt: **${formatNumber(summary.totalCatches)}** (${catchRate}%)\nShiny: **${summary.shinyCatches}**  ·  Loài: **${summary.uniqueSpeciesCount}/${defaultCreatureCatalog.getAll().length}**`,
        inline: false,
      },
      {
        name: 'Top Pokémon Nổi Bật',
        value: topLines.join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: 'PokeNyan  ·  Hồ sơ huấn luyện viên' });
}

export function buildDexEmbed(
  trainerDisplayName: string,
  dex: PaginatedDexResult,
): EmbedBuilder {
  const filterBadge = dex.filter ? `  [${dex.filter.toUpperCase()}]` : '';
  const lines =
    dex.items.length > 0
      ? dex.items.map((item, index) => {
          const globalIndex = (dex.page - 1) * 10 + index + 1;
          const shiny = item.isShiny ? '★ ' : '';
          const fav = item.isFavorite ? '♥ ' : '';
          const shortId = item.id.slice(-6);
          return `\`${globalIndex}.\` ${fav}${shiny}**${item.speciesName}** \`${formatDexNo(item.speciesId)}\` — \`${item.rarity.toUpperCase()}\` · **${item.ivPercent}% IV** · \`#${shortId}\``;
        })
      : [
          dex.filter
            ? `Không có Pokémon nào khớp bộ lọc \`${dex.filter}\`.`
            : 'Kho Pokémon của bạn đang trống. Dùng `/p` để bắt Pokémon đầu tiên!',
        ];

  return new EmbedBuilder()
    .setColor(0x14b8a6)
    .setTitle(`Pokédex · ${trainerDisplayName}${filterBadge}`)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: `Trang ${dex.page}/${dex.totalPages}  ·  ${dex.totalCount} Pokémon  ·  Dùng /fav <#mã> để khóa yêu thích`,
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
      .setTitle('Đã điểm danh hôm nay')
      .setDescription(
        [
          `Huấn luyện viên: **${trainerDisplayName}**`,
          `Chuỗi hiện tại: **${result.streak} ngày**`,
          `Quay lại nhận thưởng tiếp theo: <t:${nextEpoch}:R>`,
        ].join('\n'),
      )
      .setFooter({ text: 'PokeNyan  ·  Điểm danh hàng ngày' });
  }

  const pbIcon = botEmojiRegistry.getBallMention('pokeball');
  const gbIcon = botEmojiRegistry.getBallMention('greatball');

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('Điểm Danh Hàng Ngày Thành Công')
    .setDescription(
      [
        `Huấn luyện viên: **${trainerDisplayName}**`,
        `Chuỗi điểm danh: **${result.streak} ngày**`,
        `Nhận: **+${formatNumber(result.coinsEarned)} PC**`,
        `${pbIcon} Poké Ball **+${result.pokeballsEarned}**  ·  ${gbIcon} Great Ball **+${result.greatballsEarned}**`,
        `Số dư hiện tại: **${formatNumber(result.newCoinsBalance)} PC**`,
      ].join('\n'),
    )
    .setFooter({ text: 'PokeNyan  ·  Điểm danh hàng ngày' });
}

export function buildReleaseEmbed(
  trainerDisplayName: string,
  result: ReleaseResult,
): EmbedBuilder {
  if (result.releasedCount === 0) {
    return new EmbedBuilder()
      .setColor(0x64748b)
      .setTitle('Không có Pokémon trùng để thả')
      .setDescription(
        `${trainerDisplayName} hiện không có Pokémon trùng nào (hệ thống luôn giữ IV cao nhất mỗi loài, toàn bộ **Shiny**, **Legendary** và Pokémon đã gắn **♥ Yêu thích**).`,
      )
      .setFooter({ text: 'PokeNyan  ·  Quản lý bộ sưu tập' });
  }

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('Đã Thả Pokémon Trùng Thành Công')
    .setDescription(
      [
        `Huấn luyện viên: **${trainerDisplayName}**`,
        `Số Pokémon đã thả: **${result.releasedCount}** (giữ IV cao nhất, Shiny, Legendary & Yêu thích)`,
        `Tiền thưởng thu về: **+${formatNumber(result.coinsEarned)} PC**`,
        `Số dư mới: **${formatNumber(result.newCoinsBalance)} PC**`,
      ].join('\n'),
    )
    .setFooter({ text: 'PokeNyan  ·  Quản lý bộ sưu tập' });
}

export function buildLeaderboardEmbed(
  metric: LeaderboardMetric,
  entries: readonly LeaderboardEntry[],
): EmbedBuilder {
  const metricTitles: Record<LeaderboardMetric, string> = {
    catches: 'Bảng Xếp Hạng · Tổng Lượt Bắt',
    coins: 'Bảng Xếp Hạng · Đại Gia PokéCoins',
    shinies: 'Bảng Xếp Hạng · Thợ Săn Shiny',
    level: 'Bảng Xếp Hạng · Cấp Độ Huấn Luyện Viên',
  };

  const lines =
    entries.length > 0
      ? entries.map((entry) => {
          const rankLabel = `\`#${String(entry.rank).padStart(2, '0')}\``;
          return `${rankLabel} **${entry.displayName}** — Lv.${entry.level}  ·  ${formatNumber(entry.totalCatches)} bắt  ·  ★ ${entry.shinyCatches}  ·  **${formatNumber(entry.coins)} PC**`;
        })
      : ['Chưa có huấn luyện viên nào trên bảng xếp hạng.'];

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(metricTitles[metric])
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'PokeNyan  ·  Bảng xếp hạng cộng đồng' });
}

export function buildHelpEmbed(prefix: string, botName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`Hướng Dẫn Chơi · ${botName}`)
    .setDescription(
      [
        `Hỗ trợ **Slash Commands** (\`/\`), **Prefix** (\`${prefix}\`) hoặc **Mention** (\`@${botName} p\`):`,
        '',
        `• \`/p\` hoặc \`${prefix}p\` — Tìm và bắt Pokémon hoang dã`,
        `• \`/shop\` hoặc \`${prefix}shop\` — Xem cửa hàng Poké Ball`,
        `• \`/buy\` hoặc \`${prefix}buy pb 10\` — Mua bóng (\`pb\`, \`gb\`, \`ub\`, \`prb\`, \`mb\`)`,
        `• \`/bag\` hoặc \`${prefix}bag\` — Xem túi đồ và số dư PokéCoins`,
        `• \`/dex [page] [filter]\` hoặc \`${prefix}dex shiny\` — Xem & lọc Pokédex`,
        `• \`/fav [tên|#mã]\` hoặc \`${prefix}fav\` — Khóa/mở khóa Pokémon yêu thích`,
        `• \`/profile\` hoặc \`${prefix}profile\` — Xem hồ sơ huấn luyện viên`,
        `• \`/release\` hoặc \`${prefix}release\` — Thả Pokémon trùng để kiếm thêm PC`,
        `• \`/daily\` hoặc \`${prefix}daily\` — Nhận thưởng điểm danh mỗi 24 giờ`,
        `• \`/lb\` hoặc \`${prefix}lb [catches|coins|shinies|level]\` — Xem bảng xếp hạng`,
        '',
        '**Lệnh Quản Trị Viên (Admin / Manage Server)**',
        `• \`/bot <on|off|status>\` hoặc \`${prefix}bot <on|off|status>\` — Bật/tắt bot trong server`,
        `• \`/prefix [ký_tự]\` hoặc \`${prefix}prefix n!\` — Đổi prefix riêng để tránh trùng bot khác`,
        `• \`/channel <allow|block|list|reset>\` hoặc \`${prefix}channel allow\` — Giới hạn kênh bot`,
        '',
        `*${FAN_DISCLAIMER}. Chỉ nhận ủng hộ tự nguyện để duy trì server.*`,
      ].join('\n'),
    );
}

export function buildBotStatusEmbed(
  botName: string,
  state: GuildToggleState,
  changedBy?: string,
): EmbedBuilder {
  if (state.enabled) {
    const actorLine = changedBy ? `Kích hoạt bởi: **${changedBy}**` : 'Bot đang hoạt động bình thường.';
    return new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle(`ONLINE · ${botName} đang bật trong server này`)
      .setDescription(
        [
          actorLine,
          'Mọi người chơi đều có thể dùng lệnh tìm Pokémon, cửa hàng và các tính năng khác.',
        ].join('\n'),
      )
      .setFooter({ text: `${botName}  ·  Quản trị server` });
  }

  const actor = changedBy ?? state.disabledBy ?? 'Quản trị viên';
  const timeInfo = state.disabledAt
    ? `<t:${Math.floor(state.disabledAt.getTime() / 1000)}:R>`
    : 'vừa xong';

  return new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle(`OFFLINE · ${botName} đang tắt trong server này`)
    .setDescription(
      [
        `Tạm tắt bởi: **${actor}** (${timeInfo})`,
        'Bot sẽ không phản hồi các lệnh chơi game cho đến khi Admin bật lại bằng `/bot on`.',
      ].join('\n'),
    )
    .setFooter({ text: `${botName}  ·  Quản trị server` });
}

export function buildPrefixEmbed(
  botName: string,
  prefix: string,
  updatedBy?: string,
): EmbedBuilder {
  const header = updatedBy
    ? `Đã cập nhật bởi **${updatedBy}**`
    : 'Prefix hiện tại của server này';

  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`Prefix · ${botName}`)
    .setDescription(
      [
        `${header}: \`${prefix}\``,
        `Ví dụ dùng lệnh: \`${prefix}p\`, \`${prefix}shop\`, \`${prefix}dex shiny\`, hoặc tag \`@${botName} p\`.`,
      ].join('\n'),
    )
    .setFooter({ text: `${botName}  ·  Cấu hình server` });
}

export function buildChannelSettingsEmbed(
  botName: string,
  settings: GuildSettings,
): EmbedBuilder {
  const allowedText =
    settings.allowedChannels.length > 0
      ? settings.allowedChannels.map((id) => `<#${id}>`).join(', ')
      : '*Tất cả kênh (trừ các kênh bị chặn)*';
  const blockedText =
    settings.blockedChannels.length > 0
      ? settings.blockedChannels.map((id) => `<#${id}>`).join(', ')
      : '*Không có kênh nào bị chặn*';

  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(`Phạm Vi Kênh Hoạt Động · ${botName}`)
    .addFields(
      { name: 'Kênh Được Phép (Whitelist)', value: allowedText, inline: false },
      { name: 'Kênh Bị Chặn (Blacklist)', value: blockedText, inline: false },
    )
    .setFooter({ text: `${botName}  ·  Cấu hình server` });
}
