import { SlashCommandBuilder, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import {
  BALL_ORDER,
  BALL_SPECS,
  LURE_ORDER,
  LURE_SPECS,
  RARITY_ORDER,
  RARITY_SPECS,
  ROD_ORDER,
  ROD_SPECS,
} from '@/domain/data/pokemeow-data';

const ALL_RARITY_CHOICES = RARITY_ORDER.map((id) => ({
  name: RARITY_SPECS[id].label,
  value: id,
}));

const FISHABLE_RARITY_CHOICES = RARITY_ORDER.filter(
  (id) => RARITY_SPECS[id].availableInFishing,
).map((id) => ({
  name: RARITY_SPECS[id].label,
  value: id,
}));

const BALL_CHOICES = BALL_ORDER.map((id) => ({
  name: `${BALL_SPECS[id].name} (${BALL_SPECS[id].shortCode})`,
  value: id,
}));

const ROD_CHOICES = ROD_ORDER.map((id) => ({
  name: ROD_SPECS[id].name,
  value: id,
}));

const LURE_CHOICES = LURE_ORDER.map((id) => ({
  name: LURE_SPECS[id].name,
  value: id,
}));

export const COMMAND_DEFINITIONS: readonly RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder()
    .setName('ball')
    .setDescription('Tính bóng tối ưu theo Expected Value (EV) cho Pokémon Wild (;p)')
    .addStringOption((opt) =>
      opt
        .setName('rarity')
        .setDescription('Độ hiếm của Pokémon')
        .setRequired(true)
        .addChoices(...ALL_RARITY_CHOICES),
    )
    .addStringOption((opt) =>
      opt
        .setName('gen')
        .setDescription('Nhóm thế hệ Pokémon')
        .setRequired(false)
        .addChoices(
          { name: 'Gen 1–5 & 8 (Chuẩn)', value: 'gen1_5_8' },
          { name: 'Gen 6 & 7 (Khó bắt hơn)', value: 'gen6_7' },
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Tính bóng tối ưu khi câu cá (;f) kèm cần câu, mồi và Diveball')
    .addStringOption((opt) =>
      opt
        .setName('rarity')
        .setDescription('Độ hiếm cá câu được')
        .setRequired(true)
        .addChoices(...FISHABLE_RARITY_CHOICES),
    )
    .addStringOption((opt) =>
      opt
        .setName('rod')
        .setDescription('Cần câu đang dùng')
        .setRequired(false)
        .addChoices(...ROD_CHOICES),
    )
    .addStringOption((opt) =>
      opt
        .setName('lure')
        .setDescription('Mồi câu đang dùng')
        .setRequired(false)
        .addChoices(...LURE_CHOICES),
    )
    .addBooleanOption((opt) =>
      opt
        .setName('golden_hour')
        .setDescription('Đang trong Golden Fishing Hour?')
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('dex')
    .setDescription('Tra cứu hệ Pokémon, điểm yếu khắc chế x4 / x2 khi đấu Battle (;b) & kiểm tra Gen 6–7')
    .addStringOption((opt) =>
      opt
        .setName('pokemon')
        .setDescription('Tên Pokémon tiếng Anh (VD: Dragonite, Scizor, Froakie, Garchomp...)')
        .setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('buffs')
    .setDescription('Xem hoặc cấu hình Buff tài khoản (Amulet, Clan, Ninja, Chế độ định giá)')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('Xem cấu hình buff hiện tại của bạn'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Cập nhật các chỉ số buff, chế độ tính giá và thời gian nhắc cooldown')
        .addIntegerOption((opt) =>
          opt
            .setName('amulet_coins')
            .setDescription('Số Amulet Coins (0–10)')
            .setMinValue(0)
            .setMaxValue(10),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('clan_cr')
            .setDescription('Clan Catch Rate Perk (%) (0–25)')
            .setMinValue(0)
            .setMaxValue(25),
        )
        .addBooleanOption((opt) =>
          opt.setName('patreon_ninja').setDescription('Có Patreon Ninja (+5% tỉ lệ bắt)?'),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('quick_hands')
            .setDescription('Quick Hands giữ bóng (%) (0–20)')
            .setMinValue(0)
            .setMaxValue(20),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('event_boost')
            .setDescription('Event Catch Boost (%) (0–30)')
            .setMinValue(0)
            .setMaxValue(30),
        )
        .addBooleanOption((opt) =>
          opt.setName('shiny_charm').setDescription('Đang sở hữu Shiny Charm?'),
        )
        .addBooleanOption((opt) =>
          opt.setName('include_premier').setDescription('Xét Premierball trong bảng gợi ý EV?'),
        )
        .addStringOption((opt) =>
          opt
            .setName('valuation_mode')
            .setDescription('Chế độ tính EV & Lời/Lỗ: Giá xu thả (;release) hay Giá bán chợ (;market)')
            .addChoices(
              { name: 'Xu mặt thực tế (;release duplicates)', value: 'release' },
              { name: 'Giá thị trường (;market)', value: 'market' },
            ),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('wild_cd')
            .setDescription('Thời gian nhắc cooldown ;p (4–30 giây, chuẩn 8s)')
            .setMinValue(4)
            .setMaxValue(30),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('fish_cd')
            .setDescription('Thời gian nhắc cooldown ;f (4–30 giây, chuẩn 20s)')
            .setMinValue(4)
            .setMaxValue(30),
        )
        .addBooleanOption((opt) =>
          opt.setName('reminders').setDescription('Bật/tắt ping nhắc khi hết cooldown?'),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('reset').setDescription('Khôi phục toàn bộ buff về mặc định chuẩn Wiki'),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('helper')
    .setDescription('Cấu hình chế độ gợi ý bóng, tự xoá tin nhắn chống trôi chat & cảnh báo CAPTCHA')
    .addSubcommand((sub) =>
      sub
        .setName('on')
        .setDescription('Bật chế độ hỗ trợ thụ động trong kênh này')
        .addIntegerOption((opt) =>
          opt
            .setName('auto_clean_sec')
            .setDescription('Tự động xoá tin nhắn gợi ý/nhắc giờ sau X giây (0 = không xoá, mặc định 12s)')
            .setMinValue(0)
            .setMaxValue(60),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('only_rare_plus')
            .setDescription('Chỉ hiện thẻ gợi ý bóng từ Rare trở lên (ẩn Common & Uncommon)?'),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('off').setDescription('Tắt chế độ hỗ trợ thụ động trong kênh này'),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Kiểm tra trạng thái hỗ trợ của kênh hiện tại'),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('cb')
    .setDescription('Hẹn giờ nhắc thu hoạch CatchBot (;cb)')
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Xem thời gian còn lại đến khi thu hoạch CatchBot'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Đặt hẹn giờ nhắc thu hoạch CatchBot thủ công')
        .addIntegerOption((opt) =>
          opt
            .setName('hours')
            .setDescription('Số giờ (0–24)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(24),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('minutes')
            .setDescription('Số phút (0–59)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(59),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('cancel').setDescription('Huỷ hẹn giờ thu hoạch CatchBot hiện tại'),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('goldenhour')
    .setDescription('Báo thức trước 5 phút & đúng giờ bắt đầu Golden Fishing Hour (;seaflute)')
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Xem lịch Golden Fishing Hour đã lưu'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Đặt báo thức Golden Fishing Hour thủ công')
        .addIntegerOption((opt) =>
          opt
            .setName('hours')
            .setDescription('Còn bao nhiêu giờ nữa bắt đầu (0–24)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(24),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('minutes')
            .setDescription('Còn bao nhiêu phút nữa bắt đầu (0–59)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(59),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('cancel').setDescription('Huỷ lịch báo thức Golden Fishing Hour'),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('quest')
    .setDescription('Theo dõi tiến độ nhiệm vụ hằng ngày (;quest / ;q)')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('Xem tiến độ các nhiệm vụ đang theo dõi của bạn'),
    )
    .addSubcommand((sub) =>
      sub.setName('clear').setDescription('Xoá danh sách nhiệm vụ đã lưu'),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Bảng xếp hạng Đua Top Server, Bảo Tàng Hàng Hiếm (Hall of Fame) & Bộ đếm Độ Đen')
    .addSubcommand((sub) =>
      sub
        .setName('coins')
        .setDescription('Top cày PokéCoins xu mặt (;release) giữa các thành viên trong server')
        .addStringOption((opt) =>
          opt
            .setName('window')
            .setDescription('Khoảng thời gian xếp hạng')
            .addChoices(
              { name: 'Trong hôm nay', value: 'today' },
              { name: '7 ngày gần nhất', value: '7d' },
              { name: 'Mọi thời đại', value: 'all' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('hof').setDescription('Xem Bảo Tàng Hàng Hiếm (Legendary / Shiny / Golden) của server'),
    )
    .addSubcommand((sub) =>
      sub.setName('pity').setDescription('Xem Bộ đếm Độ Đen (chuỗi chưa ra SR / Legendary / Shiny)'),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('profit')
    .setDescription('Tính nhanh Lời/Lỗ thật (Xu mặt ;release vs Giá chợ ;market) & tốc độ cày PC/giờ')
    .addStringOption((opt) =>
      opt
        .setName('window')
        .setDescription('Khoảng thời gian muốn tính')
        .setRequired(false)
        .addChoices(
          { name: '15 phút gần nhất', value: '15m' },
          { name: '1 giờ gần nhất', value: '1h' },
          { name: 'Trong hôm nay', value: 'today' },
          { name: 'Toàn bộ phiên chơi', value: 'all' },
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('log')
    .setDescription('Ghi nhận một lượt bắt vào thống kê phiên chơi trên Discord')
    .addStringOption((opt) =>
      opt
        .setName('source')
        .setDescription('Nguồn gặp Pokémon')
        .setRequired(true)
        .addChoices({ name: 'Wild (;p)', value: 'wild' }, { name: 'Fishing (;f)', value: 'fishing' }),
    )
    .addStringOption((opt) =>
      opt
        .setName('rarity')
        .setDescription('Độ hiếm')
        .setRequired(true)
        .addChoices(...ALL_RARITY_CHOICES),
    )
    .addStringOption((opt) =>
      opt
        .setName('ball')
        .setDescription('Loại bóng đã dùng')
        .setRequired(true)
        .addChoices(...BALL_CHOICES),
    )
    .addBooleanOption((opt) =>
      opt.setName('caught').setDescription('Đã bắt được hay trượt?').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('pokemon').setDescription('Tên Pokémon (tuỳ chọn)').setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Xem, dọn bản ghi lỗi cũ hoặc đặt lại thống kê phiên bắt Pokémon')
    .addSubcommand((sub) =>
      sub.setName('summary').setDescription('Xem tổng kết lượt bắt, tỉ lệ trúng, độ đen và lời/lỗ'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clean')
        .setDescription('Dọn sạch các bản ghi lỗi cũ (-100k MB / tên wild) nhưng giữ nguyên lượt bắt thật'),
    )
    .addSubcommand((sub) =>
      sub.setName('reset').setDescription('Xoá toàn bộ lịch sử phiên chơi của bạn trên Discord'),
    )
    .toJSON(),
];
