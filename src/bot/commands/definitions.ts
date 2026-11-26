import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { BALL_CATALOG } from '@/game/catalog/ball-catalog';

const ballChoices = BALL_CATALOG.map((ball) => ({
  name: `${ball.name} (${ball.price.toLocaleString('en-US')} PC)`,
  value: ball.id,
}));

export const SLASH_COMMANDS: readonly RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder()
    .setName('p')
    .setDescription('Tìm và bắt Pokémon hoang dã ngoài tự nhiên')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Xem cửa hàng Poké Ball và bảng giá')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Mua Poké Ball từ cửa hàng')
    .addStringOption((opt) =>
      opt
        .setName('ball')
        .setDescription('Loại bóng muốn mua')
        .setRequired(true)
        .addChoices(...ballChoices),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('quantity')
        .setDescription('Số lượng muốn mua (1 - 500)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(500),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('bag')
    .setDescription('Xem túi đồ, số lượng Poké Ball và số dư PokéCoins')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('dex')
    .setDescription('Xem bộ sưu tập Pokémon bạn đã bắt được')
    .addIntegerOption((opt) =>
      opt
        .setName('page')
        .setDescription('Số trang muốn xem')
        .setRequired(false)
        .setMinValue(1),
    )
    .addStringOption((opt) =>
      opt
        .setName('filter')
        .setDescription('Lọc theo shiny, mega, fav, legendary, super_rare, rare hoặc tên Pokémon')
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('fav')
    .setDescription('Khóa hoặc mở khóa Pokémon yêu thích để không bị thả nhầm khi dùng /release')
    .addStringOption((opt) =>
      opt
        .setName('target')
        .setDescription('Tên Pokémon hoặc mã ngắn (#abc123). Bỏ trống = Pokémon mới bắt nhất')
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('mega')
    .setDescription('Thức tỉnh Mega / Primal bằng cách hiến tế 5/6 Pokémon Legendary')
    .addStringOption((opt) =>
      opt
        .setName('pokemon')
        .setDescription('Tên Pokémon Mega muốn thức tỉnh (ví dụ: rayquaza, charizard x, lucario)')
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Xem hồ sơ huấn luyện viên, cấp độ và thành tích')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('release')
    .setDescription(
      'Thả Pokémon trùng (giữ IV cao nhất, mọi Shiny, Legendary và Pokémon yêu thích) để lấy PC',
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Điểm danh nhận PokéCoins và bóng miễn phí mỗi 24 giờ')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('lb')
    .setDescription('Xem bảng xếp hạng cộng đồng PokeNyan')
    .addStringOption((opt) =>
      opt
        .setName('metric')
        .setDescription('Tiêu chí xếp hạng')
        .setRequired(false)
        .addChoices(
          { name: 'Tổng lượt bắt', value: 'catches' },
          { name: 'Giàu nhất (PokéCoins)', value: 'coins' },
          { name: 'Nhiều Shiny nhất', value: 'shinies' },
          { name: 'Cấp độ cao nhất', value: 'level' },
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Xem hướng dẫn chơi và danh sách lệnh của PokeNyan')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Bật, tắt hoặc kiểm tra trạng thái bot trong server (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('Hành động muốn thực hiện')
        .setRequired(false)
        .addChoices(
          { name: 'Bật bot (On)', value: 'on' },
          { name: 'Tắt bot (Off)', value: 'off' },
          { name: 'Xem trạng thái (Status)', value: 'status' },
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('Xem hoặc đổi prefix lệnh riêng cho server để tránh trùng bot khác (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('value')
        .setDescription('Prefix mới (1–5 ký tự không dấu cách, ví dụ: n!, ., ?)')
        .setRequired(false)
        .setMaxLength(5),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Giới hạn kênh được phép hoặc cấm bot hoạt động trong server (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('Thao tác với kênh')
        .setRequired(true)
        .addChoices(
          { name: 'Cho phép kênh (Allow)', value: 'allow' },
          { name: 'Chặn kênh (Block)', value: 'block' },
          { name: 'Xem danh sách (List)', value: 'list' },
          { name: 'Cho phép lại tất cả (Reset)', value: 'reset' },
        ),
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Chọn kênh áp dụng (mặc định là kênh hiện tại)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .toJSON(),
];
