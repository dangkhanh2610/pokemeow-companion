import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
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
import {
  BOX_SORT_LABELS,
  type BoxSortMode,
  type PaginatedBoxResult,
  type ShopWalletSummary,
  type TrainerBagSummary,
} from '@/game/services/trainer-service';
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

const SHINY_COLOR_HEX = 0xe879f9;

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

function isRarityTier(value: string): value is RarityTier {
  return (
    value === 'common' ||
    value === 'uncommon' ||
    value === 'rare' ||
    value === 'super_rare' ||
    value === 'legendary' ||
    value === 'mega'
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatDexNo(id: number): string {
  return `#${String(id).padStart(4, '0')}`;
}

function getIvGrade(ivPercent: number): string {
  if (ivPercent >= 90) {
    return 'Siêu phẩm';
  }
  if (ivPercent >= 75) {
    return 'Xuất sắc';
  }
  if (ivPercent >= 55) {
    return 'Khá';
  }
  if (ivPercent >= 35) {
    return 'Trung bình';
  }
  return 'Thấp';
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
  return `${shinyIcon} **Shiny** · ${base}`;
}

function ansiBanner(ansiLine: string): string {
  return `\`\`\`ansi\n${ansiLine}\n\`\`\``;
}

export function buildCatchButtonsRow(
  encounterId: string,
  ballInventory: Readonly<Record<BallId, number>>,
  disabledAll = false,
  customIdPrefix = 'catch',
): ActionRowBuilder<ButtonBuilder> {
  const buttons = BALL_CATALOG.map((ball) => {
    const qty = ballInventory[ball.id];
    const isMasterAvailable = ball.id === 'masterball' && qty > 0 && !disabledAll;
    const style = isMasterAvailable ? ButtonStyle.Primary : ButtonStyle.Secondary;

    return new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:${encounterId}:${ball.id}`)
      .setLabel(`${BALL_SHORT_LABELS[ball.id]} · ${qty}`)
      .setEmoji(botEmojiRegistry.getBallButtonEmoji(ball.id))
      .setStyle(style)
      .setDisabled(disabledAll || qty <= 0);
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

export type BoxActionRow =
  | ActionRowBuilder<StringSelectMenuBuilder>
  | ActionRowBuilder<ButtonBuilder>;

export function buildBoxComponents(
  ownerUserId: string,
  box: PaginatedBoxResult,
): BoxActionRow[] {
  const encodedFilter = encodeURIComponent(box.filter).slice(0, 40);
  const sortOptions = (Object.keys(BOX_SORT_LABELS) as BoxSortMode[]).map((mode) => ({
    label: BOX_SORT_LABELS[mode],
    value: mode,
    default: mode === box.sort,
  }));

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`boxsort:${ownerUserId}:${encodedFilter}`)
      .setPlaceholder('Đổi kiểu sắp xếp Box...')
      .addOptions(sortOptions),
  );

  if (box.totalPages <= 1) {
    return [selectRow];
  }

  const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `boxpage:${ownerUserId}:${Math.max(1, box.page - 1)}:${box.sort}:${encodedFilter}`,
      )
      .setLabel('◀ Trước')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(box.page <= 1),
    new ButtonBuilder()
      .setCustomId(`boxnoop:${ownerUserId}`)
      .setLabel(`Trang ${box.page}/${box.totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(
        `boxpage:${ownerUserId}:${Math.min(box.totalPages, box.page + 1)}:${box.sort}:${encodedFilter}`,
      )
      .setLabel('Sau ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(box.page >= box.totalPages),
  );

  return [selectRow, pageRow];
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
  const expireEpoch = Math.ceil((expiresAt.getTime() + 400) / 1000);
  const shinyIcon = botEmojiRegistry.getShinyMention();
  const timerIcon = botEmojiRegistry.getTimerMention();
  const shinyPrefix = roll.isShiny ? `${shinyIcon} ` : '';
  const baseCatchPct = Math.round(roll.species.baseCatchRate * 100);

  const calloutLines: string[] = [];
  if (roll.isShiny) {
    calloutLines.push(`${shinyIcon} **PHÁT HIỆN SHINY HIẾM!**`);
  } else if (roll.species.rarity === 'legendary') {
    const legendIcon = botEmojiRegistry.getRarityMention('legendary');
    calloutLines.push(`${legendIcon ? `${legendIcon} ` : ''}**POKÉMON HUYỀN THOẠI XUẤT HIỆN!**`);
  }

  const rescueLine = rescueGranted
    ? `\n${botEmojiRegistry.getBallMention('pokeball')} **Tiếp tế khẩn cấp:** +3 Poké Ball miễn phí vì bạn đã cạn túi!`
    : '';

  return new EmbedBuilder()
    .setColor(roll.isShiny ? SHINY_COLOR_HEX : rarityMeta.colorHex)
    .setAuthor({
      name: `${trainerDisplayName} gặp Pokémon hoang dã!`,
      iconURL: trainerAvatarUrl || undefined,
    })
    .setTitle(`${shinyPrefix}${roll.species.name}  \`${formatDexNo(roll.species.dexNumber)}\``)
    .setDescription(
      [
        ...calloutLines,
        `${formatRarityBadge(roll.species.rarity, roll.isShiny)}  ·  ${formatTypeBadges(roll.species.types)}`,
        `${timerIcon} Bỏ chạy <t:${expireEpoch}:R>${rescueLine}`,
      ].join('\n'),
    )
    .addFields(
      {
        name: 'Chỉ Số IV',
        value: `**${roll.ivPercent}%** (${roll.ivTotal}/186) · *${getIvGrade(roll.ivPercent)}*`,
        inline: true,
      },
      {
        name: 'Thông Số Loài',
        value: `BST **${roll.species.baseStats.bst}** · Tỉ lệ gốc **${baseCatchPct}%**`,
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
  const timerIcon = botEmojiRegistry.getTimerMention();
  const spriteUrl = isShiny ? species.shinyAnimatedSpriteUrl : species.animatedSpriteUrl;

  return new EmbedBuilder()
    .setColor(0x475569)
    .setTitle(`${shinyPrefix}${species.name}  \`${formatDexNo(species.dexNumber)}\``)
    .setDescription(
      [
        ansiBanner(`\u001b[1;30mHẾT GIỜ  ·  ${species.name.toUpperCase()} ĐÃ BỎ ĐI\u001b[0m`),
        `${timerIcon} Pokémon hoang dã của **${trainerDisplayName}** đã rời đi trước khi kịp ném bóng.`,
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
    .setTitle(`${shinyPrefix}${species.name}  \`${formatDexNo(species.dexNumber)}\``)
    .setDescription(
      [
        ansiBanner(`\u001b[1;33mBÓNG ĐANG RUNG LẮC  ·  CHỜ KẾT QUẢ ${species.name.toUpperCase()}...\u001b[0m`),
        `${shakeMention} **${trainerDisplayName}** đã ném **${ball.name}**!`,
      ].join('\n'),
    )
    .setThumbnail(spriteUrl)
    .setFooter({ text: 'PokeNyan  ·  Đang thu phục Pokémon' });

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
  const checkIcon = botEmojiRegistry.getCheckMention();
  const crossIcon = botEmojiRegistry.getCrossMention();
  const coinIcon = botEmojiRegistry.getCoinMention();
  const spriteUrl = outcome.isShiny
    ? outcome.species.shinyAnimatedSpriteUrl
    : outcome.species.animatedSpriteUrl;
  const shinyPrefix = outcome.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
  const chancePct = (outcome.catchChance * 100).toFixed(1);

  if (outcome.caught) {
    const isHighlightTier =
      outcome.isShiny ||
      outcome.species.rarity === 'legendary' ||
      outcome.species.rarity === 'mega';
    const catchColor = outcome.isShiny
      ? SHINY_COLOR_HEX
      : outcome.species.rarity === 'legendary'
        ? RARITY_CONFIGS.legendary.colorHex
        : outcome.species.rarity === 'mega'
          ? RARITY_CONFIGS.mega.colorHex
          : 0x10b981;
    const levelLine = outcome.leveledUp
      ? `  ·  **LÊN CẤP Lv.${outcome.newLevel}**`
      : '';
    const highlightLine = outcome.isShiny
      ? ansiBanner(
          `\u001b[1;35mBẮT THÀNH CÔNG SHINY  ·  ${outcome.species.name.toUpperCase()}!\u001b[0m`,
        )
      : outcome.species.rarity === 'legendary'
        ? ansiBanner(
            `\u001b[1;35mBẮT THÀNH CÔNG LEGENDARY  ·  ${outcome.species.name.toUpperCase()}!\u001b[0m`,
          )
        : ansiBanner(
            `\u001b[1;32mBẮT THÀNH CÔNG  ·  ${outcome.species.name.toUpperCase()}!\u001b[0m`,
          );

    const embed = new EmbedBuilder()
      .setColor(catchColor)
      .setAuthor({
        name: `Thu phục thành công  ·  ${ball.name}`,
        iconURL: ball.iconUrl,
      })
      .setTitle(`${shinyPrefix}${outcome.species.name}  \`${formatDexNo(outcome.species.dexNumber)}\``)
      .setDescription(
        [
          highlightLine,
          `${checkIcon} **${trainerDisplayName}** đã thu phục bằng ${ballMention} **${ball.name}**${levelLine}`,
          `${formatRarityBadge(outcome.species.rarity, outcome.isShiny)}  ·  ${formatTypeBadges(outcome.species.types)}`,
        ].join('\n'),
      )
      .addFields(
        {
          name: 'Chỉ Số IV',
          value: `**${outcome.ivPercent}%** (${outcome.ivTotal}/186) · *${getIvGrade(outcome.ivPercent)}*`,
          inline: true,
        },
        {
          name: 'Phần Thưởng',
          value: `${coinIcon} **+${formatNumber(outcome.coinsEarned)} PC**\n**+${outcome.xpEarned} XP** · Tỉ lệ **${chancePct}%**`,
          inline: true,
        },
        ...(outcome.buddyXp
          ? [
              {
                name: 'Buddy Đồng Hành',
                value: (() => {
                  const b = outcome.buddyXp;
                  const bShiny = b.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
                  const xpText =
                    b.xpGained > 0 ? `**+${formatNumber(b.xpGained)} XP**` : '**MAX**';
                  const barText =
                    b.nextLevelXp > 0
                      ? `${formatNumber(b.newXp)}/${formatNumber(b.nextLevelXp)} XP`
                      : 'MAX';
                  const lvUp =
                    b.levelsGained > 0
                      ? `\n${checkIcon} **TĂNG CẤP! (+${b.levelsGained} → Lv.${b.newLevel})**`
                      : '';
                  const evoTip = b.canEvolve ? ' · *Đủ cấp tiến hóa (`;ev`)*' : '';
                  return `${bShiny}**${b.buddyName}** (${xpText}) — \`Lv.${b.newLevel}\` (${barText})${lvUp}${evoTip}`;
                })(),
                inline: false,
              },
            ]
          : []),
      )
      .setFooter({
        text: `PokeNyan  ·  Số dư ${formatNumber(outcome.newCoinsBalance)} PC  ·  Lv.${outcome.newLevel}`,
      });

    if (isHighlightTier) {
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
    .setTitle(`${shinyPrefix}${outcome.species.name}  \`${formatDexNo(outcome.species.dexNumber)}\``)
    .setDescription(
      [
        ansiBanner(
          `\u001b[1;31mBẮT HỤT  ·  ${outcome.species.name.toUpperCase()} ĐÃ CHẠY THOÁT!\u001b[0m`,
        ),
        `${crossIcon} **${trainerDisplayName}** ném ${ballMention} **${ball.name}** (tỉ lệ **${chancePct}%**) nhưng Pokémon đã thoát ra ngoài.`,
      ].join('\n'),
    )
    .setThumbnail(spriteUrl)
    .setFooter({ text: 'PokeNyan  ·  Gõ ;p hoặc /p để tiếp tục tìm kiếm' });
}

export function buildShopEmbed(
  prefix: string,
  wallet?: ShopWalletSummary | null,
): EmbedBuilder {
  const coinIcon = botEmojiRegistry.getCoinMention();

  const formatShopLine = (ball: (typeof BALL_CATALOG)[number]): string => {
    const icon = botEmojiRegistry.getBallMention(ball.id);
    const multText = ball.id === 'masterball' ? '100%' : `${ball.multiplier}x`;
    const ownedText = wallet ? ` · *Đang có: ${formatNumber(wallet.balls[ball.id])}*` : '';
    return `\`[${ball.shopIndex}]\` ${icon} **${ball.name}** (\`${ball.shortCode}\`) — ${coinIcon} **${formatNumber(ball.price)}** · \`${multText}\`${ownedText}\n└ ${ball.description}`;
  };

  const standardLines = BALL_CATALOG.filter((b) => b.category === 'standard').map(formatShopLine);
  const specialLines = BALL_CATALOG.filter((b) => b.category === 'special').map(formatShopLine);

  const headerLines = wallet
    ? [
        `${coinIcon} Số dư hiện có: **${formatNumber(wallet.coins)} PC**`,
        `Mua nhanh: \`${prefix}s b <số_mục> [sl]\` (vd: \`${prefix}s b 1 10\`) · \`${prefix}b pb 10\` · \`/buy\``,
      ]
    : [
        `Mua nhanh: \`${prefix}s b <số_mục> [sl]\` (vd: \`${prefix}s b 1 10\`) · \`${prefix}b pb 10\` · \`/buy\``,
      ];

  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('Cửa Hàng Poké Ball')
    .setDescription(headerLines.join('\n'))
    .addFields(
      {
        name: 'Bóng Tiêu Chuẩn ([1] – [3])',
        value: standardLines.join('\n'),
        inline: false,
      },
      {
        name: 'Bóng Cao Cấp ([4] – [5])',
        value: specialLines.join('\n'),
        inline: false,
      },
    )
    .setFooter({
      text: `PokeNyan  ·  Ví dụ: ${prefix}s b 1 10 (Poké Ball)  ·  ${prefix}s b 3 5 (Ultra Ball)  ·  /buy`,
    });
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
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setAuthor({ name: `Giao dịch thành công · ${trainerDisplayName}`, iconURL: ball.iconUrl })
    .setDescription(
      [
        `${checkIcon} Đã mua **${quantityBought}x** ${ballMention} **${ball.name}** (-${coinIcon} **${formatNumber(totalCost)} PC**)`,
        `Trong túi hiện có: **${formatNumber(newBallQuantity)}** ${ball.name} (\`[${ball.shopIndex}]\` / \`${ball.shortCode}\`)`,
        `Số dư còn lại: ${coinIcon} **${formatNumber(newCoinsBalance)} PC**`,
      ].join('\n'),
    )
    .setFooter({ text: 'PokeNyan  ·  Cửa hàng vật phẩm' });
}

export function buildBagEmbed(summary: TrainerBagSummary, prefix = ';'): EmbedBuilder {
  const coinIcon = botEmojiRegistry.getCoinMention();
  const shinyIcon = botEmojiRegistry.getShinyMention();
  const totalSpecies = defaultCreatureCatalog.getAll().length;
  const totalBalls = BALL_CATALOG.reduce((sum, ball) => sum + summary.balls[ball.id], 0);

  const ballLines = BALL_CATALOG.map((ball) => {
    const icon = botEmojiRegistry.getBallMention(ball.id);
    return `\`[${ball.shopIndex}]\` ${icon} **${ball.name}** (\`${ball.shortCode}\`) — **${formatNumber(summary.balls[ball.id])}**`;
  });

  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setAuthor({
      name: summary.displayName || summary.username,
      iconURL: summary.avatarUrl || undefined,
    })
    .setTitle('Túi Đồ Huấn Luyện Viên')
    .addFields(
      {
        name: 'Tài Sản',
        value: `${coinIcon} **${formatNumber(summary.coins)} PC**\nCấp độ: **Lv.${summary.level}** · Streak **${summary.dailyStreak}d**`,
        inline: true,
      },
      {
        name: 'Bộ Sưu Tập',
        value: `Đang giữ: **${formatNumber(summary.activeCreatureCount)}** Pokémon\nPokédex: **${summary.uniqueSpeciesCount}/${totalSpecies}** · ${shinyIcon} **${summary.shinyCatches}**`,
        inline: true,
      },
      {
        name: `Kho Poké Ball (Tổng: ${formatNumber(totalBalls)})`,
        value: ballLines.join('\n'),
        inline: false,
      },
    )
    .setThumbnail(summary.avatarUrl || null)
    .setFooter({
      text: `Dùng ${prefix}s để mua bóng  ·  ${prefix}box để xem kho Pokémon  ·  ${prefix}r để thả trùng`,
    });
}

export function buildProfileEmbed(summary: TrainerBagSummary): EmbedBuilder {
  const coinIcon = botEmojiRegistry.getCoinMention();
  const shinyIcon = botEmojiRegistry.getShinyMention();
  const nextXp = xpForNextLevel(summary.level);
  const catchRate =
    summary.totalEncounters > 0
      ? ((summary.totalCatches / summary.totalEncounters) * 100).toFixed(1)
      : '0.0';

  const buddyText = summary.buddy
    ? `${summary.buddy.isShiny ? `${shinyIcon} ` : ''}**${summary.buddy.speciesName}** (Lv.${summary.buddy.level} · ${summary.buddy.ivPercent}% IV)`
    : '*Chưa chọn Buddy (`/buddy set`)*';

  const topLines =
    summary.topCreatures.length > 0
      ? summary.topCreatures.map((c, idx) => {
          const shiny = c.isShiny ? `${shinyIcon} ` : '';
          const rarIcon = isRarityTier(c.rarity) ? `${botEmojiRegistry.getRarityMention(c.rarity)} ` : '';
          return `\`#${idx + 1}\` ${rarIcon}${shiny}**${c.speciesName}** — **${c.ivPercent}% IV**`;
        })
      : ['Chưa bắt được Pokémon nào. Hãy dùng `;p` hoặc `/p` ngay!'];

  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setAuthor({
      name: summary.displayName || summary.username,
      iconURL: summary.avatarUrl || undefined,
    })
    .setTitle('Hồ Sơ Huấn Luyện Viên')
    .setThumbnail(summary.avatarUrl || null)
    .addFields(
      {
        name: 'Cấp Độ & Kinh Nghiệm',
        value: `Level **${summary.level}**\nXP: **${summary.xp} / ${nextXp}**`,
        inline: true,
      },
      {
        name: 'Tài Sản & Chuỗi Ngày',
        value: `${coinIcon} **${formatNumber(summary.coins)} PC**\nStreak: **${summary.dailyStreak} ngày**`,
        inline: true,
      },
      {
        name: 'Thành Tích & Đấu Trường',
        value: `Đã bắt: **${formatNumber(summary.totalCatches)}** (${catchRate}%) · ${shinyIcon} **${summary.shinyCatches}** · Loài: **${summary.uniqueSpeciesCount}/${defaultCreatureCatalog.getAll().length}**\nHuy hiệu Gym: **${summary.officialGymBadgeCount}/8**  ·  Thắng trận: **${formatNumber(summary.battleWins)}**\nBuddy: ${buddyText}`,
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

export function buildBoxEmbed(
  trainerDisplayName: string,
  box: PaginatedBoxResult,
  prefix = ';',
): EmbedBuilder {
  const shinyIcon = botEmojiRegistry.getShinyMention();
  const favIcon = botEmojiRegistry.getFavMention();
  const filterBadge = box.filter ? `  [${box.filter.toUpperCase()}]` : '';
  const headerLine = `Sắp xếp: **${BOX_SORT_LABELS[box.sort]}**  ·  Tổng: **${formatNumber(box.totalCount)}** Pokémon`;

  const itemLines =
    box.items.length > 0
      ? box.items.map((item, index) => {
          const globalIndex = (box.page - 1) * 10 + index + 1;
          const shiny = item.isShiny ? `${shinyIcon} ` : '';
          const fav = item.isFavorite ? `${favIcon} ` : '';
          const rarIcon = isRarityTier(item.rarity)
            ? `${botEmojiRegistry.getRarityMention(item.rarity)} `
            : '';
          const shortId = item.id.slice(-6);
          const tags: string[] = [];
          if (box.buddyCreatureId === item.id) {
            tags.push('Buddy');
          }
          if (item.inMarket) {
            tags.push('Chợ/Trade');
          }
          const tagSuffix = tags.length > 0 ? ` · \`${tags.join(' | ')}\`` : '';
          return `\`${globalIndex}.\` ${fav}${rarIcon}${shiny}**${item.speciesName}** \`Lv.${item.level}\` — **${item.ivPercent}% IV** · \`#${shortId}\`${tagSuffix}`;
        })
      : [
          box.filter
            ? `Không có Pokémon nào khớp bộ lọc \`${box.filter}\`.`
            : `Kho Pokémon của bạn đang trống. Dùng \`${prefix}p\` hoặc \`/p\` để bắt Pokémon đầu tiên!`,
        ];

  return new EmbedBuilder()
    .setColor(0x14b8a6)
    .setTitle(`Kho Pokémon (Box) · ${trainerDisplayName}${filterBadge}`)
    .setDescription(`${headerLine}\n\n${itemLines.join('\n')}`)
    .setFooter({
      text: `Trang ${box.page}/${box.totalPages}  ·  Soi chỉ số: ${prefix}info <số|#mã>  ·  Khóa: ${prefix}fav <#mã>`,
    });
}

export function buildDailyEmbed(
  trainerDisplayName: string,
  result: DailyRewardResult,
): EmbedBuilder {
  const timerIcon = botEmojiRegistry.getTimerMention();
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();

  if (result.alreadyClaimed) {
    const nextEpoch = Math.floor(result.nextAvailableAt.getTime() / 1000);
    return new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('Đã Điểm Danh Hôm Nay')
      .setDescription(
        [
          `${timerIcon} Huấn luyện viên **${trainerDisplayName}** đã nhận thưởng hôm nay rồi.`,
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
        `${checkIcon} **${trainerDisplayName}** hoàn thành điểm danh ngày **${result.streak}**!`,
        `Phần thưởng: ${coinIcon} **+${formatNumber(result.coinsEarned)} PC**  ·  ${pbIcon} **+${result.pokeballsEarned}**  ·  ${gbIcon} **+${result.greatballsEarned}**`,
        `Số dư hiện tại: ${coinIcon} **${formatNumber(result.newCoinsBalance)} PC**`,
      ].join('\n'),
    )
    .setFooter({ text: 'PokeNyan  ·  Điểm danh hàng ngày' });
}

export function buildReleaseEmbed(
  trainerDisplayName: string,
  result: ReleaseResult,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();
  const favIcon = botEmojiRegistry.getFavMention();

  if (result.releasedCount === 0) {
    return new EmbedBuilder()
      .setColor(0x64748b)
      .setTitle('Không Có Pokémon Trùng Để Thả')
      .setDescription(
        `${trainerDisplayName} hiện không có Pokémon trùng nào (hệ thống luôn giữ IV cao nhất mỗi loài, toàn bộ **Shiny**, **Legendary**, **Mega** và Pokémon đã khóa ${favIcon}).`,
      )
      .setFooter({ text: 'PokeNyan  ·  Quản lý bộ sưu tập' });
  }

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('Đã Thả Pokémon Trùng Thành Công')
    .setDescription(
      [
        `${checkIcon} **${trainerDisplayName}** đã thả **${result.releasedCount}** Pokémon trùng và nhận ${coinIcon} **+${formatNumber(result.coinsEarned)} PC**`,
        `Đã tự động giữ lại IV cao nhất mỗi loài, Shiny, Legendary, Mega & Pokémon khóa ${favIcon}.`,
        `Số dư mới: ${coinIcon} **${formatNumber(result.newCoinsBalance)} PC**`,
      ].join('\n'),
    )
    .setFooter({ text: 'PokeNyan  ·  Quản lý bộ sưu tập' });
}

export function buildLeaderboardEmbed(
  metric: LeaderboardMetric,
  entries: readonly LeaderboardEntry[],
): EmbedBuilder {
  const coinIcon = botEmojiRegistry.getCoinMention();
  const shinyIcon = botEmojiRegistry.getShinyMention();

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
          return `${rankLabel} **${entry.displayName}** — Lv.${entry.level}  ·  ${formatNumber(entry.totalCatches)} bắt  ·  ${shinyIcon} ${entry.shinyCatches}  ·  ${coinIcon} **${formatNumber(entry.coins)} PC**`;
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
      `Hỗ trợ **Slash Commands** (\`/\`), **Prefix** (\`${prefix}\`), viết tắt kiểu PokéMeow hoặc **Mention** (\`@${botName} p\`).`,
    )
    .addFields(
      {
        name: 'Bắt, Câu Cá & Đồng Hành',
        value: [
          `• \`${prefix}p\` / \`/p\` — Tìm & bắt Pokémon hoang dã`,
          `• \`${prefix}f\` / \`/f\` — Câu cá hệ Nước & Shiny (\`${prefix}f shop\` mua cần/mồi)`,
          `• \`${prefix}bd\` / \`/buddy\` — Chọn & luyện Buddy (+4% bắt, +15% XP)`,
          `• \`${prefix}info [tên|số|#mã]\` / \`${prefix}v\` / \`/info\` — Xem chỉ số, IV & 4 skill Pokémon`,
          `• \`${prefix}ev\` / \`/evolve\` — Tiến hóa Pokémon khi đủ cấp độ`,
          `• \`${prefix}box [sort|lọc]\` / \`/box\` — Xem kho Pokémon (mặc định theo Độ hiếm)`,
          `• \`${prefix}d <tên>\` / \`${prefix}fav [#mã]\` — Tra Pokédex & khóa yêu thích`,
          `• \`${prefix}m [tên]\` / \`/mega\` — Nghi thức hiến tế 5/6 Legend lên Mega`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Nhiệm Vụ, Chợ & Đấu Trường',
        value: [
          `• \`${prefix}q\` / \`/quest\` — Nhiệm vụ ngày/tuần thưởng Premier & Master Ball`,
          `• \`${prefix}s\` / \`${prefix}s b 1 10\` — Cửa hàng & mua nhanh Poké Ball`,
          `• \`${prefix}i\` / \`${prefix}bal\` / \`${prefix}pf\` — Túi đồ, số dư PC & hồ sơ`,
          `• \`${prefix}mk\` / \`/market\` — Chợ mua bán Pokémon (\`${prefix}mk sell\`, \`${prefix}mk buy\`)`,
          `• \`${prefix}tr\` / \`/trade\` — Trao đổi 2 bước an toàn với người chơi khác`,
          `• \`${prefix}bt [gym|@user]\` / \`${prefix}gym [số]\` — Chọn Challenger (3v3) / 8 Gym / PvP`,
          `• \`${prefix}team [set|add|swap|auto]\` / \`/team\` — Xếp đội hình 3 Pokémon xuất trận`,
          `• \`${prefix}ms [tên]\` / \`/moves\` — Shop Kỹ Năng riêng cho từng Pokémon (mở ô 3 & 4)`,
          `• \`${prefix}r\` / \`${prefix}dl\` / \`${prefix}lb\` — Thả trùng, điểm danh & BXH`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Quản Trị Server (Admin / Manage Server)',
        value: [
          `• \`${prefix}bot <on|off|status>\` / \`/bot\` — Bật/tắt bot trong server`,
          `• \`${prefix}prefix [ký_tự]\` / \`/prefix\` — Đổi prefix riêng để tránh trùng bot khác`,
          `• \`${prefix}channel <allow|block|list|reset>\` / \`/channel\` — Giới hạn kênh bot`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: FAN_DISCLAIMER });
}

export function buildBotStatusEmbed(
  botName: string,
  state: GuildToggleState,
  changedBy?: string,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const crossIcon = botEmojiRegistry.getCrossMention();

  if (state.enabled) {
    const actorLine = changedBy ? `${checkIcon} Kích hoạt bởi: **${changedBy}**` : `${checkIcon} Bot đang hoạt động bình thường.`;
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
        `${crossIcon} Tạm tắt bởi: **${actor}** (${timeInfo})`,
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
        `Ví dụ dùng lệnh: \`${prefix}p\`, \`${prefix}s b 1 10\`, \`${prefix}box iv\`, hoặc tag \`@${botName} p\`.`,
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
  const shinyIcon = botEmojiRegistry.getShinyMention();
  const favIcon = botEmojiRegistry.getFavMention();
  const readyMegas =
    progress.availableMegas.length > 0
      ? progress.availableMegas
          .slice(0, 12)
          .map((m) => {
            const shiny = m.baseIsShiny ? `${shinyIcon} ` : '';
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
        `**Điều kiện:** Sở hữu Pokémon gốc + đủ **${MEGA_REQUIRED_LEGENDARIES} Legendary**, hiến tế **${MEGA_SACRIFICE_COUNT} con IV thấp nhất** (chừa lại Shiny và Pokémon khóa ${favIcon}).`,
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
  const favIcon = botEmojiRegistry.getFavMention();
  const megaIcon = botEmojiRegistry.getRarityMention('mega');
  const checkIcon = botEmojiRegistry.getCheckMention();
  const spriteUrl = result.upgradedCreature.isShiny
    ? result.megaSpecies.shinyAnimatedSpriteUrl
    : result.megaSpecies.animatedSpriteUrl;

  return new EmbedBuilder()
    .setColor(0xf43f5e)
    .setTitle(`THỨC TỈNH THÀNH CÔNG · ${shinyTag}${result.megaSpecies.name}`)
    .setDescription(
      [
        ansiBanner(
          `\u001b[1;35mTHỨC TỈNH MEGA THÀNH CÔNG  ·  ${result.megaSpecies.name.toUpperCase()}!\u001b[0m`,
        ),
        `${checkIcon} Chúc mừng **${trainerDisplayName}**! ${megaIcon ? `${megaIcon} ` : ''}**${shinyTag}${result.megaSpecies.name}** (**${result.upgradedCreature.ivPercent}% IV**) đã được tự động khóa Yêu thích (${favIcon}).`,
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
