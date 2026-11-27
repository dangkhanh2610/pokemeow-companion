import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getBallSpec } from '@/game/catalog/ball-catalog';
import { RARITY_CONFIGS } from '@/game/catalog/creature-catalog';
import { BAIT_CATALOG, ROD_CATALOG } from '@/game/catalog/fishing-catalog';
import type { CombatantState } from '@/game/engine/battle-engine';
import type { BattleSessionView, GymLeaderSpec } from '@/game/services/battle-service';
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
import type { ClaimQuestsOutcome, QuestProgressItem, QuestSummary } from '@/game/services/quest-service';
import type { BallId, RarityTier } from '@/game/types';
import { botEmojiRegistry } from '../emoji-registry';

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
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

function hpBar(hp: number, maxHp: number): string {
  const segments = 10;
  const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  const filled = Math.round(ratio * segments);
  return `[${'■'.repeat(filled)}${'□'.repeat(segments - filled)}] ${hp}/${maxHp} HP`;
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
  const evoText =
    buddy.evolutions.length > 0
      ? buddy.evolutions
          .map(
            (e) =>
              `→ **${e.toName}** (cần **Lv.${e.requiredLevel}**${buddy.level >= e.requiredLevel ? ` — Sẵn sàng \`${prefix}ev\`` : ''})`,
          )
          .join('\n')
      : '*Đã đạt cấp tiến hóa tối đa (hoặc không có dạng tiến hóa tiếp theo)*';

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`Buddy Đồng Hành · ${displayName}`)
    .setDescription(
      [
        `${tag ? `${tag} ` : ''}**${buddy.speciesName}** (\`#${buddy.id.slice(-6)}\`)`,
        `Cấp độ: **Lv.${buddy.level}** (${buddy.nextLevelXp > 0 ? `XP: **${buddy.xp}/${buddy.nextLevelXp}**` : '**MAX**'}) · **${buddy.ivPercent}% IV**`,
        `Hiệu ứng: **+4% tỉ lệ bắt** · **+15% XP Trainer** · Huấn luyện: \`${prefix}bd train [cấp]\` (${coinIcon} ${formatNumber(TRAIN_COST_PER_LEVEL)}/cấp)`,
      ].join('\n'),
    )
    .addFields({ name: 'Chuỗi Tiến Hóa', value: evoText, inline: false })
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
        `${timerIcon} Bơi mất <t:${expireEpoch}:R> · Chọn Poké Ball để thu phục (+20% thưởng PC)!`,
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

export function buildFishingShopEmbed(gear: FishingGearStatus, prefix: string): EmbedBuilder {
  const coinIcon = botEmojiRegistry.getCoinMention();
  const checkIcon = botEmojiRegistry.getCheckMention();

  const rodLines = ROD_CATALOG.map((r) => {
    const owned = r.tier <= gear.rod.tier;
    const tag = owned ? `${checkIcon} *Đã có*` : `${coinIcon} **${formatNumber(r.price)} PC**`;
    return `\`[${r.shopIndex}]\` **${r.name}** (\`${r.shortCode}\`) — ${tag}\n└ ${r.description}`;
  });

  const baitLines = BAIT_CATALOG.map((b) => {
    const qty = gear.baits[b.id];
    return `\`[${b.shopIndex}]\` **${b.name}** (\`${b.shortCode}\`) — ${coinIcon} **${formatNumber(b.price)} PC** · *Đang có: ${qty}*\n└ ${b.description}`;
  });

  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle('Cửa Hàng Dụng Cụ Câu Cá')
    .setDescription(
      [
        `${coinIcon} Số dư hiện có: **${formatNumber(gear.coins)} PC** · Cần hiện tại: **${gear.rod.name}**`,
        `Mua nhanh: \`${prefix}f buy <mã> [sl]\` (vd: \`${prefix}f buy good\` hoặc \`${prefix}f buy lure 5\`)`,
      ].join('\n'),
    )
    .addFields(
      { name: 'Cần Câu ([1] – [4])', value: rodLines.join('\n'), inline: false },
      { name: 'Mồi Câu ([5] – [6])', value: baitLines.join('\n'), inline: false },
    );
}

export function buildBuyFishingItemEmbed(
  displayName: string,
  res: Extract<BuyFishingItemOutcome, { readonly ok: true }>,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();
  return new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`Mua Đồ Câu Thành Công · ${displayName}`)
    .setDescription(
      [
        `${checkIcon} Đã mua **${res.quantityBought}x ${res.itemName}** (-${coinIcon} **${formatNumber(res.totalCost)} PC**)`,
        `Số dư còn lại: ${coinIcon} **${formatNumber(res.newCoinsBalance)} PC**`,
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

// ======================= BATTLE SYSTEM (/battle) =======================

export function buildGymListEmbed(
  displayName: string,
  gyms: readonly (GymLeaderSpec & { readonly cleared: boolean })[],
  prefix: string,
): EmbedBuilder {
  const checkIcon = botEmojiRegistry.getCheckMention();
  const coinIcon = botEmojiRegistry.getCoinMention();
  const clearedCount = gyms.filter((g) => g.cleared).length;

  const lines = gyms.map((g) => {
    const ballIcon = botEmojiRegistry.getBallMention(g.rewardBall);
    const status = g.cleared ? `${checkIcon} ` : `\`[${g.stage}]\` `;
    return `${status}**Gym ${g.stage} · ${g.leaderName}** (Lv.${g.level}) — *${g.badgeName}*\n└ Thưởng lần đầu: ${coinIcon} **${formatNumber(g.rewardCoins)}** + ${ballIcon} **${g.rewardQty}x**`;
  });

  return new EmbedBuilder()
    .setColor(0xe11d48)
    .setTitle(`Đấu Trường 8 Gym · ${displayName} (${clearedCount}/8 Huy Hiệu)`)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: `Dùng ${prefix}bt gym [1-8] hoặc /battle gym để khiêu chiến`,
    });
}

function formatFighterField(f: CombatantState): string {
  const shiny = f.isShiny ? `${botEmojiRegistry.getShinyMention()} ` : '';
  const types = f.species.types
    .map((t) => botEmojiRegistry.getTypeMention(t) || t)
    .join(' ');
  return [
    `${shiny}**${f.species.name}** (Lv.${f.level}) ${types}`,
    `\`${hpBar(f.hp, f.maxHp)}\``,
    `ATK ${f.atk} · DEF ${f.def} · SPD ${f.spd}`,
  ].join('\n');
}

export function buildBattleEmbed(battle: BattleSessionView): EmbedBuilder {
  const coinIcon = botEmojiRegistry.getCoinMention();
  const checkIcon = botEmojiRegistry.getCheckMention();
  const isFinished = battle.status === 'FINISHED';
  const modeTitle =
    battle.mode === 'GYM' && battle.gymSpec
      ? `Gym ${battle.gymSpec.stage} · ${battle.gymSpec.leaderName}`
      : battle.mode === 'PVP'
        ? 'Đấu Trường PvP'
        : 'Đấu Trường PvE';

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
        value: formatFighterField(battle.fighterA),
        inline: true,
      },
      {
        name: `${battle.fighterB.ownerName}`,
        value: formatFighterField(battle.fighterB),
        inline: true,
      },
    )
    .setThumbnail(
      battle.fighterB.isShiny
        ? battle.fighterB.species.shinyAnimatedSpriteUrl
        : battle.fighterB.species.animatedSpriteUrl,
    );

  const logsBlock = battle.recentLogs.join('\n');
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
        ? ` · Huy hiệu **${battle.reward.firstClearBadgeName}**!`
        : '';
      footerOrReward += `\nThưởng: ${coinIcon} **+${formatNumber(battle.reward.coinsEarned)} PC** · **+${battle.reward.trainerXpEarned} XP Trainer** · **+${battle.reward.buddyXpEarned} XP Fighter**${ballPart}${badgePart}`;
    }
  } else if (battle.status === 'ACTIVE') {
    const activeName =
      battle.activeTurnOwnerId === battle.fighterA.ownerId
        ? battle.fighterA.ownerName
        : battle.fighterB.ownerName;
    footerOrReward = `\n\nLượt ra chiêu hiện tại: **${activeName}**`;
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

  const activeFighter =
    battle.activeTurnOwnerId === battle.fighterA.ownerId ? battle.fighterA : battle.fighterB;

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`bt:move:${battle.battleId}:primary`)
        .setLabel(`${activeFighter.primaryMove.name} (${activeFighter.primaryMove.type})`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`bt:move:${battle.battleId}:ultimate`)
        .setLabel(
          activeFighter.ultimateCooldown > 0
            ? `${activeFighter.ultimateMove.name} (Hồi ${activeFighter.ultimateCooldown} lượt)`
            : `${activeFighter.ultimateMove.name} (${activeFighter.ultimateMove.type})`,
        )
        .setStyle(ButtonStyle.Danger)
        .setDisabled(activeFighter.ultimateCooldown > 0),
      new ButtonBuilder()
        .setCustomId(`bt:move:${battle.battleId}:recover`)
        .setLabel(`Hồi Phục (${activeFighter.recoverUsesLeft})`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(activeFighter.recoverUsesLeft <= 0),
      new ButtonBuilder()
        .setCustomId(`bt:forfeit:${battle.battleId}`)
        .setLabel('Đầu Hàng')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildErrorNotice(message: string): string {
  return `${botEmojiRegistry.getCrossMention()} ${message}`;
}
