import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { BALL_CATALOG, getBallSpec } from '@/game/catalog/ball-catalog';
import { defaultCreatureCatalog, RARITY_CONFIGS } from '@/game/catalog/creature-catalog';
import { xpForNextLevel } from '@/game/engine/spawn-engine';
import type { GuildSettings, GuildToggleState } from '@/game/services/guild-config-service';
import {
  MEGA_REQUIRED_LEGENDARIES,
  MEGA_SACRIFICE_COUNT,
  type MegaExecuteOutcome,
  type MegaPreviewOutcome,
  type MegaProgressSummary,
} from '@/game/services/mega-service';
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
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  super_rare: 'Super Rare',
  legendary: 'Legendary',
  mega: 'Mega / Primal',
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

function formatTypeBadges(types: readonly string[]): string {
  return types
    .map((typeName) => {
      const icon = botEmojiRegistry.getTypeMention(typeName);
      return icon ? `${icon} **${typeName}**` : `\`${typeName.toUpperCase()}\``;
    })
    .join('  ·  ');
}

function formatRarityBadge(rarity: RarityTier, isShiny = false): string {
  const rarityIcon = botEmojiRegistry.getRarityMention(rarity);
  const label = RARITY_LABELS[rarity];
  const base = rarityIcon ? `${rarityIcon} **${label}**` : `\`${label.toUpperCase()}\``;
  if (!isShiny) {
    return base;
  }
  const shinyIcon = botEmojiRegistry.getShinyMention();
  return `${base}  ·  ${shinyIcon} **Shiny**`;
}

function ansiBanner(ansiLine: string): string {
  return `\`\`\`ansi\n${ansiLine}\n\`\`\``;
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
  const shinyPrefix = roll.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
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
      [
        `${formatRarityBadge(roll.species.rarity, roll.isShiny)}  |  ${formatTypeBadges(roll.species.types)}`,
        `Bỏ chạy <t:${expireEpoch}:R>${rescueLine}`,
      ].join('\n'),
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
  const shinyPrefix = isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
  const spriteUrl = isShiny ? species.shinyAnimatedSpriteUrl : species.animatedSpriteUrl;

  return new EmbedBuilder()
    .setColor(0x475569)
    .setTitle(`${shinyPrefix}${formatDexNo(species.dexNumber)}  ${species.name}`)
    .setDescription(
      [
        ansiBanner(`\u001b[1;30m⏱  HẾT GIỜ  ·  ${species.name.toUpperCase()} ĐÃ BỎ ĐI\u001b[0m`),
        `Pokémon hoang dã của **${trainerDisplayName}** đã rời đi trước khi bạn kịp ném bóng.`,
      ].join('\n'),
    )
    .setThumbnail(spriteUrl)
    .setFooter({ text: 'PokeNyan  ·  Gõ ;p hoặc /p để tiếp tục tìm kiếm' });
}

export function buildThrowingEmbed(
  trainerDisplayName: string,
  species: CreatureSpecies,
  isShiny: boolean,
  ballId: BallId,
): EmbedBuilder {
  const ball = getBallSpec(ballId);
  const shakeMention = botEmojiRegistry.getBallShakeMention(ballId);
  const shakeGifUrl = botEmojiRegistry.getBallShakeGifUrl(ballId);
  const shinyPrefix = isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
  const spriteUrl = isShiny ? species.shinyAnimatedSpriteUrl : species.animatedSpriteUrl;

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setAuthor({
      name: `${ball.name}  ·  Đang thu phục`,
      iconURL: ball.iconUrl,
    })
    .setTitle(`${shinyPrefix}${formatDexNo(species.dexNumber)}  ${species.name}`)
    .setDescription(
      [
        `${shakeMention} **${trainerDisplayName}** đã ném **${ball.name}**!`,
        ansiBanner(`\u001b[1;33m●  QUẢ BÓNG ĐANG RUNG LẮC DỮ DỘI...\u001b[0m`),
      ].join('\n'),
    )
    .setThumbnail(spriteUrl)
    .setFooter({ text: 'PokeNyan  ·  Đang chờ kết quả bắt' });

  if (shakeGifUrl) {
    embed.setImage(shakeGifUrl);
  }
  return embed;
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
  const shinyPrefix = outcome.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
  const chancePct = (outcome.catchChance * 100).toFixed(1);

  if (outcome.caught) {
    const levelLine = outcome.leveledUp
      ? `  ·  **LEVEL UP → Lv.${outcome.newLevel}**`
      : '';
    const highlightLine = outcome.isShiny
      ? ansiBanner(
          `\u001b[1;33m★  BẮT THÀNH CÔNG SHINY  ·  ${outcome.species.name.toUpperCase()}!\u001b[0m`,
        )
      : ansiBanner(
          `\u001b[1;32m✔  BẮT THÀNH CÔNG  ·  ${outcome.species.name.toUpperCase()}!\u001b[0m`,
        );

    const embed = new EmbedBuilder()
      .setColor(outcome.isShiny ? 0xfacc15 : 0x10b981)
      .setAuthor({
        name: `Bắt thành công  ·  ${ball.name}`,
        iconURL: ball.iconUrl,
      })
      .setTitle(`${shinyPrefix}${formatDexNo(outcome.species.dexNumber)}  ${outcome.species.name}`)
      .setDescription(
        [
          highlightLine,
          `${ballMention} **${trainerDisplayName}** đã thu phục thành công!${levelLine}`,
          `${formatRarityBadge(outcome.species.rarity, outcome.isShiny)}  |  ${formatTypeBadges(outcome.species.types)}`,
        ].join('\n'),
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
      name: `Bắt hụt  ·  ${ball.name}`,
      iconURL: ball.iconUrl,
    })
    .setTitle(`${shinyPrefix}${formatDexNo(outcome.species.dexNumber)}  ${outcome.species.name}`)
    .setDescription(
      [
        ansiBanner(
          `\u001b[1;31m✖  BẮT HỤT  ·  ${outcome.species.name.toUpperCase()} ĐÃ CHẠY THOÁT!\u001b[0m`,
        ),
        `${ballMention} **${trainerDisplayName}** đã ném **${ball.name}** (tỉ lệ **${chancePct}%**) nhưng Pokémon đã vùng thoát ra ngoài.`,
      ].join('\n'),
    )
    .setThumbnail(spriteUrl)
    .setFooter({ text: 'PokeNyan  ·  Gõ ;p hoặc /p để tiếp tục tìm kiếm' });
}

export function buildShopEmbed(prefix: string): EmbedBuilder {
  const formatShopLine = (ball: (typeof BALL_CATALOG)[number]): string => {
    const icon = botEmojiRegistry.getBallMention(ball.id);
    const multText = ball.id === 'masterball' ? '100%' : `${ball.multiplier}x`;
    return `\`[${ball.shopIndex}]\` ${icon} **${ball.name}** (\`${ball.shortCode}\`) — **${formatNumber(ball.price)} PC** · \`${multText}\`\n└ ${ball.description}`;
  };

  const standardLines = BALL_CATALOG.filter((b) => b.category === 'standard').map(formatShopLine);
  const specialLines = BALL_CATALOG.filter((b) => b.category === 'special').map(formatShopLine);

  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('Cửa Hàng PokeNyan  ·  Danh Mục Vật Phẩm')
    .setDescription(
      `Gõ \`${prefix}s b <mục> [số_lượng]\` hoặc \`${prefix}b <mục|mã> [số_lượng]\` để mua nhanh:`,
    )
    .addFields(
      {
        name: 'Mục 1 · Bóng Cơ Bản ([1] – [3])',
        value: standardLines.join('\n'),
        inline: false,
      },
      {
        name: 'Mục 2 · Bóng Hiếm & Tối Thượng ([4] – [5])',
        value: specialLines.join('\n'),
        inline: false,
      },
      {
        name: 'Ví Dụ Mua Nhanh',
        value: [
          `• \`${prefix}s b 1 10\` → Mua 10 **Poké Ball**`,
          `• \`${prefix}s b 3 5\` → Mua 5 **Ultra Ball**`,
          `• \`${prefix}s b 5 1\` hoặc \`/buy\` → Mua 1 **Master Ball**`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: `PokeNyan  ·  Cửa hàng vật phẩm` });
}

export function buildPurchaseSuccessEmbed(
  trainerDisplayName: string,
  ballId: BallId,
  quantityBought: number,
  totalCost: number,
  newBallQuantity: number,
  newCoinsBalance: number,
): EmbedBuilder {
  const ball = getBallSpec(ballId);
  const ballMention = botEmojiRegistry.getBallMention(ballId);

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setAuthor({ name: `Giao dịch thành công · ${trainerDisplayName}`, iconURL: ball.iconUrl })
    .setDescription(
      [
        ansiBanner(
          `\u001b[1;32m✔  ĐÃ MUA ${quantityBought}x ${ball.name.toUpperCase()}  (-${formatNumber(totalCost)} PC)\u001b[0m`,
        ),
        `${ballMention} **${ball.name}** (\`[${ball.shopIndex}]\` / \`${ball.shortCode}\`): hiện có **${newBallQuantity}** quả`,
        `Số dư còn lại: **${formatNumber(newCoinsBalance)} PC**`,
      ].join('\n'),
    )
    .setFooter({ text: 'PokeNyan  ·  Cửa hàng vật phẩm' });
}

export function buildBagEmbed(summary: TrainerBagSummary): EmbedBuilder {
  const ballLines = BALL_CATALOG.map((ball) => {
    const icon = botEmojiRegistry.getBallMention(ball.id);
    return `\`[${ball.shopIndex}]\` ${icon} **${ball.name}** (\`${ball.shortCode}\`): **${summary.balls[ball.id]}**`;
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
          const shiny = c.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
          const rarIcon =
            c.rarity === 'common' ||
            c.rarity === 'uncommon' ||
            c.rarity === 'rare' ||
            c.rarity === 'super_rare' ||
            c.rarity === 'legendary' ||
            c.rarity === 'mega'
              ? `${botEmojiRegistry.getRarityMention(c.rarity)} `
              : '';
          return `\`#${idx + 1}\` ${rarIcon}${shiny}**${c.speciesName}** — **${c.ivPercent}% IV**`;
        })
      : ['Chưa bắt được Pokémon nào. Hãy dùng `;p` hoặc `/p` ngay!'];

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
          const species = defaultCreatureCatalog.getById(item.speciesId);
          const dexNo = species?.dexNumber ?? item.speciesId;
          const shiny = item.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
          const fav = item.isFavorite ? '♥ ' : '';
          const rarIcon =
            item.rarity === 'common' ||
            item.rarity === 'uncommon' ||
            item.rarity === 'rare' ||
            item.rarity === 'super_rare' ||
            item.rarity === 'legendary' ||
            item.rarity === 'mega'
              ? `${botEmojiRegistry.getRarityMention(item.rarity)} `
              : '';
          const shortId = item.id.slice(-6);
          return `\`${globalIndex}.\` ${fav}${rarIcon}${shiny}**${item.speciesName}** \`${formatDexNo(dexNo)}\` — **${item.ivPercent}% IV** · \`#${shortId}\``;
        })
      : [
          dex.filter
            ? `Không có Pokémon nào khớp bộ lọc \`${dex.filter}\`.`
            : 'Kho Pokémon của bạn đang trống. Dùng `;p` hoặc `/p` để bắt Pokémon đầu tiên!',
        ];

  return new EmbedBuilder()
    .setColor(0x14b8a6)
    .setTitle(`Pokédex · ${trainerDisplayName}${filterBadge}`)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: `Trang ${dex.page}/${dex.totalPages}  ·  ${dex.totalCount} Pokémon  ·  Dùng ;f <#mã> để khóa yêu thích`,
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
        ansiBanner(`\u001b[1;32m✔  ĐIỂM DANH NGÀY ${result.streak}  (+${formatNumber(result.coinsEarned)} PC)\u001b[0m`),
        `Huấn luyện viên: **${trainerDisplayName}**`,
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
        `${trainerDisplayName} hiện không có Pokémon trùng nào (hệ thống luôn giữ IV cao nhất mỗi loài, toàn bộ **Shiny**, **Legendary**, **Mega** và Pokémon đã gắn **♥ Yêu thích**).`,
      )
      .setFooter({ text: 'PokeNyan  ·  Quản lý bộ sưu tập' });
  }

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('Đã Thả Pokémon Trùng Thành Công')
    .setDescription(
      [
        ansiBanner(`\u001b[1;32m✔  ĐÃ THẢ ${result.releasedCount} POKÉMON TRÙNG  (+${formatNumber(result.coinsEarned)} PC)\u001b[0m`),
        `Huấn luyện viên: **${trainerDisplayName}** (giữ IV cao nhất, Shiny, Legendary, Mega & Yêu thích)`,
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
    .setTitle(`Hướng Dẫn Lệnh · ${botName}`)
    .setDescription(
      [
        `Hỗ trợ **Slash Commands** (\`/\`), **Prefix** (\`${prefix}\`), lệnh viết tắt kiểu PokéMeow hoặc **Mention** (\`@${botName} p\`):`,
        '',
        `• \`${prefix}p\` / \`/p\` — Tìm & bắt Pokémon hoang dã`,
        `• \`${prefix}s\` / \`/shop\` — Xem cửa hàng phân mục đánh số \`[1]\`–\`[5]\``,
        `• \`${prefix}s b 1 10\` / \`${prefix}b pb 10\` / \`/buy\` — Mua nhanh theo số mục hoặc mã bóng`,
        `• \`${prefix}i\` / \`/bag\` — Xem túi đồ & số dư PokéCoins`,
        `• \`${prefix}d [shiny|mega|fav|tên]\` / \`/dex\` — Xem & lọc Pokédex`,
        `• \`${prefix}f [tên|#mã]\` / \`/fav\` — Khóa/mở khóa Pokémon yêu thích`,
        `• \`${prefix}pf\` / \`/profile\` — Xem hồ sơ huấn luyện viên`,
        `• \`${prefix}r\` / \`${prefix}r d\` / \`/release\` — Thả Pokémon trùng kiếm PC`,
        `• \`${prefix}dl\` / \`/daily\` — Điểm danh nhận thưởng mỗi 24 giờ`,
        `• \`${prefix}m [tên]\` / \`/mega\` — Nghi thức hiến tế 5/6 Legend lên Mega`,
        `• \`${prefix}lb\` / \`/lb\` — Xem bảng xếp hạng cộng đồng`,
        '',
        '**Lệnh Quản Trị Viên (Admin / Manage Server)**',
        `• \`${prefix}bot <on|off|status>\` / \`/bot\` — Bật/tắt bot trong server`,
        `• \`${prefix}prefix [ký_tự]\` / \`/prefix\` — Đổi prefix riêng để tránh trùng bot khác`,
        `• \`${prefix}channel <allow|block|list|reset>\` / \`/channel\` — Giới hạn kênh bot`,
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
        `Ví dụ dùng lệnh: \`${prefix}p\`, \`${prefix}s b 1 10\`, \`${prefix}d shiny\`, hoặc tag \`@${botName} p\`.`,
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

export function buildMegaConfirmRow(
  ownerUserId: string,
  megaSpeciesId: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mega:confirm:${ownerUserId}:${megaSpeciesId}`)
      .setLabel(`Xác nhận Hiến Tế (${MEGA_SACRIFICE_COUNT} Legend)`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`mega:cancel:${ownerUserId}`)
      .setLabel('Hủy nghi thức')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildMegaOverviewEmbed(
  trainerDisplayName: string,
  progress: MegaProgressSummary,
  prefix: string,
): EmbedBuilder {
  const readyMegas =
    progress.availableMegas.length > 0
      ? progress.availableMegas
          .slice(0, 12)
          .map((m) => {
            const shiny = m.baseIsShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
            return `• **${m.megaSpecies.name}** (${shiny}${m.baseBestIv}% IV gốc) — \`${prefix}m ${m.megaSpecies.name.toLowerCase()}\``;
          })
          .join('\n') +
        (progress.availableMegas.length > 12
          ? `\n*...và còn ${progress.availableMegas.length - 12} dạng Mega khác sẵn sàng trong kho.*`
          : '')
      : 'Bạn chưa sở hữu Pokémon dạng gốc nào có khả năng tiến hóa Mega / Primal.';

  const conditionMet =
    progress.totalLegendaries >= MEGA_REQUIRED_LEGENDARIES &&
    progress.sacrificableLegendaries >= MEGA_SACRIFICE_COUNT;

  const legendIcon = botEmojiRegistry.getRarityMention('legendary');
  const megaIcon = botEmojiRegistry.getRarityMention('mega');

  return new EmbedBuilder()
    .setColor(0xf43f5e)
    .setTitle(`Nghi Thức Thức Tỉnh Mega · ${trainerDisplayName}`)
    .setDescription(
      [
        `Mega / Primal **không xuất hiện ngoài tự nhiên** (\`${prefix}p\`), mà phải thức tỉnh từ dạng gốc.`,
        `**Điều kiện:** Sở hữu Pokémon gốc + đủ **${MEGA_REQUIRED_LEGENDARIES} Legendary**, hiến tế **${MEGA_SACRIFICE_COUNT} con IV thấp nhất** (chừa lại Shiny và Pokémon khóa \`${prefix}f\`).`,
      ].join('\n'),
    )
    .addFields(
      {
        name: 'Tiến Độ Legendary',
        value: `${legendIcon ? `${legendIcon} ` : ''}Đang có: **${progress.totalLegendaries} / ${MEGA_REQUIRED_LEGENDARIES}**\nHợp lệ hiến tế: **${progress.sacrificableLegendaries} / ${MEGA_SACRIFICE_COUNT}**`,
        inline: true,
      },
      {
        name: 'Sở Hữu Mega',
        value: `${megaIcon ? `${megaIcon} ` : ''}**${progress.ownedMegaCount}** Mega / Primal\nTrạng thái: ${conditionMet ? '`SẴN SÀNG`' : '`CHƯA ĐỦ ĐIỀU KIỆN`'}`,
        inline: true,
      },
      {
        name: 'Dạng Mega Khả Dụng Từ Kho Của Bạn',
        value: readyMegas,
        inline: false,
      },
    )
    .setFooter({ text: `PokeNyan  ·  Dùng ${prefix}m <tên> hoặc /mega để thức tỉnh` });
}

export function buildMegaConfirmEmbed(
  trainerDisplayName: string,
  preview: Extract<MegaPreviewOutcome, { readonly ok: true }>,
): EmbedBuilder {
  const shinyTag = preview.baseCreature.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
  const sacrificeLines = preview.sacrificeList
    .map(
      (c, idx) =>
        `\`${idx + 1}.\` **${c.speciesName}** — **${c.ivPercent}% IV** (\`#${c.id.slice(-6)}\`)`,
    )
    .join('\n');

  const spriteUrl = preview.baseCreature.isShiny
    ? preview.megaSpecies.shinyAnimatedSpriteUrl
    : preview.megaSpecies.animatedSpriteUrl;

  return new EmbedBuilder()
    .setColor(0xf43f5e)
    .setTitle(`Xác Nhận Thức Tỉnh · ${shinyTag}${preview.megaSpecies.name}`)
    .setDescription(
      `Huấn luyện viên **${trainerDisplayName}** chuẩn bị nâng cấp **${shinyTag}${preview.baseCreature.speciesName}** (**${preview.baseCreature.ivPercent}% IV**) thành **${preview.megaSpecies.name}** (\`BST ${preview.megaSpecies.baseStats.bst}\`).`,
    )
    .addFields({
      name: `5 Pokémon Legendary Sẽ Bị Hiến Tế (không thể hoàn tác)`,
      value: sacrificeLines,
      inline: false,
    })
    .setThumbnail(spriteUrl)
    .setFooter({ text: 'PokeNyan  ·  Bấm Xác nhận bên dưới để tiến hành nghi thức' });
}

export function buildMegaSuccessEmbed(
  trainerDisplayName: string,
  result: Extract<MegaExecuteOutcome, { readonly ok: true }>,
): EmbedBuilder {
  const shinyTag = result.upgradedCreature.isShiny
    ? `${botEmojiRegistry.getShinyMention()} `
    : '';
  const spriteUrl = result.upgradedCreature.isShiny
    ? result.megaSpecies.shinyAnimatedSpriteUrl
    : result.megaSpecies.animatedSpriteUrl;

  return new EmbedBuilder()
    .setColor(0xf43f5e)
    .setTitle(`THỨC TỈNH THÀNH CÔNG · ${shinyTag}${result.megaSpecies.name}`)
    .setDescription(
      [
        ansiBanner(
          `\u001b[1;35m★  THỨC TỈNH MEGA THÀNH CÔNG  ·  ${result.megaSpecies.name.toUpperCase()}!\u001b[0m`,
        ),
        `Chúc mừng **${trainerDisplayName}**! Pokémon mới **${shinyTag}${result.megaSpecies.name}** (**${result.upgradedCreature.ivPercent}% IV**) đã được tự động khóa Yêu thích (\`♥\`).`,
      ].join('\n'),
    )
    .addFields(
      {
        name: 'Hệ & Sức Mạnh',
        value: `${formatTypeBadges(result.megaSpecies.types)}  ·  BST **${result.megaSpecies.baseStats.bst}**`,
        inline: true,
      },
      {
        name: 'Mã Lưu Trữ',
        value: `\`#${result.upgradedCreature.id.slice(-6)}\``,
        inline: true,
      },
    )
    .setImage(spriteUrl)
    .setFooter({ text: 'PokeNyan  ·  Mega Awakening' });
}
