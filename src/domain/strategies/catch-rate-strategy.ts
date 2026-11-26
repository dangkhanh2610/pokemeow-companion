import { BALL_ORDER, BALL_SPECS, LURE_SPECS } from '../data/pokemeow-data';
import type { BallSpec, BuffConfig, FishingSetup, GenerationGroup, RaritySpec } from '../types';

/**
 * Strategy interface for computing catch rates across different encounter modes.
 * Allows extending new modes (e.g., raids, quests) without modifying optimizer logic (OCP).
 */
export interface ICatchRateStrategy {
  readonly name: string;
  getEligibleBalls(includePremier: boolean): readonly BallSpec[];
  calculateCatchRate(rarity: RaritySpec, ball: BallSpec, buffs: BuffConfig): number;
}

export function clampRate(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Math.round(value * 10000) / 10000;
}

export function calculateTotalCatchBuff(buffs: BuffConfig): number {
  const ninjaBonus = buffs.patreonNinja ? 5 : 0;
  const totalPct =
    buffs.clanCatchRatePct + ninjaBonus + buffs.eventCatchBoostPct + buffs.charmCatchBoostPct;
  return Math.max(0, totalPct) / 100;
}

export class WildCatchRateStrategy implements ICatchRateStrategy {
  public readonly name: string;
  private readonly generationGroup: GenerationGroup;

  public constructor(generationGroup: GenerationGroup) {
    this.generationGroup = generationGroup;
    this.name =
      generationGroup === 'gen1_5_8' ? 'Wild (;p) — Gen 1–5 & 8' : 'Wild (;p) — Gen 6 & 7';
  }

  public getEligibleBalls(includePremier: boolean): readonly BallSpec[] {
    return BALL_ORDER.map((id) => BALL_SPECS[id]).filter(
      (ball) => !ball.fishingOnly && (includePremier || ball.id !== 'prb'),
    );
  }

  public calculateCatchRate(rarity: RaritySpec, ball: BallSpec, buffs: BuffConfig): number {
    if (ball.id === 'mb' || ball.fixedBaseRate === 1) {
      return 1;
    }

    const baseRate =
      this.generationGroup === 'gen1_5_8' ? rarity.baseRateGen1_5_8 : rarity.baseRateGen6_7;
    const ballBonus = ball.catchBonus ?? 0;
    const totalBuff = calculateTotalCatchBuff(buffs);

    return clampRate(baseRate + ballBonus + totalBuff);
  }
}

export class FishingCatchRateStrategy implements ICatchRateStrategy {
  public readonly name = 'Fishing (;f)';
  private readonly setup: FishingSetup;

  public constructor(setup: FishingSetup) {
    this.setup = setup;
  }

  public getEligibleBalls(includePremier: boolean): readonly BallSpec[] {
    return BALL_ORDER.map((id) => BALL_SPECS[id]).filter(
      (ball) => includePremier || ball.id !== 'prb',
    );
  }

  public calculateCatchRate(rarity: RaritySpec, ball: BallSpec, buffs: BuffConfig): number {
    if (ball.id === 'mb' || ball.fixedBaseRate === 1) {
      return 1;
    }

    const lureCatchBonus = LURE_SPECS[this.setup.lure].catchBonus;
    const totalBuff = calculateTotalCatchBuff(buffs);

    if (ball.id === 'db') {
      const diveBase = ball.fixedBaseRate ?? 0.85;
      return clampRate(diveBase + lureCatchBonus + totalBuff);
    }

    const ballBonus = ball.catchBonus ?? 0;
    return clampRate(rarity.baseRateGen1_5_8 + ballBonus + lureCatchBonus + totalBuff);
  }
}
