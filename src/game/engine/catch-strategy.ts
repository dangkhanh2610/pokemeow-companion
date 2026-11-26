import { getBallSpec } from '../catalog/ball-catalog';
import type { BallId, RarityTier } from '../types';

export interface CatchCalculationInput {
  readonly baseCatchRate: number;
  readonly rarity: RarityTier;
  readonly isShiny: boolean;
  readonly trainerLevel: number;
  readonly ballId: BallId;
}

export interface ICatchStrategy {
  calculateChance(input: CatchCalculationInput): number;
}

function clampChance(value: number): number {
  return Math.max(0.05, Math.min(0.98, value));
}

export class StandardBallCatchStrategy implements ICatchStrategy {
  public calculateChance(input: CatchCalculationInput): number {
    const ball = getBallSpec(input.ballId);
    const levelBonus = Math.min(input.trainerLevel * 0.0025, 0.08);
    const shinyPenalty = input.isShiny ? 0.72 : 1.0;
    const raw = input.baseCatchRate * ball.multiplier * shinyPenalty + levelBonus;
    return clampChance(raw);
  }
}

export class PremierBallCatchStrategy implements ICatchStrategy {
  public calculateChance(input: CatchCalculationInput): number {
    const ball = getBallSpec(input.ballId);
    const levelBonus = Math.min(input.trainerLevel * 0.0025, 0.08);
    const isHighValue =
      input.isShiny ||
      input.rarity === 'super_rare' ||
      input.rarity === 'legendary' ||
      input.rarity === 'mega';
    const premierBonus = isHighValue ? 0.15 : 0;
    const shinyPenalty = input.isShiny ? 0.78 : 1.0;
    const raw = input.baseCatchRate * ball.multiplier * shinyPenalty + levelBonus + premierBonus;
    return clampChance(raw);
  }
}

export class MasterBallCatchStrategy implements ICatchStrategy {
  public calculateChance(input: CatchCalculationInput): number {
    void input;
    return 1.0;
  }
}

export class CatchStrategyRegistry {
  private readonly strategies: Readonly<Record<BallId, ICatchStrategy>>;

  public constructor() {
    const standard = new StandardBallCatchStrategy();
    this.strategies = {
      pokeball: standard,
      greatball: standard,
      ultraball: standard,
      premierball: new PremierBallCatchStrategy(),
      masterball: new MasterBallCatchStrategy(),
    };
  }

  public calculateChance(input: CatchCalculationInput): number {
    const strategy = this.strategies[input.ballId];
    return strategy.calculateChance(input);
  }
}

export const defaultCatchStrategyRegistry = new CatchStrategyRegistry();
