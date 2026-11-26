import type { BallId, BallSpec } from '../types';

export const BALL_CATALOG: readonly BallSpec[] = [
  {
    id: 'pokeball',
    shopIndex: 1,
    category: 'standard',
    name: 'Poké Ball',
    shortCode: 'pb',
    aliases: ['1', 'pb', 'poke', 'pokeball', 'pokéball'],
    price: 200,
    multiplier: 1.0,
    emoji: '●',
    iconUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/poke-ball.png',
    description: 'Bóng tiêu chuẩn dùng để bắt Pokémon phổ thông và hoàn thiện Pokédex.',
  },
  {
    id: 'greatball',
    shopIndex: 2,
    category: 'standard',
    name: 'Great Ball',
    shortCode: 'gb',
    aliases: ['2', 'gb', 'great', 'greatball'],
    price: 500,
    multiplier: 1.5,
    emoji: '●',
    iconUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/great-ball.png',
    description: 'Hiệu suất bắt 1.5x, tối ưu cho các loài Uncommon và Rare.',
  },
  {
    id: 'ultraball',
    shopIndex: 3,
    category: 'standard',
    name: 'Ultra Ball',
    shortCode: 'ub',
    aliases: ['3', 'ub', 'ultra', 'ultraball'],
    price: 1500,
    multiplier: 2.2,
    emoji: '●',
    iconUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/ultra-ball.png',
    description: 'Hiệu suất cao 2.2x dành cho các loài Rare và Super Rare.',
  },
  {
    id: 'premierball',
    shopIndex: 4,
    category: 'special',
    name: 'Premier Ball',
    shortCode: 'prb',
    aliases: ['4', 'prb', 'premier', 'premierball'],
    price: 5000,
    multiplier: 3.0,
    emoji: '●',
    iconUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/premier-ball.png',
    description: 'Bóng cao cấp (3.0x + thưởng +15% với Shiny, Super Rare & Legendary).',
  },
  {
    id: 'masterball',
    shopIndex: 5,
    category: 'special',
    name: 'Master Ball',
    shortCode: 'mb',
    aliases: ['5', 'mb', 'master', 'masterball'],
    price: 100000,
    multiplier: 100.0,
    emoji: '●',
    iconUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/master-ball.png',
    description: 'Bóng tối thượng — bắt chắc chắn 100% mọi loài kể cả Legendary & Shiny.',
  },
];

const BALL_MAP = new Map<BallId, BallSpec>(BALL_CATALOG.map((b) => [b.id, b]));

export function getBallSpec(ballId: BallId): BallSpec {
  const found = BALL_MAP.get(ballId);
  if (!found) {
    throw new Error(`Không tìm thấy thông số cho loại bóng: ${ballId}`);
  }
  return found;
}

export function resolveBallId(input: string): BallId | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  for (const ball of BALL_CATALOG) {
    if (
      ball.id === normalized ||
      ball.shortCode === normalized ||
      String(ball.shopIndex) === normalized ||
      ball.aliases.includes(normalized)
    ) {
      return ball.id;
    }
  }
  return null;
}
