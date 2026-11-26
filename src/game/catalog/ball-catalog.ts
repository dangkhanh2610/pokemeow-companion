import type { BallId, BallSpec } from '../types';

export const BALL_CATALOG: readonly BallSpec[] = [
  {
    id: 'pokeball',
    name: 'Poké Ball',
    shortCode: 'pb',
    aliases: ['pb', 'poke', 'pokeball', 'pokéball'],
    price: 200,
    multiplier: 1.0,
    emoji: '🔴',
    description: 'Bóng cơ bản dùng để bắt Pokémon phổ thông và nâng cấp bộ sưu tập.',
  },
  {
    id: 'greatball',
    name: 'Great Ball',
    shortCode: 'gb',
    aliases: ['gb', 'great', 'greatball'],
    price: 500,
    multiplier: 1.5,
    emoji: '🔵',
    description: 'Tỉ lệ bắt cao hơn 1.5x so với Poké Ball, phù hợp bắt Uncommon & Rare.',
  },
  {
    id: 'ultraball',
    name: 'Ultra Ball',
    shortCode: 'ub',
    aliases: ['ub', 'ultra', 'ultraball'],
    price: 1500,
    multiplier: 2.2,
    emoji: '🟡',
    description: 'Bóng hiệu suất cao (2.2x) dành cho Rare & Super Rare.',
  },
  {
    id: 'premierball',
    name: 'Premier Ball',
    shortCode: 'prb',
    aliases: ['prb', 'premier', 'premierball'],
    price: 5000,
    multiplier: 3.0,
    emoji: '⚪',
    description: 'Bóng đặc biệt (3.0x + thưởng +15% cho Shiny, Super Rare & Legendary).',
  },
  {
    id: 'masterball',
    name: 'Master Ball',
    shortCode: 'mb',
    aliases: ['mb', 'master', 'masterball'],
    price: 100000,
    multiplier: 100.0,
    emoji: '🟣',
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
    if (ball.id === normalized || ball.shortCode === normalized || ball.aliases.includes(normalized)) {
      return ball.id;
    }
  }
  return null;
}
