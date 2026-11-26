import {
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { isGen6Or7Pokemon } from '@/domain/data/gen6-7-pokemon';
import {
  BALL_ORDER,
  BALL_SPECS,
  LURE_SPECS,
  RARITY_SPECS,
  ROD_SPECS,
} from '@/domain/data/pokemeow-data';
import {
  TYPE_LABELS_VI,
  calculateDefensiveMatchups,
  lookupPokemonDex,
  type PokemonType,
} from '@/domain/data/type-chart';
import { optimizerService } from '@/domain/services/optimizer-service';
import {
  FishingCatchRateStrategy,
  WildCatchRateStrategy,
  calculateTotalCatchBuff,
} from '@/domain/strategies/catch-rate-strategy';
import type {
  BallEvaluation,
  BallId,
  CatchLogEntry,
  EncounterSource,
  GenerationGroup,
  LureId,
  RarityId,
  RodId,
  ValuationMode,
} from '@/domain/types';
import { formatCoins, formatPercent, formatRoi, formatSignedCoins } from '@/lib/format';
import type { IBotStateStore } from '../store/store-interface';

function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

export function formatDurationRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  if (hours === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatTypeList(types: readonly PokemonType[]): string {
  if (types.length === 0) return 'Không có';
  return types.map((t) => `**${TYPE_LABELS_VI[t]}**`).join(', ');
}

function getMissingChannelPermissions(interaction: ChatInputCommandInteraction): readonly string[] {
  const perms = interaction.appPermissions;
  const missing: string[] = [];

  if (!perms.has(PermissionFlagsBits.ViewChannel)) {
    missing.push('View Channel (Xem kênh)');
  }
  if (!perms.has(PermissionFlagsBits.ReadMessageHistory)) {
    missing.push('Read Message History (Đọc lịch sử tin nhắn)');
  }
  if (!perms.has(PermissionFlagsBits.SendMessages)) {
    missing.push('Send Messages (Gửi tin nhắn)');
  }
  if (!perms.has(PermissionFlagsBits.EmbedLinks)) {
    missing.push('Embed Links (Nhúng liên kết/thẻ Embed)');
  }

  return missing;
}

function formatEvaluationLines(evaluations: readonly BallEvaluation[]): string {
  return evaluations
    .map((item) => {
      const ball = BALL_SPECS[item.ballId];
      const prefix = item.isBestEv ? '⭐ ' : '• ';
      const tag =
        item.recommendationTag === 'optimal'
          ? ' [Tối ưu EV]'
          : item.recommendationTag === 'safe'
            ? ' [An toàn 100%]'
            : '';
      return `${prefix}**${ball.name}** (\`${ball.shortCode}\`): **${formatPercent(item.catchRate, 1)}** · EV \`${formatSignedCoins(item.expectedValue)}\` · ROI \`${formatRoi(item.roiPct)}\`${tag}`;
    })
    .join('\n');
}

async function handleBallCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const rarityId = interaction.options.getString('rarity', true) as RarityId;
  const genInput = interaction.options.getString('gen');
  const genGroup: GenerationGroup = genInput === 'gen6_7' ? 'gen6_7' : 'gen1_5_8';

  const profile = await store.getUserProfile(interaction.user.id);
  const strategy = new WildCatchRateStrategy(genGroup);
  const result = optimizerService.evaluateRarity(rarityId, strategy, profile.buffs, profile.economy);

  const rarity = RARITY_SPECS[rarityId];
  const bestBall = BALL_SPECS[result.bestBall.ballId];
  const totalBuffPct = Math.round(calculateTotalCatchBuff(profile.buffs) * 100);
  const modeLabel =
    profile.buffs.valuationMode === 'release' ? 'Xu mặt (;release)' : 'Giá chợ (;market)';

  const embed = new EmbedBuilder()
    .setColor(hexToNumber(rarity.hexColor))
    .setTitle(`🎯 Ball Optimizer — ${rarity.label}`)
    .setDescription(
      `Gợi ý tối ưu EV: **${bestBall.name} (\`${bestBall.shortCode}\`)** — Tỉ lệ bắt **${formatPercent(result.bestBall.catchRate, 1)}** · EV **${formatSignedCoins(result.bestBall.expectedValue)}**`,
    )
    .addFields(
      {
        name: 'So sánh tất cả các bóng',
        value: formatEvaluationLines(result.evaluations),
      },
      {
        name: 'Cấu hình đang áp dụng',
        value: `${strategy.name} · Định giá: **${modeLabel}** · Buff Catch: **+${totalBuffPct}%** · Amulet: **${profile.buffs.amuletCoins}**`,
      },
    )
    .setFooter({ text: 'PokéMeow Companion · Chỉ tính toán hỗ trợ, không tự động gửi lệnh' });

  await interaction.reply({ embeds: [embed] });
}

async function handleFishCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const rarityId = interaction.options.getString('rarity', true) as RarityId;
  const rodOpt = interaction.options.getString('rod') as RodId | null;
  const lureOpt = interaction.options.getString('lure') as LureId | null;
  const goldenOpt = interaction.options.getBoolean('golden_hour');

  const currentProfile = await store.getUserProfile(interaction.user.id);
  const effectiveProfile =
    rodOpt !== null || lureOpt !== null || goldenOpt !== null
      ? await store.updateUserFishingSetup(interaction.user.id, {
          rod: rodOpt ?? currentProfile.fishingSetup.rod,
          lure: lureOpt ?? currentProfile.fishingSetup.lure,
          goldenHour: goldenOpt ?? currentProfile.fishingSetup.goldenHour,
        })
      : currentProfile;

  const setup = effectiveProfile.fishingSetup;
  const strategy = new FishingCatchRateStrategy(setup);
  const metrics = optimizerService.calculateFishingMetrics(setup, effectiveProfile.buffs);
  const result = optimizerService.evaluateRarity(
    rarityId,
    strategy,
    effectiveProfile.buffs,
    effectiveProfile.economy,
    setup.goldenHour ? 1.5 : 1,
  );

  const rarity = RARITY_SPECS[rarityId];
  const bestBall = BALL_SPECS[result.bestBall.ballId];

  const embed = new EmbedBuilder()
    .setColor(0x06b6d4)
    .setTitle(`🎣 Fishing Optimizer — ${rarity.label}`)
    .setDescription(
      `Gợi ý tối ưu EV: **${bestBall.name} (\`${bestBall.shortCode}\`)** — Tỉ lệ bắt **${formatPercent(result.bestBall.catchRate, 1)}** · EV **${formatSignedCoins(result.bestBall.expectedValue)}**`,
    )
    .addFields(
      {
        name: 'So sánh các loại bóng (gồm Diveball)',
        value: formatEvaluationLines(result.evaluations),
      },
      {
        name: 'Thông số bộ câu cá',
        value: [
          `Cần: **${ROD_SPECS[setup.rod].name}**`,
          `Mồi: **${LURE_SPECS[setup.lure].name}**`,
          `Golden Hour: **${setup.goldenHour ? 'Bật' : 'Tắt'}**`,
          `Spawn: **${formatPercent(metrics.effectiveSpawnRate, 0)}** · Shiny: **1/${metrics.shinyOddsDenominator.toLocaleString('en-US')}**`,
        ].join(' · '),
      },
    )
    .setFooter({ text: 'Dùng /buffs set để chỉnh Amulet Coins & Chế độ định giá' });

  await interaction.reply({ embeds: [embed] });
}

async function handleDexCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString('pokemon', true).trim();
  await interaction.deferReply();

  const dex = await lookupPokemonDex(query);
  if (!dex) {
    await interaction.editReply({
      content: `❌ Không tìm thấy Pokémon **${query}**. Hãy kiểm tra tên tiếng Anh (VD: \`Dragonite\`, \`Garchomp\`, \`Scizor\`, \`Tapu-Koko\`).`,
    });
    return;
  }

  const matchups = calculateDefensiveMatchups(dex.types);
  const hardCatch = isGen6Or7Pokemon(dex.name);

  const embed = new EmbedBuilder()
    .setColor(hardCatch ? 0xf59e0b : 0x38bdf8)
    .setTitle(
      `📖 Pokédex & Khắc hệ Battle — ${dex.name}${dex.dexNumber ? ` (#${dex.dexNumber})` : ''}`,
    )
    .setDescription(
      [
        `• Hệ: ${formatTypeList(dex.types)}`,
        dex.baseStatTotal ? `• Tổng chỉ số gốc (BST): **${dex.baseStatTotal}**` : null,
        `• Tỉ lệ bắt PokéMeow: **${hardCatch ? '⚠️ Gen 6–7 (Khó bắt hơn chuẩn)' : '✅ Gen 1–5 / 8+ (Chuẩn)'}**`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    )
    .addFields(
      {
        name: '🔥 Nên dùng chiêu hệ này để đánh (Khắc chế)',
        value: [
          matchups.quadWeak.length > 0
            ? `• **Sát thương x4 (Cực mạnh):** ${formatTypeList(matchups.quadWeak)}`
            : null,
          matchups.doubleWeak.length > 0
            ? `• **Sát thương x2:** ${formatTypeList(matchups.doubleWeak)}`
            : null,
          matchups.quadWeak.length === 0 && matchups.doubleWeak.length === 0
            ? '• Không có điểm yếu x2/x4'
            : null,
        ]
          .filter((line): line is string => line !== null)
          .join('\n'),
      },
      {
        name: '🛡️ Tránh dùng các hệ này (Bị kháng / Miễn nhiễm)',
        value:
          [
            matchups.immune.length > 0
              ? `• **Miễn nhiễm (x0):** ${formatTypeList(matchups.immune)}`
              : null,
            matchups.doubleResistant.length > 0
              ? `• **Kháng mạnh (x0.25):** ${formatTypeList(matchups.doubleResistant)}`
              : null,
            matchups.resistant.length > 0
              ? `• **Kháng (x0.5):** ${formatTypeList(matchups.resistant)}`
              : null,
          ]
            .filter((line): line is string => line !== null)
            .join('\n') || 'Không có kháng đặc biệt',
      },
    );

  if (dex.spriteUrl) {
    embed.setThumbnail(dex.spriteUrl);
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleBuffsCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const sub = interaction.options.getSubcommand(true);

  if (sub === 'reset') {
    const profile = await store.resetUserBuffs(interaction.user.id);
    await interaction.reply({
      content: `✅ Đã khôi phục buff về mặc định chuẩn Wiki (Cooldown \`;p\` ${profile.buffs.wildCooldownSec}s, \`;f\` ${profile.buffs.fishCooldownSec}s).`,
      ephemeral: true,
    });
    return;
  }

  let profile = await store.getUserProfile(interaction.user.id);

  if (sub === 'set') {
    const amuletCoins = interaction.options.getInteger('amulet_coins');
    const clanCatchRatePct = interaction.options.getInteger('clan_cr');
    const patreonNinja = interaction.options.getBoolean('patreon_ninja');
    const quickHandsSavePct = interaction.options.getInteger('quick_hands');
    const eventCatchBoostPct = interaction.options.getInteger('event_boost');
    const shinyCharmOwned = interaction.options.getBoolean('shiny_charm');
    const includePremierBall = interaction.options.getBoolean('include_premier');
    const valuationOpt = interaction.options.getString('valuation_mode');
    const wildCooldownSec = interaction.options.getInteger('wild_cd');
    const fishCooldownSec = interaction.options.getInteger('fish_cd');
    const reminders = interaction.options.getBoolean('reminders');

    const valuationMode: ValuationMode | undefined =
      valuationOpt === 'release' || valuationOpt === 'market' ? valuationOpt : undefined;

    profile = await store.updateUserBuffs(interaction.user.id, {
      ...(amuletCoins !== null ? { amuletCoins } : {}),
      ...(clanCatchRatePct !== null ? { clanCatchRatePct } : {}),
      ...(patreonNinja !== null ? { patreonNinja } : {}),
      ...(quickHandsSavePct !== null ? { quickHandsSavePct } : {}),
      ...(eventCatchBoostPct !== null ? { eventCatchBoostPct } : {}),
      ...(shinyCharmOwned !== null ? { shinyCharmOwned } : {}),
      ...(includePremierBall !== null ? { includePremierBall } : {}),
      ...(valuationMode !== undefined ? { valuationMode } : {}),
      ...(wildCooldownSec !== null ? { wildCooldownSec } : {}),
      ...(fishCooldownSec !== null ? { fishCooldownSec } : {}),
    });

    if (reminders !== null) {
      profile = await store.setUserReminders(interaction.user.id, reminders);
    }
  }

  const b = profile.buffs;
  const totalCatchPct = Math.round(calculateTotalCatchBuff(b) * 100);

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`⚙️ Cấu hình Buff của ${interaction.user.username}`)
    .addFields(
      {
        name: 'Tỉ lệ bắt & Thưởng',
        value: [
          `• Amulet Coins: **${b.amuletCoins}** (+${b.amuletCoins * 5}% PokéCoins)`,
          `• Clan Catch Rate: **+${b.clanCatchRatePct}%**`,
          `• Patreon Ninja: **${b.patreonNinja ? 'Có (+5%)' : 'Không'}**`,
          `• Quick Hands: **${b.quickHandsSavePct}%**`,
          `• Event Boost: **+${b.eventCatchBoostPct}%**`,
          `• Tổng cộng Catch Boost: **+${totalCatchPct}%**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Định giá & Nhắc giờ',
        value: [
          `• Chế độ EV: **${b.valuationMode === 'release' ? 'Xu mặt (;release)' : 'Giá chợ (;market)'}**`,
          `• Shiny Charm: **${b.shinyCharmOwned ? 'Có' : 'Không'}**`,
          `• Xét Premierball: **${b.includePremierBall ? 'Có' : 'Không'}**`,
          `• Cooldown \`/pokemon\` (\`;p\`): **${b.wildCooldownSec}s**`,
          `• Cooldown \`/fish\` (\`;f\`): **${b.fishCooldownSec}s**`,
          `• Nhắc cooldown: **${profile.remindersEnabled ? 'Đang bật' : 'Đang tắt'}**`,
        ].join('\n'),
        inline: true,
      },
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleHelperCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const sub = interaction.options.getSubcommand(true);
  const channelId = interaction.channelId;
  const missingPerms = getMissingChannelPermissions(interaction);

  const permWarning =
    missingPerms.length > 0
      ? `\n\n⚠️ **Cảnh báo thiếu quyền tại kênh này:** Bot đang thiếu quyền ${missingPerms.map((p) => `\`${p}\``).join(', ')}. Hãy vào **Edit Channel (⚙️) → Permissions → chọn Bot** và bật đủ các quyền trên!`
      : '';

  if (sub === 'on') {
    const autoCleanOpt = interaction.options.getInteger('auto_clean_sec');
    const onlyRareOpt = interaction.options.getBoolean('only_rare_plus');
    const current = await store.getChannelSettings(channelId);

    const updated = await store.setChannelSettings(channelId, {
      enabled: true,
      autoCleanSec: autoCleanOpt ?? current.autoCleanSec,
      onlyRarePlus: onlyRareOpt ?? current.onlyRarePlus,
    });

    const cleanDesc =
      updated.autoCleanSec > 0
        ? `Tự xoá gợi ý ngay khi ném bóng (hoặc sau **${updated.autoCleanSec}s**)`
        : 'Giữ nguyên tin nhắn (không tự xoá)';

    await interaction.reply({
      content:
        `✅ Đã **BẬT** chế độ hỗ trợ thụ động trong kênh này:\n` +
        `• Gợi ý bóng EV, tự nhận diện **Gen 6–7** & tách biệt nhiều người chơi (${updated.onlyRarePlus ? 'Chỉ từ **Rare** trở lên' : 'Mọi độ hiếm'}).\n` +
        `• Chống trôi chat: ${cleanDesc}.\n` +
        `• Tự động theo dõi **Quest (\`;q\`)**, **CatchBot (\`;cb\`)**, **Golden Hour (\`;seaflute\`)** & cảnh báo **CAPTCHA**.` +
        permWarning,
    });
    return;
  }

  if (sub === 'off') {
    await store.setChannelEnabled(channelId, false);
    await interaction.reply({
      content: '🛑 Đã **TẮT** chế độ hỗ trợ thụ động trong kênh này.',
    });
    return;
  }

  const settings = await store.getChannelSettings(channelId);
  await interaction.reply({
    content:
      (settings.enabled
        ? `🟢 Kênh này đang **BẬT** hỗ trợ thụ động · Tự dọn tin nhắn: **${settings.autoCleanSec > 0 ? `${settings.autoCleanSec}s` : 'Tắt'}** · Lọc gợi ý: **${settings.onlyRarePlus ? 'Từ Rare+' : 'Tất cả'}**.`
        : '⚪ Kênh này đang **TẮT** chế độ hỗ trợ thụ động. Dùng `/helper on` để bật.') +
      permWarning,
    ephemeral: true,
  });
}

async function handleCatchbotCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const sub = interaction.options.getSubcommand(true);
  const userId = interaction.user.id;

  if (sub === 'cancel') {
    await store.setUserCatchbotSchedule(userId, null, null);
    await interaction.reply({
      content: '🗑️ Đã huỷ hẹn giờ nhắc thu hoạch CatchBot (`;cb`).',
      ephemeral: true,
    });
    return;
  }

  if (sub === 'set') {
    const hours = interaction.options.getInteger('hours', true);
    const minutes = interaction.options.getInteger('minutes') ?? 0;
    const totalMs = (hours * 3600 + minutes * 60) * 1000;

    if (totalMs < 60_000) {
      await interaction.reply({
        content: '⚠️ Thời gian hẹn giờ CatchBot tối thiểu là 1 phút.',
        ephemeral: true,
      });
      return;
    }

    const returnAtMs = Date.now() + totalMs;
    await store.setUserCatchbotSchedule(userId, returnAtMs, interaction.channelId);

    const discordUnix = Math.floor(returnAtMs / 1000);
    await interaction.reply({
      content: `🤖 Đã đặt hẹn nhắc thu hoạch **CatchBot (\`;cb\`)** sau **${formatDurationRemaining(totalMs)}** (lúc <t:${discordUnix}:T> · <t:${discordUnix}:R>) tại kênh này!`,
    });
    return;
  }

  const profile = await store.getUserProfile(userId);
  if (!profile.catchbotReturnAtMs || profile.catchbotReturnAtMs <= Date.now()) {
    await interaction.reply({
      content:
        '🤖 Hiện bạn không có hẹn giờ **CatchBot (`;cb`)** nào đang chạy.\n• Khi bạn gõ `;cb` hoặc `;cb run` trong kênh đã bật `/helper on`, bot sẽ tự đọc thời gian còn lại để hẹn giờ!\n• Hoặc đặt thủ công bằng `/cb set hours:... minutes:...`.',
      ephemeral: true,
    });
    return;
  }

  const remainingMs = profile.catchbotReturnAtMs - Date.now();
  const discordUnix = Math.floor(profile.catchbotReturnAtMs / 1000);
  await interaction.reply({
    content: `🤖 **CatchBot (\`;cb\`)** của bạn sẽ hoàn thành sau **${formatDurationRemaining(remainingMs)}** (lúc <t:${discordUnix}:T> · <t:${discordUnix}:R>).`,
    ephemeral: true,
  });
}

async function handleGoldenHourCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const sub = interaction.options.getSubcommand(true);

  if (sub === 'cancel') {
    await store.setGoldenHourSchedule({ startAtMs: null, channelId: null, warned5m: false });
    await interaction.reply({
      content: '🗑️ Đã huỷ lịch báo thức Golden Fishing Hour.',
      ephemeral: true,
    });
    return;
  }

  if (sub === 'set') {
    const hours = interaction.options.getInteger('hours', true);
    const minutes = interaction.options.getInteger('minutes') ?? 0;
    const totalMs = (hours * 3600 + minutes * 60) * 1000;

    if (totalMs < 60_000) {
      await interaction.reply({
        content: '⚠️ Thời gian đặt báo thức tối thiểu là 1 phút.',
        ephemeral: true,
      });
      return;
    }

    const startAtMs = Date.now() + totalMs;
    await store.setGoldenHourSchedule({
      startAtMs,
      channelId: interaction.channelId,
      warned5m: totalMs <= 5 * 60_000,
    });

    const unix = Math.floor(startAtMs / 1000);
    await interaction.reply({
      content: `🌊 Đã đặt báo thức **Golden Fishing Hour** vào lúc <t:${unix}:T> (<t:${unix}:R>)! Bot sẽ nhắc trước 5 phút và khi bắt đầu tại kênh này.`,
    });
    return;
  }

  const gh = await store.getGoldenHourSchedule();
  if (!gh.startAtMs || gh.startAtMs <= Date.now()) {
    await interaction.reply({
      content:
        '🌊 Chưa có lịch **Golden Fishing Hour** nào đang chờ.\n• Gõ `;seaflute` trong kênh đã bật `/helper on` để bot tự động bắt lịch, hoặc đặt thủ công bằng `/goldenhour set`.',
      ephemeral: true,
    });
    return;
  }

  const unix = Math.floor(gh.startAtMs / 1000);
  await interaction.reply({
    content: `🌊 **Golden Fishing Hour** tiếp theo bắt đầu sau **${formatDurationRemaining(gh.startAtMs - Date.now())}** (lúc <t:${unix}:T> · <t:${unix}:R>).`,
  });
}

async function handleQuestCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const sub = interaction.options.getSubcommand(true);

  if (sub === 'clear') {
    await store.setUserQuests(interaction.user.id, []);
    await interaction.reply({
      content: '🗑️ Đã xoá danh sách nhiệm vụ đang theo dõi.',
      ephemeral: true,
    });
    return;
  }

  const profile = await store.getUserProfile(interaction.user.id);
  if (profile.quests.length === 0) {
    await interaction.reply({
      content:
        '🎯 Chưa có nhiệm vụ nào được đồng bộ.\n👉 Hãy gõ `;q` hoặc `;quest` trong kênh đã bật `/helper on`, bot sẽ tự động lưu danh sách nhiệm vụ và đếm tiến độ mỗi khi bạn bắt trúng Pokémon!',
      ephemeral: true,
    });
    return;
  }

  const lines = profile.quests.map((q) => {
    const pct = Math.min(100, Math.round((q.current / q.goal) * 100));
    const filled = Math.round(pct / 10);
    const bar = `${'🟩'.repeat(filled)}${'⬛'.repeat(10 - filled)}`;
    const doneIcon = q.current >= q.goal ? '✅' : '⏳';
    return `${doneIcon} **#${q.index}:** ${q.description}\n${bar} \`${q.current}/${q.goal}\` (${pct}%)`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`🎯 Tiến độ Quest hằng ngày — ${interaction.user.username}`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Gõ lại ;q bất cứ lúc nào để đồng bộ lại chính xác từ PokéMeow' });

  await interaction.reply({ embeds: [embed] });
}

async function handleLeaderboardCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const sub = interaction.options.getSubcommand(true);
  const usersMap = await store.getAllUsersSnapshot();

  if (sub === 'hof') {
    const hof = await store.getHallOfFame();
    if (hof.length === 0) {
      await interaction.reply({
        content:
          '🏛️ **Bảo Tàng Hàng Hiếm (Hall of Fame)** chưa có ghi nhận nào! Khi thành viên trong kênh bắt trúng **Legendary**, **Shiny** hoặc **Golden**, chiến tích sẽ được lưu danh tại đây!',
      });
      return;
    }

    const lines = hof.slice(0, 15).map((entry, idx) => {
      const rarity = RARITY_SPECS[entry.rarityId];
      const ball = BALL_SPECS[entry.ballId];
      const unix = Math.floor(entry.timestamp / 1000);
      const who = entry.displayName || `<@${entry.userId}>`;
      return `**${idx + 1}.** 🌟 **${entry.pokemonName || rarity.label}** (${rarity.label}) — bắt bởi **${who}** bằng *${ball.name}* (<t:${unix}:R>)`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('🏛️ Bảo Tàng Hàng Hiếm Server (Hall of Fame)')
      .setDescription(lines.join('\n'));

    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (sub === 'pity') {
    const entries = Object.entries(usersMap)
      .filter(([, p]) => p.logs.length > 0)
      .map(([uid, p]) => ({
        uid,
        name: p.displayName || `<@${uid}>`,
        total: p.logs.length,
        pity: optimizerService.calculatePityStats(p.logs),
      }))
      .sort(
        (a, b) =>
          b.pity.encountersSinceLegendaryOrShiny - a.pity.encountersSinceLegendaryOrShiny,
      );

    if (entries.length === 0) {
      await interaction.reply({ content: 'Chưa có dữ liệu lượt bắt nào trong server.' });
      return;
    }

    const lines = entries.slice(0, 10).map((item, idx) => {
      const lastRare = item.pity.lastRareCatchName
        ? ` · Gần nhất: **${item.pity.lastRareCatchName}**`
        : '';
      return `**${idx + 1}. ${item.name}** — Chưa ra L/Shiny: **${item.pity.encountersSinceLegendaryOrShiny}** lượt · Chưa ra SR+: **${item.pity.encountersSinceSuperRarePlus}** lượt${lastRare}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle('🕯️ Bảng Xếp Hạng "Độ Đen" (Dry-Streak / Pity Counter)')
      .setDescription(lines.join('\n'));

    await interaction.reply({ embeds: [embed] });
    return;
  }

  const windowOpt = interaction.options.getString('window') ?? 'all';
  let cutoffMs = 0;
  let windowLabel = 'Mọi thời đại';
  if (windowOpt === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    cutoffMs = d.getTime();
    windowLabel = 'Trong hôm nay';
  } else if (windowOpt === '7d') {
    cutoffMs = Date.now() - 7 * 24 * 3600 * 1000;
    windowLabel = '7 ngày gần nhất';
  }

  const rankings = Object.entries(usersMap)
    .map(([uid, profile]) => {
      const logs =
        cutoffMs > 0
          ? profile.logs.filter((entry) => entry.timestamp >= cutoffMs)
          : profile.logs;
      const report = optimizerService.calculateQuickProfitReport(
        logs,
        profile.buffs,
        profile.economy,
      );
      return {
        uid,
        name: profile.displayName || `<@${uid}>`,
        report,
      };
    })
    .filter((item) => item.report.totalEncounters > 0)
    .sort((a, b) => b.report.releaseNetProfit - a.report.releaseNetProfit);

  if (rankings.length === 0) {
    await interaction.reply({
      content: `🏆 Chưa có lượt bắt nào trong khoảng **${windowLabel}**.`,
    });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = rankings.slice(0, 10).map((item, idx) => {
    const medal = medals[idx] ?? `**#${idx + 1}**`;
    return `${medal} **${item.name}** — Lãi xu mặt: \`${formatSignedCoins(item.report.releaseNetProfit)}\` · Bắt trúng: **${item.report.totalCaught}/${item.report.totalEncounters}** (${formatPercent(item.report.catchSuccessRate, 0)})`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`🏆 Đua Top Cày Xu Server — ${windowLabel}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Tính theo Lãi Xu Mặt thực tế (;release duplicates)' });

  await interaction.reply({ embeds: [embed] });
}

async function handleProfitCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const windowOpt = interaction.options.getString('window') ?? 'all';
  const profile = await store.getUserProfile(interaction.user.id);

  const now = Date.now();
  let cutoffMs = 0;
  let windowLabel = 'Toàn bộ phiên chơi';

  if (windowOpt === '15m') {
    cutoffMs = now - 15 * 60 * 1000;
    windowLabel = '15 phút gần nhất';
  } else if (windowOpt === '1h') {
    cutoffMs = now - 60 * 60 * 1000;
    windowLabel = '1 giờ gần nhất';
  } else if (windowOpt === 'today') {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    cutoffMs = startOfDay.getTime();
    windowLabel = 'Trong hôm nay';
  }

  const filteredLogs =
    cutoffMs > 0 ? profile.logs.filter((entry) => entry.timestamp >= cutoffMs) : profile.logs;

  const report = optimizerService.calculateQuickProfitReport(
    filteredLogs,
    profile.buffs,
    profile.economy,
  );

  if (report.totalEncounters === 0) {
    await interaction.reply({
      content: `📉 Chưa có dữ liệu bắt Pokémon nào trong khoảng **${windowLabel}**.`,
      ephemeral: true,
    });
    return;
  }

  const ballBreakdownLines = BALL_ORDER.filter((id) => report.byBall[id].used > 0).map((id) => {
    const bucket = report.byBall[id];
    const spec = BALL_SPECS[id];
    return `• **${spec.name}** (\`${spec.shortCode}\`): ${bucket.caught}/${bucket.used} trúng · Xu mặt \`${formatSignedCoins(bucket.releaseNet)}\``;
  });

  const embed = new EmbedBuilder()
    .setColor(report.releaseNetProfit >= 0 ? 0x10b981 : 0xef4444)
    .setTitle(`💰 Tính nhanh Lời / Lỗ — ${windowLabel}`)
    .setDescription(
      `Tổng **${report.totalCaught}/${report.totalEncounters}** bắt trúng (**${formatPercent(report.catchSuccessRate, 1)}**) · Đã chi tiền bóng: \`${formatCoins(report.totalBallSpent)}\``,
    )
    .addFields(
      {
        name: '💵 Lời/Lỗ Xu Mặt (;release trùng)',
        value: [
          `• Tổng thu xu + xả trùng: \`${formatCoins(report.releaseGrossEarned)}\``,
          `• **Lãi/Lỗ tiền mặt ròng:** \`${formatSignedCoins(report.releaseNetProfit)}\``,
        ].join('\n'),
        inline: true,
      },
      {
        name: '💎 Lời/Lỗ Tài Sản (;market)',
        value: [
          `• Tổng giá trị ước tính: \`${formatCoins(report.marketGrossEarned)}\``,
          `• **Lãi/Lỗ tài sản ròng:** \`${formatSignedCoins(report.marketNetProfit)}\``,
        ].join('\n'),
        inline: true,
      },
      {
        name: '⚡ Tốc độ cày (Ước tính theo nhịp hiện tại)',
        value: `~**${report.catchesPerHour.toLocaleString('en-US')}** con/giờ · Xu mặt: \`${formatSignedCoins(report.releaseCoinsPerHour)}/giờ\``,
      },
    );

  if (ballBreakdownLines.length > 0) {
    embed.addFields({
      name: '🎯 Hiệu quả theo từng loại bóng',
      value: ballBreakdownLines.join('\n'),
    });
  }

  embed.setFooter({
    text: 'Mở Web Dashboard -> tab Discord Live Sync để điều khiển & xem biểu đồ trực quan',
  });

  await interaction.reply({ embeds: [embed] });
}

async function handleLogCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const source = interaction.options.getString('source', true) as EncounterSource;
  const rarityId = interaction.options.getString('rarity', true) as RarityId;
  const ballId = interaction.options.getString('ball', true) as BallId;
  const caught = interaction.options.getBoolean('caught', true);
  const pokemonName = interaction.options.getString('pokemon')?.trim() ?? '';

  const profile = await store.getUserProfile(interaction.user.id);
  const profit = optimizerService.computeSingleCatchProfit(
    rarityId,
    ballId,
    caught,
    profile.buffs,
    profile.economy,
  );

  const entry: CatchLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    source,
    rarityId,
    ballId,
    caught,
    pokemonName,
    ballCost: profit.ballCost,
    coinsEarned: profit.coinsEarned,
    netProfit: profit.netProfit,
  };

  await store.addUserLog(interaction.user.id, entry);

  const rarity = RARITY_SPECS[rarityId];
  const ball = BALL_SPECS[ballId];
  const displayTarget = pokemonName.length > 0 ? `${pokemonName} (${rarity.label})` : rarity.label;

  await interaction.reply({
    content: `${caught ? '✅' : '❌'} Đã ghi **${caught ? 'Bắt được' : 'Chạy mất'}** ${displayTarget} bằng **${ball.name}** (${source === 'fishing' ? ';f' : ';p'}) · Lời/Lỗ: \`${formatSignedCoins(profit.netProfit)}\``,
  });
}

async function handleStatsCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  const sub = interaction.options.getSubcommand(true);

  if (sub === 'clean') {
    const removed = await store.cleanCorruptedLogs(interaction.user.id);
    await interaction.reply({
      content:
        removed > 0
          ? `🧹 Đã dọn sạch **${removed}** bản ghi lỗi cũ (\`-100,000 PC\` / \`wild\`) và giữ nguyên toàn bộ lượt bắt thật của bạn!`
          : '✨ Nhật ký của bạn đã sạch sẽ, không còn bản ghi lỗi cũ nào!',
      ephemeral: true,
    });
    return;
  }

  if (sub === 'reset') {
    await store.clearUserLogs(interaction.user.id);
    await interaction.reply({
      content: '🗑️ Đã xoá toàn bộ nhật ký phiên bắt Pokémon của bạn trên Discord.',
      ephemeral: true,
    });
    return;
  }

  const profile = await store.getUserProfile(interaction.user.id);
  const stats = optimizerService.calculateSessionStats(profile.logs);
  const report = optimizerService.calculateQuickProfitReport(
    profile.logs,
    profile.buffs,
    profile.economy,
  );
  const pity = optimizerService.calculatePityStats(profile.logs);

  const embed = new EmbedBuilder()
    .setColor(report.releaseNetProfit >= 0 ? 0x10b981 : 0xef4444)
    .setTitle(`📊 Thống kê phiên chơi — ${interaction.user.username}`)
    .addFields(
      {
        name: 'Tổng quan & Bộ đếm Độ Đen (Pity)',
        value: [
          `• Tổng lượt gặp: **${stats.totalEncounters}**`,
          `• Bắt được: **${stats.totalCaught}** (${formatPercent(stats.catchSuccessRate, 1)})`,
          `• Bộ sưu tập hiếm: **L: ${stats.rareHighlights.legendary}** · **S: ${stats.rareHighlights.shiny}** · **G: ${stats.rareHighlights.golden}**`,
          `• Chuỗi chưa ra SR+: **${pity.encountersSinceSuperRarePlus}** lượt · Chưa ra L/Shiny: **${pity.encountersSinceLegendaryOrShiny}** lượt`,
        ].join('\n'),
      },
      {
        name: 'Tài chính (PokéCoins)',
        value: [
          `• Chi phí bóng: \`${formatCoins(stats.totalSpent)}\``,
          `• **Lời/Lỗ Xu Mặt (\`;release\`):** \`${formatSignedCoins(report.releaseNetProfit)}\``,
          `• **Lời/Lỗ Tài Sản (\`;market\`):** \`${formatSignedCoins(report.marketNetProfit)}\``,
        ].join('\n'),
      },
    )
    .setFooter({
      text: 'Mẹo: Gõ /stats clean nếu muốn xoá riêng các dòng lỗi -100k PC từ phiên bản cũ',
    });

  await interaction.reply({ embeds: [embed] });
}

export async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  store: IBotStateStore,
): Promise<void> {
  try {
    await store.updateUserIdentity(
      interaction.user.id,
      interaction.user.globalName ?? interaction.user.username,
      interaction.user.displayAvatarURL({ size: 128 }),
    );

    switch (interaction.commandName) {
      case 'ball':
        await handleBallCommand(interaction, store);
        break;
      case 'fish':
        await handleFishCommand(interaction, store);
        break;
      case 'dex':
        await handleDexCommand(interaction);
        break;
      case 'buffs':
        await handleBuffsCommand(interaction, store);
        break;
      case 'helper':
        await handleHelperCommand(interaction, store);
        break;
      case 'cb':
        await handleCatchbotCommand(interaction, store);
        break;
      case 'goldenhour':
        await handleGoldenHourCommand(interaction, store);
        break;
      case 'quest':
        await handleQuestCommand(interaction, store);
        break;
      case 'leaderboard':
        await handleLeaderboardCommand(interaction, store);
        break;
      case 'profit':
        await handleProfitCommand(interaction, store);
        break;
      case 'log':
        await handleLogCommand(interaction, store);
        break;
      case 'stats':
        await handleStatsCommand(interaction, store);
        break;
      default:
        await interaction.reply({
          content: 'Lệnh không được hỗ trợ.',
          ephemeral: true,
        });
    }
  } catch (error) {
    console.error(`[InteractionError] /${interaction.commandName}:`, error);
    const errorReply = {
      content: 'Đã xảy ra lỗi khi xử lý lệnh. Vui lòng thử lại.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorReply);
    } else {
      await interaction.reply(errorReply);
    }
  }
}
