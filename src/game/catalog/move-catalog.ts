import type { CreatureSpecies } from '../types';

export type MoveCategory = 'physical' | 'special' | 'status';
export type MoveTier = 'starter' | 'tm' | 'tutor' | 'ultimate';
export type MoveSpecialEffect =
  | 'none'
  | 'heal_38'
  | 'buff_atk_spd'
  | 'buff_spatk_spdef'
  | 'drain_30'
  | 'priority';

export interface MoveSpec {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly category: MoveCategory;
  readonly power: number;
  readonly accuracy: number;
  readonly critRate: number;
  readonly cooldownTurns: number;
  readonly price: number;
  readonly tier: MoveTier;
  readonly specialEffect: MoveSpecialEffect;
  readonly description: string;
}

export interface SpeciesMovePool {
  readonly starterMoves: readonly [MoveSpec, MoveSpec];
  readonly shopMoves: readonly MoveSpec[];
}

function m(
  id: string,
  name: string,
  type: string,
  category: MoveCategory,
  power: number,
  accuracy: number,
  critRate: number,
  cooldownTurns: number,
  price: number,
  tier: MoveTier,
  specialEffect: MoveSpecialEffect,
  description: string,
): MoveSpec {
  return {
    id,
    name,
    type,
    category,
    power,
    accuracy,
    critRate,
    cooldownTurns,
    price,
    tier,
    specialEffect,
    description,
  };
}

export const MOVE_CATALOG: readonly MoveSpec[] = [
  // ================= STARTER MOVES (36 — 1 Physical + 1 Special / hệ, giá 0 PC) =================
  m('st_normal_p', 'Slash', 'Normal', 'physical', 66, 1.0, 0.14, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Normal · Tỉ lệ Chí Mạng 14%'),
  m('st_normal_s', 'Swift', 'Normal', 'special', 64, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Normal · Chính xác tuyệt đối'),
  m('st_fire_p', 'Flame Wheel', 'Fire', 'physical', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Fire · Có tỉ lệ gây Bỏng'),
  m('st_fire_s', 'Ember', 'Fire', 'special', 64, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Fire · Có tỉ lệ gây Bỏng'),
  m('st_water_p', 'Aqua Jet', 'Water', 'physical', 62, 1.0, 0.08, 0, 0, 'starter', 'priority', 'Chiêu khởi đầu hệ Water · Ưu tiên ra đòn nhanh'),
  m('st_water_s', 'Water Pulse', 'Water', 'special', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Water · Hồi nhẹ HP & giải Bỏng'),
  m('st_electric_p', 'Spark', 'Electric', 'physical', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Electric · Có tỉ lệ Tê Liệt'),
  m('st_electric_s', 'Shock Wave', 'Electric', 'special', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Electric · Có tỉ lệ Tê Liệt'),
  m('st_grass_p', 'Razor Leaf', 'Grass', 'physical', 65, 0.98, 0.14, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Grass · Hút 18% máu gây ra'),
  m('st_grass_s', 'Magical Leaf', 'Grass', 'special', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Grass · Hút 18% máu gây ra'),
  m('st_ice_p', 'Ice Shard', 'Ice', 'physical', 62, 1.0, 0.08, 0, 0, 'starter', 'priority', 'Chiêu khởi đầu hệ Ice · Ưu tiên & có tỉ lệ Đóng Băng'),
  m('st_ice_s', 'Icy Wind', 'Ice', 'special', 64, 0.98, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Ice · Có tỉ lệ Đóng Băng'),
  m('st_fighting_p', 'Karate Chop', 'Fighting', 'physical', 66, 1.0, 0.12, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Fighting · Xuyên 15% Giáp'),
  m('st_fighting_s', 'Vacuum Wave', 'Fighting', 'special', 62, 1.0, 0.08, 0, 0, 'starter', 'priority', 'Chiêu khởi đầu hệ Fighting · Ưu tiên & xuyên Giáp'),
  m('st_poison_p', 'Poison Fang', 'Poison', 'physical', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Poison · Có tỉ lệ Trúng Độc'),
  m('st_poison_s', 'Acid Spray', 'Poison', 'special', 64, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Poison · Có tỉ lệ Trúng Độc'),
  m('st_ground_p', 'Bulldoze', 'Ground', 'physical', 66, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Ground · Phá Giáp Thép'),
  m('st_ground_s', 'Mud Shot', 'Ground', 'special', 64, 0.98, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Ground · Phá Giáp Thép'),
  m('st_flying_p', 'Wing Attack', 'Flying', 'physical', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Flying · Tăng +15% Tốc độ ra chiêu'),
  m('st_flying_s', 'Air Cutter', 'Flying', 'special', 64, 0.98, 0.14, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Flying · Tăng +15% Tốc độ ra chiêu'),
  m('st_psychic_p', 'Psycho Cut', 'Psychic', 'physical', 68, 1.0, 0.14, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Psychic · Giảm Công đối thủ'),
  m('st_psychic_s', 'Psybeam', 'Psychic', 'special', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Psychic · Giảm Công đối thủ'),
  m('st_bug_p', 'Bug Bite', 'Bug', 'physical', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Bug · Làm chậm đối thủ'),
  m('st_bug_s', 'Struggle Bug', 'Bug', 'special', 64, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Bug · Làm chậm đối thủ'),
  m('st_rock_p', 'Rock Tomb', 'Rock', 'physical', 66, 0.96, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Rock · Xuyên 15% Giáp'),
  m('st_rock_s', 'Ancient Power', 'Rock', 'special', 65, 1.0, 0.10, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Rock · Xuyên 15% Giáp'),
  m('st_ghost_p', 'Shadow Sneak', 'Ghost', 'physical', 62, 1.0, 0.08, 0, 0, 'starter', 'priority', 'Chiêu khởi đầu hệ Ghost · Ưu tiên & gây Choáng'),
  m('st_ghost_s', 'Hex', 'Ghost', 'special', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Ghost · Gây Choáng khi đi trước'),
  m('st_dragon_p', 'Dual Chop', 'Dragon', 'physical', 68, 0.96, 0.10, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Dragon · Uy lực Rồng (+10%), có rủi ro loạn đả'),
  m('st_dragon_s', 'Dragon Breath', 'Dragon', 'special', 66, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Dragon · Uy lực Rồng (+10%), có rủi ro loạn đả'),
  m('st_dark_p', 'Bite', 'Dark', 'physical', 65, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Dark · Gây Choáng khi đi trước'),
  m('st_dark_s', 'Snarl', 'Dark', 'special', 64, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Dark · Gây Choáng khi đi trước'),
  m('st_steel_p', 'Metal Claw', 'Steel', 'physical', 65, 0.98, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Steel · Tạo Giáp Thép 1 lượt'),
  m('st_steel_s', 'Mirror Shot', 'Steel', 'special', 65, 0.98, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Steel · Tạo Giáp Thép 1 lượt'),
  m('st_fairy_p', 'Spirit Break', 'Fairy', 'physical', 66, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Fairy · Áp chế khắc hệ Rồng'),
  m('st_fairy_s', 'Disarming Voice', 'Fairy', 'special', 64, 1.0, 0.08, 0, 0, 'starter', 'none', 'Chiêu khởi đầu hệ Fairy · Chính xác cao & giảm Công'),

  // ================= TM MOVES (36 — Chuyên sâu mua trong Shop Skill) =================
  m('tm_normal_p', 'Body Slam', 'Normal', 'physical', 88, 1.0, 0.12, 0, 4200, 'tm', 'none', 'Đòn húc nặng · Chính xác 100% · Tỉ lệ Chí Mạng cao'),
  m('tm_normal_s', 'Hyper Voice', 'Normal', 'special', 90, 1.0, 0.10, 0, 4400, 'tm', 'none', 'Sóng âm cực mạnh vang dội chiến trường'),
  m('tm_fire_p', 'Fire Punch', 'Fire', 'physical', 86, 1.0, 0.10, 0, 4600, 'tm', 'none', 'Cú đấm rực lửa · 20% gây Bỏng đối thủ'),
  m('tm_fire_s', 'Flamethrower', 'Fire', 'special', 90, 1.0, 0.10, 0, 5000, 'tm', 'none', 'Phun lửa chuẩn xác · 20% gây Bỏng đối thủ'),
  m('tm_water_p', 'Waterfall', 'Water', 'physical', 86, 1.0, 0.10, 0, 4600, 'tm', 'none', 'Lao thác nước · Hồi 5% HP & giải Bỏng'),
  m('tm_water_s', 'Surf', 'Water', 'special', 90, 1.0, 0.10, 0, 5000, 'tm', 'none', 'Sóng thần càn quét · Hồi 5% HP & giải Bỏng'),
  m('tm_electric_p', 'Wild Charge', 'Electric', 'physical', 88, 0.98, 0.10, 0, 4800, 'tm', 'none', 'Xung điện cao thế · 22% Tê Liệt đối thủ'),
  m('tm_electric_s', 'Thunderbolt', 'Electric', 'special', 90, 1.0, 0.10, 0, 5200, 'tm', 'none', 'Sét đánh 10 vạn vôn · 22% Tê Liệt đối thủ'),
  m('tm_grass_p', 'Leaf Blade', 'Grass', 'physical', 88, 1.0, 0.18, 0, 4800, 'tm', 'none', 'Lá kiếm sắc bén · Chí Mạng 18% & Hút máu'),
  m('tm_grass_s', 'Energy Ball', 'Grass', 'special', 90, 1.0, 0.10, 0, 5000, 'tm', 'none', 'Quả cầu tự nhiên · Hút 18% sát thương thành HP'),
  m('tm_ice_p', 'Icicle Crash', 'Ice', 'physical', 88, 0.95, 0.10, 0, 5000, 'tm', 'none', 'Băng trụ giáng xuống · 15% Đóng Băng mục tiêu'),
  m('tm_ice_s', 'Ice Beam', 'Ice', 'special', 90, 1.0, 0.10, 0, 5400, 'tm', 'none', 'Tia băng đóng cứng · 15% Đóng Băng & khắc Rồng'),
  m('tm_fighting_p', 'Brick Break', 'Fighting', 'physical', 86, 1.0, 0.12, 0, 4800, 'tm', 'none', 'Chưởng phá giáp · Xuyên 15% phòng thủ'),
  m('tm_fighting_s', 'Aura Sphere', 'Fighting', 'special', 88, 1.0, 0.10, 0, 5200, 'tm', 'none', 'Khí công bất khả trượt · Xuyên 15% Giáp'),
  m('tm_poison_p', 'Poison Jab', 'Poison', 'physical', 86, 1.0, 0.10, 0, 4500, 'tm', 'none', 'Đâm độc chính xác · 25% Trúng Độc'),
  m('tm_poison_s', 'Sludge Bomb', 'Poison', 'special', 90, 1.0, 0.10, 0, 4800, 'tm', 'none', 'Bom bùn độc · 25% Trúng Độc kéo máu'),
  m('tm_ground_p', 'Earthquake', 'Ground', 'physical', 95, 1.0, 0.10, 0, 6200, 'tm', 'none', 'Động đất rung chuyển · Phá Giáp Thép'),
  m('tm_ground_s', 'Earth Power', 'Ground', 'special', 90, 1.0, 0.10, 0, 5600, 'tm', 'none', 'Địa chấn nội lực · Phá Giáp Thép'),
  m('tm_flying_p', 'Drill Peck', 'Flying', 'physical', 86, 1.0, 0.12, 0, 4500, 'tm', 'none', 'Mỏ khoan tốc độ cao · +15% Tốc độ ra đòn'),
  m('tm_flying_s', 'Air Slash', 'Flying', 'special', 86, 0.98, 0.12, 0, 4800, 'tm', 'none', 'Trảm phong sắc lẹm · +15% Tốc độ ra đòn'),
  m('tm_psychic_p', 'Zen Headbutt', 'Psychic', 'physical', 86, 0.96, 0.10, 0, 4800, 'tm', 'none', 'Thiết đầu công tâm linh · Giảm Công địch'),
  m('tm_psychic_s', 'Psychic', 'Psychic', 'special', 90, 1.0, 0.10, 0, 5500, 'tm', 'none', 'Sức mạnh tâm linh áp đảo · Giảm Công địch'),
  m('tm_bug_p', 'X-Scissor', 'Bug', 'physical', 86, 1.0, 0.12, 0, 4400, 'tm', 'none', 'Chém chéo tốc độ · Làm chậm đối thủ'),
  m('tm_bug_s', 'Bug Buzz', 'Bug', 'special', 90, 1.0, 0.10, 0, 4600, 'tm', 'none', 'Sóng rung tần số cao · Làm chậm đối thủ'),
  m('tm_rock_p', 'Rock Slide', 'Rock', 'physical', 86, 0.95, 0.10, 0, 4800, 'tm', 'none', 'Đá lở dữ dội · Xuyên 15% phòng thủ'),
  m('tm_rock_s', 'Power Gem', 'Rock', 'special', 86, 1.0, 0.10, 0, 4800, 'tm', 'none', 'Tia đá quý rực sáng · Xuyên 15% Giáp'),
  m('tm_ghost_p', 'Shadow Claw', 'Ghost', 'physical', 85, 1.0, 0.18, 0, 5200, 'tm', 'none', 'Móng vuốt bóng tối · Chí Mạng 18% & Choáng'),
  m('tm_ghost_s', 'Shadow Ball', 'Ghost', 'special', 88, 1.0, 0.10, 0, 5400, 'tm', 'none', 'Quả cầu hắc ảnh · Có tỉ lệ gây Choáng'),
  m('tm_dragon_p', 'Dragon Claw', 'Dragon', 'physical', 88, 1.0, 0.12, 0, 6400, 'tm', 'none', 'Trảo Rồng uy lực +10% · Có tỉ lệ tự loạn đả'),
  m('tm_dragon_s', 'Dragon Pulse', 'Dragon', 'special', 90, 1.0, 0.10, 0, 6400, 'tm', 'none', 'Sóng Rồng cổ đại +10% · Có tỉ lệ tự loạn đả'),
  m('tm_dark_p', 'Crunch', 'Dark', 'physical', 86, 1.0, 0.10, 0, 4800, 'tm', 'none', 'Ngoạm xé bóng tối · Gây Choáng nếu nhanh hơn'),
  m('tm_dark_s', 'Dark Pulse', 'Dark', 'special', 88, 1.0, 0.10, 0, 5000, 'tm', 'none', 'Hắc xung áp chế · Gây Choáng nếu nhanh hơn'),
  m('tm_steel_p', 'Iron Head', 'Steel', 'physical', 86, 1.0, 0.10, 0, 5000, 'tm', 'none', 'Thiết đầu cứng cáp · Dựng Giáp Thép giảm sát thương'),
  m('tm_steel_s', 'Flash Cannon', 'Steel', 'special', 88, 1.0, 0.10, 0, 5200, 'tm', 'none', 'Pháo ánh kim · Dựng Giáp Thép bảo vệ 1 lượt'),
  m('tm_fairy_p', 'Play Rough', 'Fairy', 'physical', 90, 0.96, 0.10, 0, 5400, 'tm', 'none', 'Đùa bạo lực · Khắc Rồng & giảm Công địch'),
  m('tm_fairy_s', 'Moonblast', 'Fairy', 'special', 94, 1.0, 0.10, 0, 6000, 'tm', 'none', 'Ánh trăng giáng xuống · Chuẩn xác & khắc Rồng'),

  // ================= TUTOR / TACTICAL / SUSTAIN / SETUP MOVES =================
  m('tut_recover', 'Recover', 'Normal', 'status', 0, 1.0, 0, 1, 8000, 'tutor', 'heal_38', 'Hồi 38% HP tối đa & giải trạng thái bất lợi (tối đa 2 lần/trận)'),
  m('tut_roost', 'Roost', 'Flying', 'status', 0, 1.0, 0, 1, 8000, 'tutor', 'heal_38', 'Đậu nghỉ hồi 38% HP tối đa & giải trạng thái bất lợi (2 lần/trận)'),
  m('tut_synthesis', 'Synthesis', 'Grass', 'status', 0, 1.0, 0, 1, 8000, 'tutor', 'heal_38', 'Quang hợp hồi 38% HP tối đa & giải trạng thái bất lợi (2 lần/trận)'),
  m('tut_aqua_ring', 'Aqua Ring', 'Water', 'status', 0, 1.0, 0, 1, 8000, 'tutor', 'heal_38', 'Vòng nước hồi 38% HP tối đa & giải trạng thái bất lợi (2 lần/trận)'),
  m('tut_swords_dance', 'Swords Dance', 'Normal', 'status', 0, 1.0, 0, 1, 8800, 'tutor', 'buff_atk_spd', 'Múa Kiếm: Tăng mạnh +28% Công kích & +12% Tốc độ'),
  m('tut_dragon_dance', 'Dragon Dance', 'Dragon', 'status', 0, 1.0, 0, 1, 9800, 'tutor', 'buff_atk_spd', 'Vũ Điệu Rồng: Tăng +28% Công kích & +12% Tốc độ'),
  m('tut_calm_mind', 'Calm Mind', 'Psychic', 'status', 0, 1.0, 0, 1, 8800, 'tutor', 'buff_spatk_spdef', 'Tĩnh Tâm: Tăng +25% Công kích & +15% Phòng thủ'),
  m('tut_giga_drain', 'Giga Drain', 'Grass', 'special', 80, 1.0, 0.10, 0, 7500, 'tutor', 'drain_30', 'Hút sinh lực mạnh mẽ · Hồi lại 30% sát thương gây ra'),
  m('tut_drain_punch', 'Drain Punch', 'Fighting', 'physical', 80, 1.0, 0.10, 0, 7500, 'tutor', 'drain_30', 'Cú đấm hút máu · Xuyên 15% Giáp & hồi 30% sát thương'),

  // ================= ULTIMATE & SIGNATURE MOVES =================
  m('ult_normal_p', 'Giga Impact', 'Normal', 'physical', 128, 0.88, 0.12, 1, 15000, 'ultimate', 'none', 'Tuyệt kỹ tối thượng hệ Normal (hồi 1 lượt sau khi tung)'),
  m('ult_normal_s', 'Hyper Beam', 'Normal', 'special', 128, 0.88, 0.12, 1, 15000, 'ultimate', 'none', 'Tia hủy diệt tối thượng hệ Normal (hồi 1 lượt)'),
  m('ult_fire_p', 'Flare Blitz', 'Fire', 'physical', 122, 0.92, 0.12, 1, 16500, 'ultimate', 'none', 'Lao mình hóa hỏa cầu · Bỏng 20% (hồi 1 lượt)'),
  m('ult_fire_s', 'Fire Blast', 'Fire', 'special', 122, 0.88, 0.12, 1, 16500, 'ultimate', 'none', 'Đại tự hỏa bùng nổ · Bỏng 20% (hồi 1 lượt)'),
  m('ult_water_p', 'Wave Crash', 'Water', 'physical', 122, 0.92, 0.12, 1, 16500, 'ultimate', 'none', 'Sóng vỗ cực đại + Hồi 5% HP (hồi 1 lượt)'),
  m('ult_water_s', 'Hydro Pump', 'Water', 'special', 122, 0.88, 0.12, 1, 16500, 'ultimate', 'none', 'Đại bác thủy lực + Hồi 5% HP (hồi 1 lượt)'),
  m('ult_electric_p', 'Volt Tackle', 'Electric', 'physical', 124, 0.90, 0.12, 1, 16500, 'ultimate', 'none', 'Xung kích lôi điện · Tê Liệt 22% (hồi 1 lượt)'),
  m('ult_electric_s', 'Thunder', 'Electric', 'special', 124, 0.86, 0.12, 1, 16500, 'ultimate', 'none', 'Thiên lôi giáng thế · Tê Liệt 22% (hồi 1 lượt)'),
  m('ult_grass_p', 'Wood Hammer', 'Grass', 'physical', 122, 0.92, 0.12, 1, 15500, 'ultimate', 'none', 'Búa cổ thụ nghiền nát + Hút máu (hồi 1 lượt)'),
  m('ult_grass_s', 'Solar Beam', 'Grass', 'special', 124, 0.90, 0.12, 1, 15500, 'ultimate', 'none', 'Tia mặt trời + Hút 18% sát thương (hồi 1 lượt)'),
  m('ult_ice_p', 'Mountain Gale', 'Ice', 'physical', 120, 0.90, 0.12, 1, 16000, 'ultimate', 'none', 'Bão tuyết sơn cước · Đóng Băng 15% (hồi 1 lượt)'),
  m('ult_ice_s', 'Blizzard', 'Ice', 'special', 122, 0.86, 0.12, 1, 16000, 'ultimate', 'none', 'Bão băng toàn diện · Đóng Băng 15% (hồi 1 lượt)'),
  m('ult_fighting_p', 'Close Combat', 'Fighting', 'physical', 122, 0.95, 0.12, 1, 16500, 'ultimate', 'none', 'Cận chiến hủy diệt · Xuyên 15% Giáp (hồi 1 lượt)'),
  m('ult_fighting_s', 'Focus Blast', 'Fighting', 'special', 124, 0.85, 0.12, 1, 16500, 'ultimate', 'none', 'Khí công cực hạn · Xuyên 15% Giáp (hồi 1 lượt)'),
  m('ult_poison_p', 'Gunk Shot', 'Poison', 'physical', 122, 0.88, 0.12, 1, 15000, 'ultimate', 'none', 'Bắn độc cực mạnh · Trúng Độc 25% (hồi 1 lượt)'),
  m('ult_poison_s', 'Sludge Wave', 'Poison', 'special', 118, 0.92, 0.12, 1, 15000, 'ultimate', 'none', 'Sóng độc lan tỏa · Trúng Độc 25% (hồi 1 lượt)'),
  m('ult_ground_p', 'Headlong Rush', 'Ground', 'physical', 124, 0.92, 0.12, 1, 17500, 'ultimate', 'none', 'Húc địa chấn · Phá Giáp Thép (hồi 1 lượt)'),
  m('ult_ground_s', 'Scorching Sands', 'Ground', 'special', 118, 0.94, 0.12, 1, 16500, 'ultimate', 'none', 'Cát nóng đốt cháy · Phá Giáp Thép (hồi 1 lượt)'),
  m('ult_flying_p', 'Brave Bird', 'Flying', 'physical', 122, 0.92, 0.12, 1, 16000, 'ultimate', 'none', 'Chim ưng cảm tử · +15% Tốc độ (hồi 1 lượt)'),
  m('ult_flying_s', 'Hurricane', 'Flying', 'special', 122, 0.86, 0.12, 1, 16000, 'ultimate', 'none', 'Cuồng phong bão tố · +15% Tốc độ (hồi 1 lượt)'),
  m('ult_psychic_p', 'Psychic Fangs', 'Psychic', 'physical', 118, 0.94, 0.12, 1, 16500, 'ultimate', 'none', 'Nanh tâm linh xuyên phá (hồi 1 lượt)'),
  m('ult_psychic_s', 'Psystrike', 'Psychic', 'special', 124, 0.92, 0.14, 1, 19500, 'ultimate', 'none', 'Tâm linh bùng nổ tối thượng (hồi 1 lượt)'),
  m('ult_bug_p', 'Megahorn', 'Bug', 'physical', 122, 0.88, 0.12, 1, 15000, 'ultimate', 'none', 'Sừng khổng lồ húc tung (hồi 1 lượt)'),
  m('ult_bug_s', 'Pollen Storm', 'Bug', 'special', 118, 0.92, 0.12, 1, 15000, 'ultimate', 'none', 'Bão phấn côn trùng (hồi 1 lượt)'),
  m('ult_rock_p', 'Stone Edge', 'Rock', 'physical', 118, 0.88, 0.24, 1, 16000, 'ultimate', 'none', 'Nham thạch sắc nhọn · Chí Mạng 24% & Xuyên Giáp'),
  m('ult_rock_s', 'Meteor Beam', 'Rock', 'special', 124, 0.88, 0.12, 1, 16500, 'ultimate', 'none', 'Tia thiên thạch xuyên Giáp (hồi 1 lượt)'),
  m('ult_ghost_p', 'Phantom Force', 'Ghost', 'physical', 120, 0.94, 0.12, 1, 17500, 'ultimate', 'none', 'Ma lực ám sát · Gây Choáng (hồi 1 lượt)'),
  m('ult_ghost_s', 'Shadow Force', 'Ghost', 'special', 124, 0.92, 0.12, 1, 18500, 'ultimate', 'none', 'Bóng ma hư không · Gây Choáng (hồi 1 lượt)'),
  m('ult_dragon_p', 'Outrage', 'Dragon', 'physical', 128, 0.92, 0.14, 1, 20000, 'ultimate', 'none', 'Long Nộ Cuồng Bạo +10% · Rủi ro tự loạn đả cao (28%)'),
  m('ult_dragon_s', 'Draco Meteor', 'Dragon', 'special', 130, 0.88, 0.14, 1, 20000, 'ultimate', 'none', 'Long Tinh Giáng Thế +10% · Rủi ro tự loạn đả cao (28%)'),
  m('ult_dark_p', 'Foul Play', 'Dark', 'physical', 118, 0.94, 0.14, 1, 16000, 'ultimate', 'none', 'Đòn hiểm hắc ám · Gây Choáng (hồi 1 lượt)'),
  m('ult_dark_s', 'Night Daze', 'Dark', 'special', 120, 0.92, 0.12, 1, 16000, 'ultimate', 'none', 'Bão đêm mù mịt · Gây Choáng (hồi 1 lượt)'),
  m('ult_steel_p', 'Meteor Mash', 'Steel', 'physical', 120, 0.92, 0.14, 1, 17000, 'ultimate', 'none', 'Cú đấm thiên thạch + Giáp Thép (hồi 1 lượt)'),
  m('ult_steel_s', 'Steel Beam', 'Steel', 'special', 126, 0.90, 0.12, 1, 17000, 'ultimate', 'none', 'Pháo thép tối thượng + Giáp Thép (hồi 1 lượt)'),
  m('ult_fairy_p', 'Enchanted Impact', 'Fairy', 'physical', 118, 0.94, 0.12, 1, 17000, 'ultimate', 'none', 'Va chạm tinh linh · Khắc Rồng (hồi 1 lượt)'),
  m('ult_fairy_s', 'Fleur Cannon', 'Fairy', 'special', 126, 0.90, 0.12, 1, 18500, 'ultimate', 'none', 'Pháo hoa tiên tối thượng · Khắc Rồng (hồi 1 lượt)'),

  // ================= LEGENDARY / ICONIC SIGNATURES =================
  m('sig_aeroblast', 'Aeroblast', 'Flying', 'special', 126, 0.94, 0.22, 1, 24000, 'ultimate', 'none', 'Tuyệt kỹ độc quyền Lugia · Chí Mạng 22%'),
  m('sig_sacred_fire', 'Sacred Fire', 'Fire', 'physical', 126, 0.95, 0.14, 1, 24000, 'ultimate', 'none', 'Thánh Hỏa độc quyền Ho-Oh · Bỏng cực cao'),
  m('sig_origin_pulse', 'Origin Pulse', 'Water', 'special', 130, 0.92, 0.14, 1, 26000, 'ultimate', 'none', 'Sóng Khởi Nguyên độc quyền Kyogre'),
  m('sig_precipice_blades', 'Precipice Blades', 'Ground', 'physical', 132, 0.90, 0.14, 1, 26000, 'ultimate', 'none', 'Địa Đao Vực Thẳm độc quyền Groudon'),
  m('sig_dragon_ascent', 'Dragon Ascent', 'Flying', 'physical', 134, 0.94, 0.14, 1, 28000, 'ultimate', 'none', 'Thiên Long Thăng Thiên độc quyền Rayquaza'),
  m('sig_roar_of_time', 'Roar of Time', 'Dragon', 'special', 136, 0.90, 0.14, 1, 28000, 'ultimate', 'none', 'Tiếng Gầm Thời Gian · Dialga (cẩn thận loạn đả Rồng)'),
  m('sig_spacial_rend', 'Spacial Rend', 'Dragon', 'special', 128, 0.94, 0.22, 1, 26000, 'ultimate', 'none', 'Xé Rách Không Gian · Palkia · Chí Mạng 22%'),
  m('sig_astral_barrage', 'Astral Barrage', 'Ghost', 'special', 130, 0.94, 0.14, 1, 27000, 'ultimate', 'none', 'Mưa Tinh Tú Ma Quái · Calyrex / Spectral'),
  m('sig_volt_tackle_pika', 'Catastropika', 'Electric', 'physical', 130, 0.94, 0.16, 1, 22000, 'ultimate', 'none', 'Tuyệt kỹ tối thượng dòng Pikachu & Raichu'),
  m('sig_blast_burn', 'Blast Burn', 'Fire', 'special', 132, 0.90, 0.14, 1, 22000, 'ultimate', 'none', 'Bùng Nổ Hủy Diệt dòng Khởi Đầu Lửa'),
  m('sig_hydro_cannon', 'Hydro Cannon', 'Water', 'special', 132, 0.90, 0.14, 1, 22000, 'ultimate', 'none', 'Đại Pháo Thủy Lực dòng Khởi Đầu Nước'),
  m('sig_frenzy_plant', 'Frenzy Plant', 'Grass', 'special', 132, 0.90, 0.14, 1, 22000, 'ultimate', 'none', 'Thảm Thực Vật Điên Cuồng dòng Khởi Đầu Thảo'),
];

const MOVE_BY_ID = new Map<string, MoveSpec>(MOVE_CATALOG.map((item) => [item.id, item]));

const SAFE_COVERAGE_TYPES: Readonly<Record<string, readonly [string, string, string]>> = {
  Normal: ['Dark', 'Rock', 'Fire'],
  Fire: ['Ground', 'Grass', 'Rock'],
  Water: ['Ice', 'Ground', 'Dark'],
  Electric: ['Ice', 'Steel', 'Dark'],
  Grass: ['Poison', 'Ground', 'Fairy'],
  Ice: ['Water', 'Ground', 'Rock'],
  Fighting: ['Rock', 'Dark', 'Steel'],
  Poison: ['Ground', 'Dark', 'Fire'],
  Ground: ['Rock', 'Ice', 'Fire'],
  Flying: ['Fighting', 'Steel', 'Normal'],
  Psychic: ['Fairy', 'Fighting', 'Bug'],
  Bug: ['Grass', 'Dark', 'Rock'],
  Rock: ['Ground', 'Fire', 'Steel'],
  Ghost: ['Dark', 'Fighting', 'Fairy'],
  Dragon: ['Fire', 'Steel', 'Water'],
  Dark: ['Fighting', 'Poison', 'Rock'],
  Steel: ['Rock', 'Ground', 'Electric'],
  Fairy: ['Psychic', 'Fire', 'Water'],
};

const ANTI_WEAKNESS_COVERAGE: Readonly<Record<string, readonly [string, string]>> = {
  Normal: ['Fighting', 'Dark'],
  Fire: ['Grass', 'Ground'],
  Water: ['Ice', 'Electric'],
  Electric: ['Ice', 'Ground'],
  Grass: ['Fire', 'Rock'],
  Ice: ['Ground', 'Fighting'],
  Fighting: ['Flying', 'Fairy'],
  Poison: ['Water', 'Ground'],
  Ground: ['Ice', 'Rock'],
  Flying: ['Ground', 'Fighting'],
  Psychic: ['Bug', 'Fighting'],
  Bug: ['Rock', 'Ground'],
  Rock: ['Grass', 'Electric'],
  Ghost: ['Dark', 'Fighting'],
  Dragon: ['Steel', 'Fire'],
  Dark: ['Fairy', 'Poison'],
  Steel: ['Water', 'Ground'],
  Fairy: ['Fire', 'Ground'],
};

const SIGNATURE_BY_DEX: Readonly<Record<number, string>> = {
  3: 'sig_frenzy_plant',
  6: 'sig_blast_burn',
  9: 'sig_hydro_cannon',
  25: 'sig_volt_tackle_pika',
  26: 'sig_volt_tackle_pika',
  249: 'sig_aeroblast',
  250: 'sig_sacred_fire',
  382: 'sig_origin_pulse',
  383: 'sig_precipice_blades',
  384: 'sig_dragon_ascent',
  483: 'sig_roar_of_time',
  484: 'sig_spacial_rend',
  898: 'sig_astral_barrage',
};

const DRAGON_DANCER_DEX = new Set<number>([6, 130, 142, 248, 373, 384, 445, 612, 706]);

function findTierMove(
  tier: 'starter' | 'tm' | 'ultimate',
  type: string,
  preferPhysical: boolean,
): MoveSpec {
  const key = type.toLowerCase();
  const suffix = preferPhysical ? 'p' : 's';
  const prefix = tier === 'starter' ? 'st' : tier === 'tm' ? 'tm' : 'ult';
  return (
    MOVE_BY_ID.get(`${prefix}_${key}_${suffix}`) ??
    MOVE_BY_ID.get(`${prefix}_normal_${suffix}`) ??
    MOVE_CATALOG[0]!
  );
}

export function getMoveById(id: string): MoveSpec | undefined {
  return MOVE_BY_ID.get(id);
}

export function getSpeciesMovePool(species: CreatureSpecies): SpeciesMovePool {
  const preferPhysical = species.baseStats.atk >= species.baseStats.spAtk;
  const primaryType = species.types[0] ?? 'Normal';
  const rawSecondary = species.types[1];

  // Đảm bảo 2 skill mặc định KHÔNG BAO GIỜ cùng bị 1 hệ miễn nhiễm (Normal+Fighting đều 0x trước Ghost)
  const sharesGhostImmunity =
    (primaryType === 'Normal' && rawSecondary === 'Fighting') ||
    (primaryType === 'Fighting' && rawSecondary === 'Normal');

  const fallbackCovList = SAFE_COVERAGE_TYPES[primaryType] ?? ['Dark', 'Rock', 'Fire'];
  const covType1 = fallbackCovList[species.dexNumber % fallbackCovList.length]!;
  const secondaryStarterType = sharesGhostImmunity
    ? 'Dark'
    : (rawSecondary ?? covType1);

  const starter1 = findTierMove('starter', primaryType, preferPhysical);
  let starter2 = findTierMove('starter', secondaryStarterType, preferPhysical);
  if (starter2.id === starter1.id) {
    starter2 = findTierMove('starter', covType1, preferPhysical);
  }

  const starterIds = new Set<string>([starter1.id, starter2.id]);
  const shopMoves: MoveSpec[] = [];
  const pushUniqueShop = (spec: MoveSpec | undefined): void => {
    if (!spec || starterIds.has(spec.id) || shopMoves.some((x) => x.id === spec.id)) {
      return;
    }
    shopMoves.push(spec);
  };

  // 1) TM hệ chính
  pushUniqueShop(findTierMove('tm', primaryType, preferPhysical));

  // 2) TM hệ phụ hoặc TM cùng hệ đối ứng Physical/Special
  if (rawSecondary) {
    pushUniqueShop(findTierMove('tm', rawSecondary, preferPhysical));
  } else {
    pushUniqueShop(findTierMove('tm', primaryType, !preferPhysical));
  }

  // 3) TM phủ hệ theo loài (deterministic theo dexNumber)
  const covType2 = fallbackCovList[(species.dexNumber + 1) % fallbackCovList.length]!;
  pushUniqueShop(findTierMove('tm', covType1, preferPhysical));
  pushUniqueShop(findTierMove('tm', covType2, preferPhysical));

  // 4) TM khắc điểm yếu của chính hệ Pokémon đó
  const antiWeakPair = ANTI_WEAKNESS_COVERAGE[primaryType] ?? ['Rock', 'Dark'];
  const antiWeakType = antiWeakPair[species.dexNumber % antiWeakPair.length]!;
  pushUniqueShop(findTierMove('tm', antiWeakType, preferPhysical));

  // 5) Tutor hồi phục / hút máu đặc trưng theo hệ
  if (species.types.includes('Flying') || species.types.includes('Dragon')) {
    pushUniqueShop(MOVE_BY_ID.get('tut_roost'));
  } else if (species.types.includes('Grass')) {
    pushUniqueShop(MOVE_BY_ID.get('tut_giga_drain'));
    pushUniqueShop(MOVE_BY_ID.get('tut_synthesis'));
  } else if (species.types.includes('Water') || species.types.includes('Ice')) {
    pushUniqueShop(MOVE_BY_ID.get('tut_aqua_ring'));
  } else if (species.types.includes('Fighting') || species.types.includes('Dark')) {
    pushUniqueShop(MOVE_BY_ID.get('tut_drain_punch'));
  } else {
    pushUniqueShop(MOVE_BY_ID.get('tut_recover'));
  }

  // 6) Tutor Setup (Dragon Dance / Swords Dance / Calm Mind)
  if (species.types.includes('Dragon') || DRAGON_DANCER_DEX.has(species.dexNumber)) {
    pushUniqueShop(MOVE_BY_ID.get('tut_dragon_dance'));
  } else if (preferPhysical) {
    pushUniqueShop(MOVE_BY_ID.get('tut_swords_dance'));
  } else {
    pushUniqueShop(MOVE_BY_ID.get('tut_calm_mind'));
  }

  // 7) Tuyệt kỹ Ultimate hệ chính
  pushUniqueShop(findTierMove('ultimate', primaryType, preferPhysical));

  // 8) Signature theo loài hoặc Ultimate hệ phụ / phủ hệ
  const sigId = SIGNATURE_BY_DEX[species.dexNumber];
  if (sigId) {
    pushUniqueShop(MOVE_BY_ID.get(sigId));
  } else {
    pushUniqueShop(findTierMove('ultimate', rawSecondary ?? antiWeakType, preferPhysical));
  }

  return {
    starterMoves: [starter1, starter2],
    shopMoves,
  };
}

export function resolveEquippedMoves(
  species: CreatureSpecies,
  equippedIds: readonly string[] = [],
  unlockedIds: readonly string[] = [],
): readonly MoveSpec[] {
  const pool = getSpeciesMovePool(species);
  const validIds = new Set<string>([
    pool.starterMoves[0].id,
    pool.starterMoves[1].id,
    ...unlockedIds.filter((id) => pool.shopMoves.some((m) => m.id === id)),
  ]);

  const result: MoveSpec[] = [];
  for (const id of equippedIds) {
    if (!validIds.has(id) || result.some((m) => m.id === id)) {
      continue;
    }
    const spec = MOVE_BY_ID.get(id);
    if (spec) {
      result.push(spec);
    }
    if (result.length >= 4) {
      break;
    }
  }

  // Mặc định mọi Pokémon bắt đầu với đúng 2 chiêu khởi đầu
  for (const starter of pool.starterMoves) {
    if (result.length >= 2) {
      break;
    }
    if (!result.some((m) => m.id === starter.id)) {
      result.push(starter);
    }
  }

  return result;
}

export function resolveAiMoves(
  species: CreatureSpecies,
  moveCount: 2 | 3 | 4,
): readonly MoveSpec[] {
  const pool = getSpeciesMovePool(species);
  const moves: MoveSpec[] = [pool.starterMoves[0], pool.starterMoves[1]];
  if (moveCount >= 3 && pool.shopMoves[0]) {
    moves[0] = pool.shopMoves[0];
    const third = pool.shopMoves.find((s) => s.tier === 'tm' && s.id !== moves[0]!.id);
    if (third) {
      moves.push(third);
    }
  }
  if (moveCount >= 4) {
    const ult = pool.shopMoves.find((s) => s.tier === 'ultimate');
    if (ult && !moves.some((m) => m.id === ult.id)) {
      moves.push(ult);
    }
    const sustain = pool.shopMoves.find((s) => s.tier === 'tutor');
    if (moves.length < 4 && sustain && !moves.some((m) => m.id === sustain.id)) {
      moves.push(sustain);
    }
  }
  return moves.slice(0, 4);
}
