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

  new SlashCommandBuilder()
    .setName('quest')
    .setDescription('Xem nhiệm vụ ngày/tuần và nhận thưởng Premier/Master Ball')
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('Xem hoặc nhận thưởng nhiệm vụ đã xong')
        .setRequired(false)
        .addChoices(
          { name: 'Xem danh sách nhiệm vụ', value: 'view' },
          { name: 'Nhận tất cả thưởng', value: 'claim' },
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('buddy')
    .setDescription('Chọn và huấn luyện Pokémon đồng hành tăng XP & tỉ lệ bắt')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('Xem thông tin Buddy hiện tại và điều kiện tiến hóa'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Đặt một Pokémon trong kho làm Buddy đồng hành')
        .addStringOption((opt) =>
          opt
            .setName('pokemon')
            .setDescription('Tên Pokémon hoặc mã ngắn (#abc123). Bỏ trống = con mạnh nhất')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('train')
        .setDescription('Huấn luyện Buddy lên cấp nhanh bằng PokéCoins (400 PC/cấp)')
        .addIntegerOption((opt) =>
          opt
            .setName('levels')
            .setDescription('Số cấp muốn tăng (1 - 50)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50),
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('evolve')
    .setDescription('Xem danh sách hoặc tiến hóa Pokémon đủ cấp độ lên dạng mạnh hơn')
    .addStringOption((opt) =>
      opt
        .setName('pokemon')
        .setDescription('Tên hoặc #mã Pokémon muốn tiến hóa (bỏ trống để xem danh sách)')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('into')
        .setDescription('Nhánh tiến hóa nếu có nhiều nhánh (vd: vaporeon, umbreon, raichu)')
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('f')
    .setDescription('Câu cá Pokémon hệ Nước & Shiny, nâng cấp cần câu và mua mồi')
    .addSubcommand((sub) =>
      sub.setName('cast').setDescription('Thả cần câu cá Pokémon hệ Nước'),
    )
    .addSubcommand((sub) =>
      sub.setName('shop').setDescription('Xem cần câu (Good/Super/Master Rod) và mồi câu'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Mua cần câu mới hoặc mồi câu cá')
        .addStringOption((opt) =>
          opt
            .setName('item')
            .setDescription('Mã vật phẩm: good, super, mrod, lure, gold')
            .setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('quantity')
            .setDescription('Số lượng mồi muốn mua (1 - 200)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(200),
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('market')
    .setDescription('Chợ giao dịch Pokémon toàn server (thuế 5%)')
    .addSubcommand((sub) =>
      sub
        .setName('browse')
        .setDescription('Xem danh sách Pokémon đang rao bán trên chợ')
        .addStringOption((opt) =>
          opt
            .setName('filter')
            .setDescription('Lọc theo shiny, legendary, super_rare, rare hoặc tên Pokémon')
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt.setName('page').setDescription('Số trang muốn xem').setRequired(false).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('sell')
        .setDescription('Đăng bán Pokémon lên chợ công cộng')
        .addStringOption((opt) =>
          opt.setName('pokemon').setDescription('Tên hoặc #mã Pokémon muốn bán').setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('price')
            .setDescription('Giá bán bằng PokéCoins (100 - 50,000,000)')
            .setRequired(true)
            .setMinValue(100)
            .setMaxValue(50_000_000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Mua một Pokémon trên chợ theo mã đơn (#số)')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('Mã số đơn hàng trên chợ').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Gỡ Pokémon của bạn khỏi chợ')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('Mã số đơn hàng cần gỡ').setRequired(true).setMinValue(1),
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Trao đổi Pokémon & PokéCoins an toàn 2 bước giữa 2 người chơi')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Mở phiên giao dịch mới với một người chơi khác')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Người muốn giao dịch cùng').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('pokemon').setDescription('Tên hoặc #mã Pokémon bạn đưa ra (tùy chọn)').setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('coins')
            .setDescription('Số PokéCoins bạn đưa thêm (tùy chọn)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(50_000_000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('offer')
        .setDescription('Cập nhật Pokémon hoặc PokéCoins của bạn trong phiên trade hiện tại')
        .addStringOption((opt) =>
          opt.setName('pokemon').setDescription('Tên hoặc #mã Pokémon muốn đặt (bỏ trống = gỡ Pokémon)').setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('coins')
            .setDescription('Số PokéCoins muốn đặt (mặc định 0)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(50_000_000),
        ),
    )
    .addSubcommand((sub) => sub.setName('view').setDescription('Xem lại phiên trade hiện tại'))
    .addSubcommand((sub) => sub.setName('confirm').setDescription('Xác nhận đồng ý giao dịch'))
    .addSubcommand((sub) => sub.setName('cancel').setDescription('Hủy phiên giao dịch đang mở'))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Đấu trường Pokémon theo lượt (PvE hoang dã, 8 Gym Leader, PvP)')
    .addSubcommand((sub) =>
      sub.setName('pve').setDescription('Đánh theo lượt với Pokémon hoang dã kiếm PC & XP cho Buddy'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('gym')
        .setDescription('Khiêu chiến Thủ lĩnh Gym Kanto (1 - 8) lấy Huy hiệu & Master Ball')
        .addIntegerOption((opt) =>
          opt
            .setName('stage')
            .setDescription('Tầng Gym (1 - 8). Bỏ trống = Gym tiếp theo của bạn')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(8),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('pvp')
        .setDescription('Thách đấu 1v1 theo lượt với huấn luyện viên khác')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Đối thủ muốn thách đấu').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Xem danh sách 8 Gym Leader và tiến độ Huy hiệu của bạn'),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Xác minh chống macro (Captcha) để tiếp tục bắt Pokémon')
    .addStringOption((opt) =>
      opt
        .setName('answer')
        .setDescription('Tên Pokémon trong hình (bỏ trống để xem lại câu hỏi)')
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Xem đầy đủ chỉ số, IV từng dòng, khắc hệ và 4 skill chiến đấu của Pokémon')
    .addStringOption((opt) =>
      opt
        .setName('pokemon')
        .setDescription('Tên Pokémon, số thứ tự kho (;d), #mã ngắn hoặc loài bất kỳ (bỏ trống = Buddy)')
        .setRequired(false),
    )
    .toJSON(),
];
