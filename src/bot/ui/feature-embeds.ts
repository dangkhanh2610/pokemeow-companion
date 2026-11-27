import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { getBallSpec } from '@/game/catalog/ball-catalog';
import { RARITY_CONFIGS } from '@/game/catalog/creature-catalog';
import {
  BAIT_CATALOG,
  FISHING_PACK_CATALOG,
  FISHING_TOKEN_REWARDS,
  ROD_CATALOG,
} from '@/game/catalog/fishing-catalog';
import { getSpeciesMovePool, type MoveSpec } from '@/game/catalog/move-catalog';
import { BUDDY_CATCH_XP_BY_RARITY } from '@/game/engine/spawn-engine';
import {
  analyzeDefensiveMatchups,
  computeComputedStats,
  type BattleStatusCondition,
  type CombatantState,
} from '@/game/engine/battle-engine';
import type { BattleSessionView, ChallengerOverviewItem } from '@/game/services/battle-service';
import type { CaptchaView, VerifyCaptchaOutcome } from '@/game/services/captcha-service';
import {
  TRAIN_COST_PER_LEVEL,
  type BuddyView,
  type EvolutionCandidateView,
  type EvolveOutcome,
  type TrainBuddyOutcome,
} from '@/game/services/evolution-service';
import type {
  BuyFishingItemOutcome,
  CastRodOutcome,
  FishingGearStatus,
  PullHookOutcome,
} from '@/game/services/fishing-service';
import type {
  MarketListingItem,
  PaginatedMarketResult,
  TradeSessionView,
} from '@/game/services/market-service';
import type { PokemonMoveShopView } from '@/game/services/move-shop-service';
import type { ClaimQuestsOutcome, QuestProgressItem, QuestSummary } from '@/game/services/quest-service';
import type { TeamMemberView, TeamView } from '@/game/services/team-service';
import type {
  CreatureInspectResult,
  OwnedCreatureInspectView,
} from '@/game/services/trainer-service';
import type { BallId, RarityTier } from '@/game/types';
import { botEmojiRegistry } from '../emoji-registry';
import { renderBattleSceneAttachment } from './battle-scene';

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function splitLinesIntoFields(
  title: string,
  lines: readonly string[],
  maxLen = 960,
): { name: string; value: string; inline: boolean }[] {
  if (lines.length === 0) {
    return [{ name: title, value: '-', inline: false }];
  }

  const fields: { name: string; value: string; inline: boolean }[] = [];
  let current = '';

  const pushChunk = (text: string): void => {
    const fieldName = fields.length === 0 ? title : `${title} (tiếp)`;
    fields.push({ name: fieldName, value: text.slice(0, 1024), inline: false });
  };

  for (const rawLine of lines) {
    const line = rawLine.length > maxLen ? `${rawLine.slice(0, maxLen - 3)}...` : rawLine;
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLen && current.length > 0) {
      pushChunk(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current) {
    pushChunk(current);
  }
  return fields;
}

function isRarityTier(val: string): val is RarityTier {
  return (
    val === 'common' ||
    val === 'uncommon' ||
    val === 'rare' ||
    val === 'super_rare' ||
    val === 'legendary' ||
    val === 'mega'
  );
}

function rarityTag(rarity: string, isShiny: boolean): string {
  const shiny = isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
  const rar = isRarityTier(rarity) ? `${botEmojiRegistry.getRarityMention(rarity)} ` : '';
  return `${rar}${shiny}`.trim();
}

function renderLogIcons(line: string): string {
  return line.replace(/\[TYPE:([A-Za-z]+)\]/g, (_match, rawType: string) => {
    return botEmojiRegistry.getTypeMention(rawType) || `[${rawType}]`;
  });
}

function formatStatusTag(status: BattleStatusCondition, steelGuardTurns: number): string {
  const tags: string[] = [];
  if (status === 'BURN') tags.push(`${botEmojiRegistry.getTypeMention('Fire')} \`BỎNG\``);
  if (status === 'PARALYZE') tags.push(`${botEmojiRegistry.getTypeMention('Electric')} \`TÊ LIỆT\``);
  if (status === 'FREEZE') tags.push(`${botEmojiRegistry.getTypeMention('Ice')} \`ĐÓNG BĂNG\``);
  if (status === 'POISON') tags.push(`${botEmojiRegistry.getTypeMention('Poison')} \`ĐỘC\``);
  if (steelGuardTurns > 0) tags.push(`${botEmojiRegistry.getTypeMention('Steel')} \`GIÁP THÉP\``);
  return tags.length > 0 ? ` · ${tags.join(' ')}` : '';
}

// ======================= ANTI-MACRO CAPTCHA =======================

export function buildCaptchaEmbed(displayName: string, captcha: CaptchaView): EmbedBuilder {
  const timerIcon = botEmojiRegistry.getTimerMention();
  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`Xác Minh Chống Tool · ${displayName}`)
    .setDescription(
      [
        `${timerIcon} ${captcha.question}`,
        `Lần thử: **${captcha.attempts}/3** (sai 3 lần sẽ tạm khóa 5 phút)`,
      ].join('\n'),
    )
    .setFooter({ text: 'PokeNyan  ·  Hoàn thành để nhận +300 PC & +1 Poké Ball' });

  if (captcha.spriteUrl) {
    embed.setImage(captcha.spriteUrl);
  }
  return embed;
}

export function buildCaptchaButtonsRow(captcha: CaptchaView): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    captcha.options.map((name, idx) =>
      new ButtonBuilder()
        .setCustomId(`captcha:opt:${captcha.userId}:${idx}`)
        .setLabel(name)
        .setStyle(ButtonStyle.Primary),
    ),
  );
}

export function buildCaptchaSuccessEmbed(
  displayName: string,
  outcome: Extract<VerifyCaptchaOutcome, { readonly ok: true; readonly correct: true }>,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();
  const pbIcon = botEmojiRegistry.getBallMention('pokeball');

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`Xác Minh Thành Công · ${displayName}`)
    .setDescription(
      [
        `${checkIcon} Chính xác! Bạn đã được mở khóa tiếp tục săn Pokémon.`,
        `Phần thưởng: ${coinIcon} **+${formatNumber(outcome.rewardCoins)} PC**  ·  ${pbIcon} **+${outcome.rewardPokeballs}**`,
        `Số dư hiện tại: ${coinIcon} **${formatNumber(outcome.newCoinsBalance)} PC**`,
      ].join('\n'),
    )
    .setFooter({ text: 'PokeNyan  ·  Cảm ơn bạn đã chơi công bằng' });
}

// ======================= QUESTS (/quest) =======================

function formatQuestLine(q: QuestProgressItem): string {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();
  const ballIcon = botEmojiRegistry.getBallMention(q.rewardBall);
  const statusTag = q.claimed
    ? `${checkIcon} *Đã nhận*`
    : q.completed
      ? `${checkIcon} **Hoàn thành!**`
      : `\`${q.progress}/${q.targetValue}\``;

  return `• **${q.title}** — ${statusTag}\n  └ ${q.description} | Thưởng: ${coinIcon} **${formatNumber(q.rewardCoins)}** + ${ballIcon} **${q.rewardQty}x**`;
}

export function buildQuestsEmbed(
  displayName: string,
  summary: QuestSummary,
  prefix: string,
): EmbedBuilder {
  const dailyText = summary.dailyQuests.map(formatQuestLine).join('\n') || 'Không có nhiệm vụ.';
  const weeklyText = summary.weeklyQuests.map(formatQuestLine).join('\n') || 'Không có nhiệm vụ.';

  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`Bảng Nhiệm Vụ · ${displayName}`)
    .addFields(
      { name: `Nhiệm Vụ Ngày (${summary.dailyKey})`, value: dailyText, inline: false },
      { name: `Nhiệm Vụ Tuần (${summary.weeklyKey})`, value: weeklyText, inline: false },
    )
    .setFooter({
      text: `Dùng ${prefix}q claim hoặc bấm nút bên dưới để nhận thưởng`,
    });
}

export function buildQuestClaimRow(
  userId: string,
  claimableCount: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`quest:claim:${userId}`)
      .setLabel(
        claimableCount > 0 ? `Nhận Thưởng (${claimableCount} nhiệm vụ)` : 'Chưa có thưởng mới',
      )
      .setStyle(claimableCount > 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(claimableCount <= 0),
  );
}

export function buildQuestClaimSuccessEmbed(
  displayName: string,
  res: ClaimQuestsOutcome,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();

  if (res.claimedCount === 0) {
    return new EmbedBuilder()
      .setColor(0x64748b)
      .setTitle(`Nhiệm Vụ · ${displayName}`)
      .setDescription('Bạn hiện chưa có nhiệm vụ nào hoàn thành để nhận thưởng.');
  }

  const ballText = (Object.entries(res.ballsGranted) as [BallId, number][])
    .filter(([, qty]) => qty > 0)
    .map(([ballId, qty]) => `${botEmojiRegistry.getBallMention(ballId)} **+${qty} ${getBallSpec(ballId).name}**`)
    .join('  ·  ');

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`Nhận Thưởng Nhiệm Vụ · ${displayName}`)
    .setDescription(
      [
        `${checkIcon} Đã nhận thưởng từ **${res.claimedCount} nhiệm vụ**!`,
        `Phần thưởng: ${coinIcon} **+${formatNumber(res.totalCoins)} PC**${ballText ? `  ·  ${ballText}` : ''}`,
        `Số dư hiện tại: ${coinIcon} **${formatNumber(res.newCoinsBalance)} PC**`,
      ].join('\n'),
    );
}

// ======================= BUDDY & EVOLVE =======================

export function buildBuddyEmbed(
  displayName: string,
  buddy: BuddyView | null,
  prefix: string,
): EmbedBuilder {
  if (!buddy) {
    return new EmbedBuilder()
      .setColor(0x64748b)
      .setTitle(`Buddy Đồng Hành · ${displayName}`)
      .setDescription(
        [
          'Bạn chưa chọn Pokémon Buddy đồng hành.',
          `Dùng \`${prefix}bd set <tên|#mã>\` hoặc \`/buddy set\` để chọn!`,
          '**Quyền lợi Buddy:** +4% tỉ lệ bắt bóng, +15% XP huấn luyện viên và tự nhận XP sau mỗi lần bắt/chiến đấu.',
        ].join('\n'),
      );
  }

  const coinIcon = botEmojiRegistry.getCoinMention();
  const tag = rarityTag(buddy.rarity, buddy.isShiny);
  const xpRatio = buddy.nextLevelXp > 0 ? Math.min(1, buddy.xp / buddy.nextLevelXp) : 1;
  const filledBlocks = Math.round(xpRatio * 10);
  const xpBar = `${'▰'.repeat(filledBlocks)}${'▱'.repeat(10 - filledBlocks)}`;
  const evoText =
    buddy.evolutions.length > 0
      ? buddy.evolutions
          .map(
            (e) =>
              `→ **${e.toName}** (cần **Lv.${e.requiredLevel}**${buddy.level >= e.requiredLevel ? ` — Sẵn sàng \`${prefix}ev\`` : ''})`,
          )
          .join('\n')
      : '*Đã đạt cấp tiến hóa tối đa (hoặc không có dạng tiến hóa tiếp theo)*';

  const rarityXpInfo = [
    `Common **+${BUDDY_CATCH_XP_BY_RARITY.common}** · Uncommon **+${BUDDY_CATCH_XP_BY_RARITY.uncommon}** · Rare **+${BUDDY_CATCH_XP_BY_RARITY.rare}**`,
    `Super Rare **+${BUDDY_CATCH_XP_BY_RARITY.super_rare}** · Legendary **+${formatNumber(BUDDY_CATCH_XP_BY_RARITY.legendary)}**`,
    `Shiny **x2.5** (tối thiểu **+600 XP**) · Câu cá **+20% XP** · Mỗi cấp tăng lượng XP cần thiết`,
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`Buddy Đồng Hành · ${displayName}`)
    .setDescription(
      [
        `${tag ? `${tag} ` : ''}**${buddy.speciesName}** (\`#${buddy.id.slice(-6)}\`)`,
        `Cấp độ: **Lv.${buddy.level}** · **${buddy.ivPercent}% IV**`,
        buddy.nextLevelXp > 0
          ? `EXP: \`${xpBar}\` **${formatNumber(buddy.xp)} / ${formatNumber(buddy.nextLevelXp)}** (${Math.round(xpRatio * 100)}%)`
          : `EXP: \`${xpBar}\` **Cấp Tối Đa (Lv.100)**`,
        `Đặc quyền: **+4% tỉ lệ bắt** · **+15% XP Trainer** · Ra trận chính trong \`${prefix}bt\` & \`${prefix}gym\` · \`${prefix}bd train [cấp]\` (${coinIcon} ${formatNumber(TRAIN_COST_PER_LEVEL)}/cấp)`,
      ].join('\n'),
    )
    .addFields(
      { name: 'Chuỗi Tiến Hóa', value: evoText, inline: false },
      { name: 'XP Buddy Nhận Theo Rarity Khi Bắt Pokémon', value: rarityXpInfo, inline: false },
    )
    .setFooter({ text: `Dùng ${prefix}ev ${buddy.speciesName.toLowerCase()} để tiến hóa khi đủ cấp` });

  if (buddy.spriteUrl) {
    embed.setThumbnail(buddy.spriteUrl);
  }
  return embed;
}

export function buildBuddyTrainEmbed(
  displayName: string,
  outcome: Extract<TrainBuddyOutcome, { readonly ok: true }>,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();
  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`Huấn Luyện Buddy · ${displayName}`)
    .setDescription(
      [
        `${checkIcon} **${outcome.buddy.speciesName}** đã tăng **+${outcome.levelsGained} cấp** → **Lv.${outcome.buddy.level}**!`,
        `Chi phí: -${coinIcon} **${formatNumber(outcome.totalCost)} PC** · Số dư còn: ${coinIcon} **${formatNumber(outcome.newCoinsBalance)} PC**`,
      ].join('\n'),
    )
    .setThumbnail(outcome.buddy.spriteUrl || null);
}

export function buildEvolutionCandidatesEmbed(
  displayName: string,
  candidates: readonly EvolutionCandidateView[],
  prefix: string,
): EmbedBuilder {
  const shinyIcon = botEmojiRegistry.getShinyMention();
  const checkIcon = botEmojiRegistry.getCheckMention();

  const lines =
    candidates.length > 0
      ? candidates.slice(0, 12).map((c) => {
          const shiny = c.isShiny ? `${shinyIcon} ` : '';
          const targets = c.branches
            .map((b) => `${b.toName} (Lv.${b.requiredLevel})`)
            .join(' / ');
          const mark = c.ready ? `${checkIcon} ` : '';
          return `${mark}${shiny}**${c.speciesName}** \`#${c.shortId}\` (Lv.${c.level} · ${c.ivPercent}% IV) → ${targets}`;
        })
      : ['Không có Pokémon nào trong kho có thể tiến hóa thêm.'];

  return new EmbedBuilder()
    .setColor(0x14b8a6)
    .setTitle(`Danh Sách Tiến Hóa · ${displayName}`)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: `Dùng ${prefix}ev <tên|#mã> [nhánh] để tiến hóa những Pokémon đã đủ cấp`,
    });
}

export function buildEvolutionSuccessEmbed(
  displayName: string,
  outcome: Extract<EvolveOutcome, { readonly ok: true }>,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const shinyIcon = botEmojiRegistry.getShinyMention();
  const spriteUrl = outcome.isShiny
    ? outcome.toSpecies.shinyAnimatedSpriteUrl
    : outcome.toSpecies.animatedSpriteUrl;
  const shinyTag = outcome.isShiny ? `${shinyIcon} ` : '';

  return new EmbedBuilder()
    .setColor(RARITY_CONFIGS[outcome.toSpecies.rarity].colorHex)
    .setTitle(`Tiến Hóa Thành Công · ${shinyTag}${outcome.toSpecies.name}`)
    .setDescription(
      [
        `${checkIcon} Chúc mừng **${displayName}**!`,
        `**${outcome.fromSpecies.name}** → ${shinyTag}**${outcome.toSpecies.name}** (Lv.${outcome.level} · **${outcome.ivPercent}% IV** · \`#${outcome.shortId}\`)`,
        `Sức mạnh mới: **BST ${outcome.toSpecies.baseStats.bst}**`,
      ].join('\n'),
    )
    .setImage(spriteUrl);
}

// ======================= FISHING (/f) =======================

export function buildFishingCastingEmbed(
  displayName: string,
  avatarUrl: string,
  cast: Extract<CastRodOutcome, { readonly ok: true }>,
): EmbedBuilder {
  const timerIcon = botEmojiRegistry.getTimerMention();
  const expireEpoch = Math.ceil((cast.expiresAt.getTime() + 400) / 1000);
  const baitLine = cast.baitUsed
    ? `\nMồi đang dùng: **${cast.baitUsed === 'bait_gold' ? 'Mồi Hoàng Kim (x2 Shiny)' : 'Mồi Dụ Hiếm (x1.8 Rare+)'}**`
    : '';

  return new EmbedBuilder()
    .setColor(0x0284c7)
    .setAuthor({ name: `${displayName} đang thả câu...`, iconURL: avatarUrl || undefined })
    .setTitle(`Câu Cá · ${cast.rod.name}`)
    .setDescription(
      [
        'Mặt nước vừa gợn sóng — **cá đang cắn câu!**',
        `${timerIcon} Hãy bấm **Giật Cần Ngay!** trước khi tuột mất <t:${expireEpoch}:R>${baitLine}`,
      ].join('\n'),
    )
    .setFooter({ text: 'PokeNyan Fishing  ·  Cần càng xịn, tỉ lệ Rare & Shiny càng cao' });
}

export function buildFishingPullRow(
  encounterId: string,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`fish:pull:${encounterId}`)
      .setLabel('Giật Cần Ngay!')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

export function buildFishingBiteEmbed(
  displayName: string,
  pull: Extract<PullHookOutcome, { readonly ok: true }>,
): EmbedBuilder {
  const timerIcon = botEmojiRegistry.getTimerMention();
  const tokenIcon = botEmojiRegistry.getTokenMention();
  const rarityBadge = botEmojiRegistry.getRarityMention(pull.species.rarity);
  const shinyIcon = pull.isShiny ? `${botEmojiRegistry.getShinyMention()} **SHINY** · ` : '';
  const expireEpoch = Math.ceil((pull.expiresAt.getTime() + 400) / 1000);
  const imageUrl = pull.isShiny
    ? pull.species.shinyAnimatedSpriteUrl
    : pull.species.animatedSpriteUrl;

  return new EmbedBuilder()
    .setColor(pull.isShiny ? 0xe879f9 : RARITY_CONFIGS[pull.species.rarity].colorHex)
    .setTitle(`Đã Kéo Lên · ${pull.species.name}`)
    .setDescription(
      [
        `**${displayName}** đã kéo lên một Pokémon hệ Nước bằng **${pull.rod.name}**!`,
        `${shinyIcon}${rarityBadge} **${RARITY_CONFIGS[pull.species.rarity].label}** · **${pull.ivPercent}% IV** (${pull.ivTotal}/186)`,
        `${timerIcon} Bơi mất <t:${expireEpoch}:R> · Chọn Poké Ball để nhận ${tokenIcon} **Fishing Tokens** & +20% PC!`,
      ].join('\n'),
    )
    .setImage(imageUrl);
}

export function buildFishingExpiredEmbed(displayName: string): EmbedBuilder {
  const timerIcon = botEmojiRegistry.getTimerMention();
  return new EmbedBuilder()
    .setColor(0x475569)
    .setTitle('Cá Đã Tuột Mất!')
    .setDescription(`${timerIcon} **${displayName}** chậm tay nên Pokémon Nước đã bơi mất. Gõ \`;f\` hoặc \`/f cast\` để thử lại!`);
}

export function buildFishingShopEmbed(
  gear: FishingGearStatus,
  prefix: string,
  notice?: string,
): EmbedBuilder {
  const tokenIcon = botEmojiRegistry.getTokenMention();
  const checkIcon = botEmojiRegistry.getCheckMention();

  const rodLines = ROD_CATALOG.map((r) => {
    const owned = r.tier <= gear.rod.tier;
    const locked = r.tier > gear.rod.tier + 1;
    const tag = owned
      ? `${checkIcon} *Đã có*`
      : locked
        ? `${tokenIcon} **${formatNumber(r.price)} FT** · *(Cần nâng từ cấp trước)*`
        : `${tokenIcon} **${formatNumber(r.price)} FT**`;
    return `\`[${r.shopIndex}]\` **${r.name}** (\`${r.shortCode}\`) — ${tag}\n└ ${r.description}`;
  });

  const baitLines = BAIT_CATALOG.map((b) => {
    const qty = gear.baits[b.id];
    return `\`[${b.shopIndex}]\` **${b.name}** (\`${b.shortCode}\`) — ${tokenIcon} **${formatNumber(b.price)} FT** · *Đang có: ${qty}*\n└ ${b.description}`;
  });

  const packLines = FISHING_PACK_CATALOG.map((p) => {
    const ballIcon = botEmojiRegistry.getBallMention(p.rewardBall);
    return `\`[${p.shopIndex}]\` ${ballIcon} **${p.name}** (\`${p.shortCode}\`) — ${tokenIcon} **${formatNumber(p.price)} FT**\n└ ${p.description}`;
  });

  const descParts = [
    `${tokenIcon} Fishing Tokens hiện có: **${formatNumber(gear.fishingTokens)} FT**  ·  Cần câu: **${gear.rod.name}**`,
    `Thưởng FT khi câu trúng: Common **+${FISHING_TOKEN_REWARDS.common}** · Uncommon **+${FISHING_TOKEN_REWARDS.uncommon}** · Rare **+${FISHING_TOKEN_REWARDS.rare}** · Super Rare **+${FISHING_TOKEN_REWARDS.super_rare}** · Legend **+${FISHING_TOKEN_REWARDS.legendary}** · Shiny **x3** (min +50)`,
    `Mua bằng menu dưới hoặc \`${prefix}f buy <mã> [sl]\` (vd: \`${prefix}f buy good\`, \`${prefix}f buy lure 5\`)`,
    notice ? `\n${checkIcon} ${notice}` : '',
  ].filter(Boolean);

  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle('Cửa Hàng Câu Cá · Fishing Token Shop')
    .setDescription(descParts.join('\n'))
    .addFields(
      ...splitLinesIntoFields('Cần Câu Tuần Tự ([1] – [4])', rodLines),
      ...splitLinesIntoFields('Mồi Câu ([5] – [6]) & Đổi Bóng ([7] – [8])', [
        ...baitLines,
        ...packLines,
      ]),
    )
    .setFooter({ text: 'PokeNyan Fishing  ·  Đơn vị tiền riêng Fishing Tokens (FT) kiếm từ câu cá' });
}

export function buildFishingShopSelectRow(
  ownerUserId: string,
  gear: FishingGearStatus,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`fshop:${ownerUserId}`)
    .setPlaceholder('Chọn vật phẩm câu cá muốn mua bằng FT...');

  const nextRod = ROD_CATALOG.find((r) => r.tier === gear.rod.tier + 1);
  if (nextRod) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`[${nextRod.shopIndex}] Nâng cấp ${nextRod.name} · ${formatNumber(nextRod.price)} FT`)
        .setValue(nextRod.shortCode)
        .setDescription(nextRod.description.slice(0, 100)),
    );
  }

  for (const bait of BAIT_CATALOG) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`[${bait.shopIndex}] 1x ${bait.name} · ${formatNumber(bait.price)} FT`)
        .setValue(bait.shortCode)
        .setDescription(`Đang có ${gear.baits[bait.id]} · ${bait.description}`.slice(0, 100)),
    );
  }

  for (const pack of FISHING_PACK_CATALOG) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`[${pack.shopIndex}] ${pack.name} · ${formatNumber(pack.price)} FT`)
        .setValue(pack.shortCode)
        .setDescription(pack.description.slice(0, 100)),
    );
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildBuyFishingItemEmbed(
  displayName: string,
  res: Extract<BuyFishingItemOutcome, { readonly ok: true }>,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const tokenIcon = botEmojiRegistry.getTokenMention();
  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`Mua Đồ Câu Thành Công · ${displayName}`)
    .setDescription(
      [
        `${checkIcon} Đã mua **${res.quantityBought}x ${res.itemName}** (-${tokenIcon} **${formatNumber(res.totalCost)} FT**)`,
        `Fishing Tokens còn lại: ${tokenIcon} **${formatNumber(res.newFishingTokensBalance)} FT**`,
      ].join('\n'),
    );
}

// ======================= MARKET & 2-STEP TRADE =======================

export function buildMarketBrowseEmbed(
  res: PaginatedMarketResult,
  prefix: string,
): EmbedBuilder {
  const coinIcon = botEmojiRegistry.getCoinMention();
  const filterNote = res.filter ? ` [${res.filter.toUpperCase()}]` : '';
  const lines =
    res.items.length > 0
      ? res.items.map((item) => {
          const tags = rarityTag(item.rarity, item.isShiny);
          return `\`#${item.listingNo}\` ${tags ? `${tags} ` : ''}**${item.speciesName}** (Lv.${item.level} · ${item.ivPercent}% IV) — ${coinIcon} **${formatNumber(item.price)} PC** · *${item.sellerName}*`;
        })
      : [
          `Chợ hiện chưa có Pokémon nào đang bán${res.filter ? ` khớp \`${res.filter}\`` : ''}.`,
          `Dùng \`${prefix}mk sell <tên|#mã> <giá>\` để đăng bán!`,
        ];

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`Chợ Giao Dịch PokeNyan${filterNote}`)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: `Trang ${res.page}/${res.totalPages} · ${res.totalCount} đơn đang mở · Mua: ${prefix}mk buy <mã> · Rao bán: ${prefix}mk sell <tên> <giá>`,
    });
}

export function buildMarketPaginationRow(
  ownerUserId: string,
  filter: string,
  page: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  const enc = encodeURIComponent(filter).slice(0, 40);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mk:page:${ownerUserId}:${Math.max(1, page - 1)}:${enc}`)
      .setLabel('◀ Trước')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`mk:page:${ownerUserId}:${Math.min(totalPages, page + 1)}:${enc}`)
      .setLabel('Sau ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );
}

export function buildMarketListSuccessEmbed(
  displayName: string,
  listing: MarketListingItem,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();
  const tags = rarityTag(listing.rarity, listing.isShiny);

  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`Đã Đăng Bán Lên Chợ · #${listing.listingNo}`)
    .setDescription(
      [
        `${checkIcon} **${displayName}** đã niêm yết ${tags ? `${tags} ` : ''}**${listing.speciesName}** (Lv.${listing.level} · **${listing.ivPercent}% IV**)`,
        `Giá bán: ${coinIcon} **${formatNumber(listing.price)} PC** (thuế sàn 5% khi bán thành công)`,
      ].join('\n'),
    );
}

export function buildMarketBuyConfirmEmbed(
  buyerName: string,
  listing: MarketListingItem,
): EmbedBuilder {
  const coinIcon = botEmojiRegistry.getCoinMention();
  const tags = rarityTag(listing.rarity, listing.isShiny);
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`Xác Nhận Mua Trên Chợ · #${listing.listingNo}`)
    .setDescription(
      [
        `Người mua: **${buyerName}**`,
        `Sản phẩm: ${tags ? `${tags} ` : ''}**${listing.speciesName}** (Lv.${listing.level} · **${listing.ivPercent}% IV**)`,
        `Người bán: **${listing.sellerName}**`,
        `Giá thanh toán: ${coinIcon} **${formatNumber(listing.price)} PC**`,
      ].join('\n'),
    )
    .setFooter({ text: 'Bấm Xác nhận Mua bên dưới để hoàn tất giao dịch' });
}

export function buildMarketBuyConfirmRow(
  buyerUserId: string,
  listingNo: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mk:buy:${buyerUserId}:${listingNo}`)
      .setLabel(`Xác nhận Mua #${listingNo}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`mk:abort:${buyerUserId}`)
      .setLabel('Hủy')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildTradeEmbed(trade: TradeSessionView, prefix: string): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const crossIcon = botEmojiRegistry.getCrossMention();
  const timerIcon = botEmojiRegistry.getTimerMention();
  const coinIcon = botEmojiRegistry.getCoinMention();

  const formatSide = (
    creature: TradeSessionView['initiatorCreature'],
    coins: number,
    confirmed: boolean,
  ): string => {
    const cLine = creature
      ? `${rarityTag(creature.rarity, creature.isShiny)} **${creature.speciesName}** (Lv.${creature.level} · ${creature.ivPercent}% IV · \`#${creature.shortId}\`)`
      : '*Chưa chọn Pokémon*';
    const coinLine = `${coinIcon} **${formatNumber(coins)} PC**`;
    const lockLine = confirmed ? `${checkIcon} **Đã xác nhận**` : `${timerIcon} *Chưa xác nhận*`;
    return `${cLine}\n${coinLine}\nTrạng thái: ${lockLine}`;
  };

  const title =
    trade.status === 'COMPLETED'
      ? 'Giao Dịch Hoàn Tất!'
      : trade.status === 'CANCELLED'
        ? `${crossIcon} Giao Dịch Đã Hủy`
        : 'Phiên Giao Dịch 2 Bước';

  const color =
    trade.status === 'COMPLETED'
      ? 0x10b981
      : trade.status === 'CANCELLED'
        ? 0xef4444
        : 0x0ea5e9;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(
      {
        name: `Bên Mời · ${trade.initiatorName}`,
        value: formatSide(trade.initiatorCreature, trade.initiatorCoins, trade.initiatorConfirmed),
        inline: true,
      },
      {
        name: `Đối Tác · ${trade.targetName}`,
        value: formatSide(trade.targetCreature, trade.targetCoins, trade.targetConfirmed),
        inline: true,
      },
    )
    .setFooter({
      text:
        trade.status === 'PENDING'
          ? `Đặt đồ: ${prefix}tr offer <tên|#mã> [coins] · Đổi đồ sẽ tự reset xác nhận 2 bên để chống scam`
          : 'PokeNyan Safe Trade',
    });
}

export function buildTradeButtonsRow(
  trade: TradeSessionView,
): ActionRowBuilder<ButtonBuilder> {
  const disabled = trade.status !== 'PENDING';
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tr:confirm:${trade.id}`)
      .setLabel('Xác nhận Giao Dịch')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`tr:cancel:${trade.id}`)
      .setLabel('Hủy Trade')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

// ======================= BATTLE SYSTEM (/battle, ;gym) & SKILL SHOP (;ms) =======================

function formatChallengerRow(c: ChallengerOverviewItem): string {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();
  const ballIcon = botEmojiRegistry.getBallMention(c.rewardBall);
  const primaryType = c.speciesTypes[0] ?? 'Normal';
  const typeIcon = botEmojiRegistry.getTypeMention(primaryType) || primaryType;

  const prefixMark = c.cleared
    ? `${checkIcon} \`#${c.stage}\``
    : c.unlocked
      ? `\`[#${c.stage}]\``
      : '`[KHÓA]`';
  const lineupStr = c.lineupNames.join(' · ');
  const rewardNote = c.cleared
    ? `*Tái đấu ${coinIcon} ${formatNumber(Math.round(c.rewardCoins * 0.25))}*`
    : `${coinIcon} **${formatNumber(c.rewardCoins)}** + ${ballIcon} **${c.rewardQty}x**`;

  return `${prefixMark} ${typeIcon} **${c.leaderName}** (\`Lv.${c.level}\`) — ${rewardNote}\n└ *${lineupStr}*`;
}

export function buildChallengerListEmbed(
  displayName: string,
  challengers: readonly ChallengerOverviewItem[],
  prefix: string,
): EmbedBuilder {
  const officialGyms = challengers.filter((c) => c.tier === 'gym');
  const gymCleared = officialGyms.filter((c) => c.cleared).length;
  const elites = challengers.filter((c) => c.tier === 'elite');

  return new EmbedBuilder()
    .setColor(0xe11d48)
    .setTitle(`Danh Sách Challengers PokéMeow · ${displayName} (${gymCleared}/8 Huy Hiệu)`)
    .setDescription(
      [
        `Đánh bại từng người theo **thứ tự chuẩn PokéMeow** (Gym 1 Brock → Champion Blue). Mỗi Challenger mang đội hình **3 Pokémon**!`,
        `Chọn ở menu bên dưới hoặc gõ \`${prefix}gym <1-13>\` · Xếp đội hình: \`${prefix}team\``,
      ].join('\n'),
    )
    .addFields(
      ...splitLinesIntoFields(
        'Kanto Gym #1 – #4 (Brock → Erika)',
        officialGyms.slice(0, 4).map(formatChallengerRow),
      ),
      ...splitLinesIntoFields(
        'Kanto Gym #5 – #8 (Koga → Giovanni)',
        officialGyms.slice(4).map(formatChallengerRow),
      ),
      ...splitLinesIntoFields(
        'Tứ Đại Thiên Vương & Nhà Vô Địch (#9 – #13)',
        elites.map(formatChallengerRow),
      ),
    )
    .setFooter({
      text: `PokeNyan Arena  ·  Thắng Challenger trước để mở khóa người tiếp theo  ·  ${prefix}ms để mua thêm chiêu`,
    });
}

export function buildChallengerSelectRow(
  ownerUserId: string,
  challengers: readonly ChallengerOverviewItem[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  const unlockedList = challengers.filter((c) => c.unlocked);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`gympick:${ownerUserId}`)
    .setPlaceholder('Chọn Challenger muốn khiêu chiến...');

  for (const c of unlockedList) {
    const typeBtnEmoji = botEmojiRegistry.getTypeButtonEmoji(c.speciesTypes[0] ?? 'Normal');
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(`#${c.stage} · ${c.leaderName} (${c.speciesName} Lv.${c.level})`)
      .setValue(String(c.stage))
      .setDescription(
        c.cleared
          ? `${c.title} · Đã vượt qua (Tái đấu)`
          : `${c.title} · Thưởng ${formatNumber(c.rewardCoins)} PC`,
      );
    if (typeBtnEmoji) {
      opt.setEmoji(typeBtnEmoji);
    }
    menu.addOptions(opt);
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function formatTeamPips(
  team: readonly CombatantState[],
  activeIdx: number,
): string {
  return team
    .map((c, idx) => {
      if (c.hp <= 0) return '⚫';
      return idx === activeIdx ? '🟢' : '🔵';
    })
    .join('');
}

function formatFighterField(
  f: CombatantState,
  team: readonly CombatantState[],
  activeIdx: number,
): string {
  const shiny = f.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
  const types = f.species.types
    .map((t) => botEmojiRegistry.getTypeMention(t) || t)
    .join(' ');
  const pct = Math.max(0, Math.round((f.hp / Math.max(1, f.maxHp)) * 100));
  const bar = botEmojiRegistry.buildHpBar(f.hp, f.maxHp, 7);
  const statusTag = formatStatusTag(f.status, f.steelGuardTurns);
  const aliveCount = team.filter((c) => c.hp > 0).length;
  const teamBar = `${formatTeamPips(team, activeIdx)} (\`${aliveCount}/${team.length}\`)`;

  return [
    `${shiny}**${f.species.name}** \`Lv.${f.level}\` ${types}`,
    `${bar} \`${pct}%\``,
    `HP **${f.hp}/${f.maxHp}**${statusTag}`,
    `Đội: ${teamBar} · SPD **${f.spd}**`,
  ].join('\n');
}

export function buildBattleEmbed(
  battle: BattleSessionView,
  hasSceneImage = false,
): EmbedBuilder {
  const coinIcon = botEmojiRegistry.getCoinMention();
  const checkIcon = botEmojiRegistry.getCheckMention();
  const isFinished = battle.status === 'FINISHED';
  const modeTitle =
    battle.mode === 'GYM' && battle.gymSpec
      ? `#${battle.gymSpec.stage} · ${battle.gymSpec.leaderName} (${battle.gymSpec.badgeName})`
      : battle.mode === 'PVP'
        ? `Đấu Trường PvP (${battle.teamA.length}v${battle.teamB.length})`
        : `Đấu Trường PvE (${battle.teamA.length}v${battle.teamB.length})`;

  const color = isFinished
    ? battle.winnerOwnerId === battle.fighterA.ownerId
      ? 0x10b981
      : 0xef4444
    : 0xf43f5e;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${modeTitle} · Lượt ${battle.turnNumber}`)
    .addFields(
      {
        name: `${battle.fighterA.ownerName}`,
        value: formatFighterField(battle.fighterA, battle.teamA, battle.activeIndexA),
        inline: true,
      },
      {
        name: `${battle.fighterB.ownerName}`,
        value: formatFighterField(battle.fighterB, battle.teamB, battle.activeIndexB),
        inline: true,
      },
    );

  if (hasSceneImage) {
    embed.setImage('attachment://battle-arena.png');
  } else {
    embed.setThumbnail(
      battle.fighterB.isShiny
        ? battle.fighterB.species.shinyAnimatedSpriteUrl
        : battle.fighterB.species.animatedSpriteUrl,
    );
  }

  const logsBlock = battle.recentLogs.map(renderLogIcons).join('\n');
  let footerOrReward = '';
  if (isFinished && battle.winnerOwnerId) {
    const winnerName =
      battle.winnerOwnerId === battle.fighterA.ownerId
        ? battle.fighterA.ownerName
        : battle.fighterB.ownerName;
    footerOrReward = `\n\n${checkIcon} **Người chiến thắng: ${winnerName}!**`;
    if (battle.reward) {
      const ballPart =
        battle.reward.bonusBallId && battle.reward.bonusBallQty
          ? ` · ${botEmojiRegistry.getBallMention(battle.reward.bonusBallId)} **+${battle.reward.bonusBallQty}**`
          : '';
      const badgePart = battle.reward.firstClearBadgeName
        ? ` · **${battle.reward.firstClearBadgeName}**!`
        : '';
      footerOrReward += `\nThưởng: ${coinIcon} **+${formatNumber(battle.reward.coinsEarned)} PC** · **+${battle.reward.trainerXpEarned} XP Trainer** · **+${battle.reward.buddyXpEarned} XP/Team**${ballPart}${badgePart}`;
    }
  } else if (battle.status === 'ACTIVE') {
    const activeName =
      battle.activeTurnOwnerId === battle.fighterA.ownerId
        ? battle.fighterA.ownerName
        : battle.fighterB.ownerName;
    footerOrReward = `\n\nLượt ra chiêu hiện tại: **${activeName}** (${battle.fighterA.moves.length}/4 kỹ năng)`;
  }

  embed.setDescription(`${logsBlock}${footerOrReward}`);
  return embed;
}

export function buildBattleActionRows(
  battle: BattleSessionView,
): ActionRowBuilder<ButtonBuilder>[] {
  if (battle.status === 'FINISHED') {
    return [];
  }

  if (battle.status === 'CHALLENGED') {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`bt:accept:${battle.battleId}`)
          .setLabel('Chấp Nhận Thách Đấu')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`bt:decline:${battle.battleId}`)
          .setLabel('Từ Chối')
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }

  const isTurnA = battle.activeTurnOwnerId === battle.fighterA.ownerId;
  const activeFighter = isTurnA ? battle.fighterA : battle.fighterB;
  const activeTeam = isTurnA ? battle.teamA : battle.teamB;
  const activeIdx = isTurnA ? battle.activeIndexA : battle.activeIndexB;

  const moveButtons = activeFighter.moves.slice(0, 4).map((move, idx) => {
    const cd = activeFighter.cooldowns[move.id] ?? 0;
    const noHealUses = move.specialEffect === 'heal_38' && activeFighter.healUsesLeft <= 0;
    const label =
      cd > 0
        ? `${move.name} (${cd})`
        : move.specialEffect === 'heal_38'
          ? `${move.name} (${activeFighter.healUsesLeft})`
          : move.name;

    const style =
      move.category === 'status'
        ? ButtonStyle.Success
        : move.tier === 'ultimate'
          ? ButtonStyle.Danger
          : ButtonStyle.Primary;

    const btn = new ButtonBuilder()
      .setCustomId(`bt:slot:${battle.battleId}:${idx}`)
      .setLabel(label.slice(0, 80))
      .setStyle(style)
      .setDisabled(cd > 0 || noHealUses);

    const typeEmoji = botEmojiRegistry.getTypeButtonEmoji(move.type);
    if (typeEmoji) {
      btn.setEmoji(typeEmoji);
    }
    return btn;
  });

  moveButtons.push(
    new ButtonBuilder()
      .setCustomId(`bt:forfeit:${battle.battleId}`)
      .setLabel('Đầu Hàng')
      .setStyle(ButtonStyle.Secondary),
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(...moveButtons),
  ];

  if (activeTeam.length > 1) {
    const switchButtons = activeTeam.map((member, idx) => {
      const pct = Math.max(0, Math.round((member.hp / Math.max(1, member.maxHp)) * 100));
      const isCurrent = idx === activeIdx;
      const isFainted = member.hp <= 0;
      const label = isFainted
        ? `${member.species.name} (Ngất)`
        : isCurrent
          ? `${member.species.name} (Sân · ${pct}%)`
          : `Đổi: ${member.species.name} (${pct}%)`;
      const btn = new ButtonBuilder()
        .setCustomId(`bt:switch:${battle.battleId}:${idx}`)
        .setLabel(label.slice(0, 80))
        .setStyle(isCurrent ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(isCurrent || isFainted);
      const typeEmoji = botEmojiRegistry.getTypeButtonEmoji(member.species.types[0] ?? 'Normal');
      if (typeEmoji) {
        btn.setEmoji(typeEmoji);
      }
      return btn;
    });
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...switchButtons));
  }

  return rows;
}

export async function buildBattleMessagePayload(battle: BattleSessionView): Promise<{
  readonly embeds: EmbedBuilder[];
  readonly components: ActionRowBuilder<ButtonBuilder>[];
  readonly files: AttachmentBuilder[];
  readonly attachments: readonly never[];
}> {
  const sceneAttachment = await renderBattleSceneAttachment(battle);
  const embed = buildBattleEmbed(battle, Boolean(sceneAttachment));
  return {
    embeds: [embed],
    components: buildBattleActionRows(battle),
    files: sceneAttachment ? [sceneAttachment] : [],
    attachments: [],
  };
}

// ======================= TEAM 3 POKÉMON (;team / /team) =======================

function formatTeamMemberLine(member: TeamMemberView | null, slotIndex: number): string {
  if (!member) {
    return `\`[Ô #${slotIndex}]\` *(Trống — dùng \`set ${slotIndex} <tên|#mã>\` hoặc \`add <tên>\` để thêm)*`;
  }
  const shiny = member.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
  const fav = member.isFavorite ? `${botEmojiRegistry.getFavMention()} ` : '';
  const typeIcons = member.species.types
    .map((t) => botEmojiRegistry.getTypeMention(t) || t)
    .join('');
  const buddyTag = member.isBuddy ? ' · `Buddy`' : '';
  const leadTag = slotIndex === 1 ? ' · `Xuất trận đầu`' : '';
  const movesText = member.equippedMoves
    .map((m) => `${botEmojiRegistry.getTypeMention(m.type) || ''} ${m.name}`.trim())
    .join(', ');

  return [
    `\`[Ô #${slotIndex}]\` ${fav}${typeIcons} ${shiny}**${member.species.name}** \`Lv.${member.level}\` — **${member.ivPercent}% IV** · **CP ${formatNumber(member.stats.combatPower)}** (\`#${member.shortId}\`)${buddyTag}${leadTag}`,
    `└ HP **${member.stats.maxHp}** · ATK **${member.stats.atk}** · SpA **${member.stats.spAtk}** · SPD **${member.stats.spd}** · Chiêu (${member.equippedMoves.length}/4): *${movesText}*`,
  ].join('\n');
}

export function buildTeamEmbed(
  displayName: string,
  team: TeamView,
  prefix: string,
  notice?: string,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const lead = team.members[0];
  const slotLines = [0, 1, 2].map((i) => formatTeamMemberLine(team.slots[i] ?? null, i + 1));

  const headerParts = [
    `Tổng sức chiến đấu: **CP ${formatNumber(team.totalCp)}** (**${team.members.length}/3** thành viên)`,
    `Đội hình này được dùng cho **PvE (\`${prefix}bt\`)**, **Challengers (\`${prefix}gym\`)** và **PvP**. Các thành viên trong đội cũng được chia **50% EXP** khi bắt Pokémon!`,
    notice ? `\n${checkIcon} ${notice}` : '',
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(`Đội Hình Chiến Đấu (3v3) · ${displayName}`)
    .setDescription(headerParts.join('\n'))
    .addFields(
      ...splitLinesIntoFields('Ô #1 · Xuất Trận Đầu', [slotLines[0]!]),
      ...splitLinesIntoFields('Ô #2 · Đội Hình', [slotLines[1]!]),
      ...splitLinesIntoFields('Ô #3 · Đội Hình', [slotLines[2]!]),
    )
    .setFooter({
      text: `Lệnh nhanh: ${prefix}team set <1-3> <tên> · ${prefix}team swap <1-3> <1-3> · ${prefix}team auto`,
    });

  if (lead) {
    embed.setThumbnail(
      lead.isShiny ? lead.species.shinyAnimatedSpriteUrl : lead.species.animatedSpriteUrl,
    );
  }
  return embed;
}

export function buildTeamComponents(
  ownerUserId: string,
  team: TeamView,
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`team:auto:${ownerUserId}`)
      .setLabel('Tự Xếp 3 Con Mạnh Nhất')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`team:swap12:${ownerUserId}`)
      .setLabel('Đổi Ô 1 ↔ 2')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(team.members.length < 2),
    new ButtonBuilder()
      .setCustomId(`team:swap13:${ownerUserId}`)
      .setLabel('Đổi Ô 1 ↔ 3')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(team.members.length < 3),
  );
  return [row];
}

export function buildMoveShopEmbed(
  displayName: string,
  view: PokemonMoveShopView,
  prefix: string,
  notice?: string,
): EmbedBuilder {
  const coinIcon = botEmojiRegistry.getCoinMention();
  const checkIcon = botEmojiRegistry.getCheckMention();
  const shiny = view.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
  const typeText = view.species.types
    .map((t) => `${botEmojiRegistry.getTypeMention(t) || ''} **${t}**`.trim())
    .join(' · ');

  const equippedLines: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const move = view.equippedMoves[i];
    if (move) {
      const icon = botEmojiRegistry.getTypeMention(move.type) || `[${move.type}]`;
      const powerText = move.power > 0 ? `Pow ${move.power}` : 'Hỗ trợ';
      const stab = view.species.types.includes(move.type) ? ' · `STAB`' : '';
      equippedLines.push(`\`[${i + 1}]\` ${icon} **${move.name}** (${powerText}${stab})`);
    } else {
      equippedLines.push(`\`[${i + 1}]\` *(Ô trống — mua kỹ năng mới ở danh sách bên dưới)*`);
    }
  }

  const shopLines = view.shopEntries.map((entry) => {
    const icon = botEmojiRegistry.getTypeMention(entry.move.type) || `[${entry.move.type}]`;
    const cat =
      entry.move.category === 'physical'
        ? 'Vật lý'
        : entry.move.category === 'special'
          ? 'Phép'
          : 'Hỗ trợ';
    const powerInfo =
      entry.move.power > 0
        ? `Pow **${entry.move.power}** · Acc **${Math.round(entry.move.accuracy * 100)}%**`
        : 'Chiêu chiến thuật';
    const stab = view.species.types.includes(entry.move.type) ? ' · `STAB`' : '';
    const statusTag =
      entry.equippedSlot !== null
        ? `${checkIcon} *Đang lắp Ô #${entry.equippedSlot}*`
        : entry.unlocked
          ? `${checkIcon} *Đã mở (chưa lắp)*`
          : `${coinIcon} **${formatNumber(entry.move.price)} PC**`;

    return `\`[${entry.index}]\` ${icon} **${entry.move.name}** (${cat} · ${powerInfo}${stab}) — ${statusTag}\n└ *${entry.move.description}*`;
  });

  const descParts = [
    `${typeText}  ·  Kho \`#${view.boxIndex}\` (\`#${view.shortId}\`)  ·  ${coinIcon} Số dư: **${formatNumber(view.trainerCoins)} PC**`,
    notice ? `\n${notice}` : '',
  ].filter(Boolean);

  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`Cửa Hàng Kỹ Năng · ${shiny}${view.species.name} (Lv.${view.level})`)
    .setDescription(descParts.join('\n'))
    .addFields(
      ...splitLinesIntoFields(`Bộ Chiêu Hiện Tại (${view.equippedMoves.length}/4 Ô)`, equippedLines),
      ...splitLinesIntoFields(`Danh Sách Kỹ Năng Riêng Của ${view.species.name}`, shopLines),
    )
    .setThumbnail(
      view.isShiny ? view.species.shinyAnimatedSpriteUrl : view.species.animatedSpriteUrl,
    )
    .setFooter({
      text: `${displayName}  ·  Chọn menu bên dưới để Mua/Trang bị nhanh  ·  ${prefix}ms equip <số> <ô_1-4>`,
    });
}

export function buildMoveShopSelectRow(
  ownerUserId: string,
  view: PokemonMoveShopView,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`msbuy:${ownerUserId}:${view.creatureId}`)
    .setPlaceholder('Chọn kỹ năng để Mua (hoặc Lắp nhanh nếu đã có)...');

  for (const entry of view.shopEntries) {
    const typeEmoji = botEmojiRegistry.getTypeButtonEmoji(entry.move.type);
    const labelSuffix =
      entry.equippedSlot !== null
        ? `Đang ở Ô #${entry.equippedSlot}`
        : entry.unlocked
          ? 'Đã mở · Bấm để lắp'
          : `${formatNumber(entry.move.price)} PC`;
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(`[${entry.index}] ${entry.move.name} · ${labelSuffix}`.slice(0, 100))
      .setValue(entry.move.id)
      .setDescription(entry.move.description.slice(0, 100));
    if (typeEmoji) {
      opt.setEmoji(typeEmoji);
    }
    menu.addOptions(opt);
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildErrorNotice(message: string): string {
  return `${botEmojiRegistry.getCrossMention()} ${message}`;
}

// ======================= POKÉMON INSPECTOR (/info) =======================

function makeStatBar(iv: number): string {
  const filled = Math.max(0, Math.min(8, Math.round((iv / 31) * 8)));
  return `${'▰'.repeat(filled)}${'▱'.repeat(8 - filled)}`;
}

function formatMoveLine(
  slotNum: number,
  move: MoveSpec,
  speciesTypes: readonly string[],
): string {
  const typeIcon = botEmojiRegistry.getTypeMention(move.type) || `[${move.type}]`;
  const catLabel =
    move.category === 'physical' ? 'Vật lý' : move.category === 'special' ? 'Phép' : 'Hỗ trợ';
  const powerPart =
    move.power > 0
      ? `Pow **${move.power}** · Acc **${Math.round(move.accuracy * 100)}%**`
      : 'Chiêu chiến thuật';
  const stabTag = speciesTypes.includes(move.type) ? ' · `STAB`' : '';
  const cdTag = move.cooldownTurns > 0 ? ' · `Hồi 1 lượt`' : '';
  return `\`[${slotNum}]\` ${typeIcon} **${move.name}** (${catLabel} · ${powerPart}${stabTag}${cdTag})\n└ *${move.description}*`;
}

export function buildCreatureInspectEmbed(
  displayName: string,
  view: Exclude<CreatureInspectResult, null>,
  prefix: string,
): EmbedBuilder {
  const shinyIcon = botEmojiRegistry.getShinyMention();
  const favIcon = botEmojiRegistry.getFavMention();
  const rarityBadge = botEmojiRegistry.getRarityMention(view.species.rarity);
  const typeText = view.species.types
    .map((t) => {
      const icon = botEmojiRegistry.getTypeMention(t);
      return icon ? `${icon} **${t}**` : `**${t}**`;
    })
    .join(' · ');

  const isOwned = view.kind === 'OWNED';
  const level = isOwned ? view.level : view.referenceLevel;
  const ivs = isOwned ? view.ivs : view.referenceIvs;
  const isShiny = isOwned ? view.isShiny : false;
  const stats = computeComputedStats(view.species, ivs, level, isShiny);
  const ivTotal = isOwned
    ? view.ivTotal
    : ivs.hp + ivs.atk + ivs.def + ivs.spAtk + ivs.spDef + ivs.spd;
  const ivPercent = isOwned ? view.ivPercent : Number(((ivTotal / 186) * 100).toFixed(1));

  const dexCode = `#${String(view.species.dexNumber).padStart(4, '0')}`;
  const titlePrefix = `${isOwned && view.isFavorite ? `${favIcon} ` : ''}${isShiny ? `${shinyIcon} ` : ''}`;

  const headerTags: string[] = [
    `${rarityBadge} **${RARITY_CONFIGS[view.species.rarity].label}**`,
    typeText,
  ];
  if (isOwned && view.isBuddy) {
    headerTags.push('**Buddy Đồng Hành**');
  }
  if (isOwned && view.inMarket) {
    headerTags.push('`Đang khóa Chợ/Trade`');
  }

  const subMetaLine = isOwned
    ? [
        `Kho: \`#${view.boxIndex}/${view.totalOwned}\``,
        `Mã: \`#${view.shortId}\``,
        `Bóng: ${botEmojiRegistry.getBallMention(view.ballUsed)}`,
        `XP: **${view.nextLevelXp > 0 ? `${view.xp}/${view.nextLevelXp}` : 'MAX'}**`,
        `Lực chiến: **CP ${formatNumber(stats.combatPower)}**`,
      ].join('  ·  ')
    : `Chế độ tra cứu chuẩn Pokédex (**Lv.${level} · IV 15/31**)  ·  **CP ${formatNumber(stats.combatPower)}** *(Bạn chưa sở hữu con này)*`;

  const statRows = [
    { label: 'HP   ', real: stats.maxHp, base: view.species.baseStats.hp, iv: ivs.hp },
    { label: 'ATK  ', real: stats.atk, base: view.species.baseStats.atk, iv: ivs.atk },
    { label: 'DEF  ', real: stats.def, base: view.species.baseStats.def, iv: ivs.def },
    { label: 'SpATK', real: stats.spAtk, base: view.species.baseStats.spAtk, iv: ivs.spAtk },
    { label: 'SpDEF', real: stats.spDef, base: view.species.baseStats.spDef, iv: ivs.spDef },
    { label: 'SPD  ', real: stats.spd, base: view.species.baseStats.spd, iv: ivs.spd },
  ];

  const statTable = statRows
    .map((r) => {
      const realStr = String(r.real).padStart(3, ' ');
      const baseStr = String(r.base).padStart(3, ' ');
      const ivStr = String(r.iv).padStart(2, ' ');
      const maxStar = r.iv === 31 ? '★' : ' ';
      return `${r.label}  ${realStr}  (Gốc ${baseStr})  |  IV ${ivStr}/31${maxStar} ${makeStatBar(r.iv)}`;
    })
    .join('\n');

  let movesHeader = 'Bộ Kỹ Năng Khởi Đầu (2/4 Ô)';
  let movesBlock = '';
  if (isOwned) {
    movesHeader = `Bộ Kỹ Năng Chiến Đấu (${view.equippedMoves.length}/4 Ô)`;
    const lines: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const m = view.equippedMoves[i];
      if (m) {
        lines.push(formatMoveLine(i + 1, m, view.species.types));
      } else {
        lines.push(`\`[${i + 1}]\` *(Ô trống — mua kỹ năng riêng qua \`${prefix}ms #${view.shortId}\`)*`);
      }
    }
    movesBlock = lines.join('\n');
  } else {
    const pool = getSpeciesMovePool(view.species);
    movesBlock = [
      formatMoveLine(1, pool.starterMoves[0], view.species.types),
      formatMoveLine(2, pool.starterMoves[1], view.species.types),
      `*(Mỗi cá thể bắt về mở thêm ${pool.shopMoves.length} chiêu riêng trong Shop \`${prefix}ms\`)*`,
    ].join('\n');
  }

  const matchup = analyzeDefensiveMatchups(view.species.types);
  const fmtMatch = (items: readonly { readonly type: string; readonly mult: number }[]): string =>
    items
      .slice(0, 6)
      .map((m) => `${botEmojiRegistry.getTypeMention(m.type) || m.type} \`x${m.mult}\``)
      .join(' ');

  const matchupLines = [
    `**Yếu:** ${matchup.weaknesses.length > 0 ? fmtMatch(matchup.weaknesses) : '*Không có*'}`,
    `**Kháng:** ${matchup.resistances.length > 0 ? fmtMatch(matchup.resistances) : '*Không có*'}`,
  ];
  if (matchup.immunities.length > 0) {
    matchupLines.push(`**Miễn nhiễm (x0):** ${fmtMatch(matchup.immunities)}`);
  }
  const matchupText = matchupLines.join('\n');

  const evoLines: string[] =
    view.evolutions.length > 0
      ? view.evolutions.map((e) => {
          const readyTag = isOwned && level >= e.requiredLevel ? ` *(Đủ cấp \`${prefix}ev\`)*` : '';
          return `→ **${e.toName}** (Lv.${e.requiredLevel})${readyTag}`;
        })
      : ['*Không còn dạng tiến hóa thường*'];
  if (view.hasMegaForm && view.species.formType !== 'mega') {
    evoLines.push(`Có dạng **Mega** (\`${prefix}m\`)`);
  }

  const spriteUrl = isShiny
    ? view.species.shinyAnimatedSpriteUrl
    : view.species.animatedSpriteUrl;

  return new EmbedBuilder()
    .setColor(isShiny ? 0xe879f9 : RARITY_CONFIGS[view.species.rarity].colorHex)
    .setAuthor({
      name: `${displayName}  ·  Hồ Sơ Pokémon`,
    })
    .setTitle(`${titlePrefix}${view.species.name}  \`${dexCode}\`  ·  Lv.${level}`)
    .setDescription(`${headerTags.join('  ·  ')}\n${subMetaLine}`)
    .addFields(
      {
        name: `Chỉ Số Thực Chiến · Gốc (BST ${view.species.baseStats.bst}) · IV ${ivPercent}% (${ivTotal}/186)`,
        value: `\`\`\`\n${statTable}\n\`\`\``,
        inline: false,
      },
      {
        name: movesHeader,
        value: movesBlock,
        inline: false,
      },
      {
        name: 'Khắc Hệ Phòng Thủ',
        value: matchupText,
        inline: true,
      },
      {
        name: 'Tiến Hóa & Mega',
        value: evoLines.join('\n'),
        inline: true,
      },
    )
    .setImage(spriteUrl)
    .setFooter({
      text: isOwned
        ? `Gõ ${prefix}info <số_thứ_tự|tên|#mã> để soi Pokémon khác  ·  ${prefix}bt để mang ra đấu trường`
        : `Gõ ${prefix}p để săn hoặc ${prefix}mk ${view.species.name.toLowerCase()} để tìm trên chợ`,
    });
}

export function buildCreatureInspectButtons(
  ownerUserId: string,
  view: OwnedCreatureInspectView,
): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`info:nav:${ownerUserId}:${Math.max(0, view.boxIndex - 2)}`)
      .setLabel('◀ Trước')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(view.boxIndex <= 1),
    new ButtonBuilder()
      .setCustomId(`info:nav:${ownerUserId}:${view.boxIndex}`)
      .setLabel('Sau ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(view.boxIndex >= view.totalOwned),
    new ButtonBuilder()
      .setCustomId(`info:buddy:${ownerUserId}:${view.creatureId}`)
      .setLabel(view.isBuddy ? 'Đang là Buddy' : 'Đặt Buddy')
      .setStyle(view.isBuddy ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(view.isBuddy || view.inMarket),
    new ButtonBuilder()
      .setCustomId(`info:fav:${ownerUserId}:${view.creatureId}`)
      .setLabel(view.isFavorite ? 'Bỏ Yêu Thích' : 'Yêu Thích')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`info:train:${ownerUserId}:${view.creatureId}`)
      .setLabel(view.level >= 100 ? 'Đã Lv.100' : '+1 Cấp (400 PC)')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(view.level >= 100 || view.inMarket),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`info:ms:${ownerUserId}:${view.creatureId}`)
      .setLabel(`Shop Kỹ Năng (${view.equippedMoves.length}/4)`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(view.inMarket),
  );

  return [row1, row2];
}
