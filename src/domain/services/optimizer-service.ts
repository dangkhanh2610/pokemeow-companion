import {
  BALL_ORDER,
  LURE_SPECS,
  RARITY_ORDER,
  RARITY_SPECS,
  ROD_SPECS,
} from '../data/pokemeow-data';
import { clampRate, type ICatchRateStrategy } from '../strategies/catch-rate-strategy';
import type {
  BallEvaluation,
  BallId,
  BallStatBucket,
  BuffConfig,
  CatchLogEntry,
  EconomyConfig,
  FishingMetrics,
  FishingSetup,
  PityStats,
  QuickProfitReport,
  RarityId,
  RarityOptimizationResult,
  RarityStatBucket,
  RecommendationTag,
  SessionStats,
} from '../types';

const HIGH_VALUE_RARITIES: ReadonlySet<RarityId> = new Set([
  'legendary',
  'shiny_full',
  'shiny_event',
  'golden',
]);

export class BallOptimizerService {
  public getSecondaryValue(
    rarityId: RarityId,
    buffs: BuffConfig,
    economy: EconomyConfig,
  ): number {
    const entry = economy.rarityValues[rarityId];
    return buffs.valuationMode === 'release' ? entry.releaseValue : entry.marketValue;
  }

  public evaluateRarity(
    rarityId: RarityId,
    strategy: ICatchRateStrategy,
    buffs: BuffConfig,
    economy: EconomyConfig,
    goldenHourMultiplier = 1,
  ): RarityOptimizationResult {
    const rarity = RARITY_SPECS[rarityId];
    const eligibleBalls = strategy.getEligibleBalls(buffs.includePremierBall);
    const economyEntry = economy.rarityValues[rarityId];

    const amuletMultiplier = 1 + 0.05 * Math.min(10, Math.max(0, buffs.amuletCoins));
    const secondaryValue = this.getSecondaryValue(rarityId, buffs, economy);
    const expectedReward =
      economyEntry.catchCoins * amuletMultiplier * goldenHourMultiplier + secondaryValue;

    const rawEvaluations = eligibleBalls.map((ball) => {
      const catchRate = strategy.calculateCatchRate(rarity, ball, buffs);
      const ballPrice = economy.ballPrices[ball.id];
      const saveChance = catchRate * (Math.min(100, Math.max(0, buffs.quickHandsSavePct)) / 100);
      const effectiveBallCost = ballPrice * (1 - saveChance);
      const expectedValue = catchRate * expectedReward - effectiveBallCost;
      const roiPct = effectiveBallCost > 0 ? (expectedValue / effectiveBallCost) * 100 : 0;

      return {
        ballId: ball.id,
        catchRate,
        effectiveBallCost,
        expectedReward,
        expectedValue,
        roiPct,
      };
    });

    if (rawEvaluations.length === 0) {
      throw new Error(`No eligible balls available for rarity "${rarityId}".`);
    }

    let bestIndex = 0;
    for (let i = 1; i < rawEvaluations.length; i += 1) {
      const current = rawEvaluations[i];
      const best = rawEvaluations[bestIndex];
      if (!current || !best) continue;
      if (current.expectedValue > best.expectedValue) {
        bestIndex = i;
      } else if (
        current.expectedValue === best.expectedValue &&
        current.effectiveBallCost < best.effectiveBallCost
      ) {
        bestIndex = i;
      }
    }

    let cheapestPositiveIndex = -1;
    for (let i = 0; i < rawEvaluations.length; i += 1) {
      const item = rawEvaluations[i];
      if (!item || item.expectedValue <= 0) continue;
      if (cheapestPositiveIndex === -1) {
        cheapestPositiveIndex = i;
      } else {
        const existing = rawEvaluations[cheapestPositiveIndex];
        if (existing && item.effectiveBallCost < existing.effectiveBallCost) {
          cheapestPositiveIndex = i;
        }
      }
    }

    const evaluations: BallEvaluation[] = rawEvaluations.map((item, idx) => {
      const isBestEv = idx === bestIndex;
      let recommendationTag: RecommendationTag = null;

      if (isBestEv) {
        recommendationTag = 'optimal';
      } else if (
        HIGH_VALUE_RARITIES.has(rarityId) &&
        (item.ballId === 'mb' || item.catchRate >= 1)
      ) {
        recommendationTag = 'safe';
      } else if (idx === cheapestPositiveIndex && !isBestEv) {
        recommendationTag = 'budget';
      } else if (
        !HIGH_VALUE_RARITIES.has(rarityId) &&
        item.ballId === 'mb' &&
        item.expectedValue < 0
      ) {
        recommendationTag = 'overkill';
      }

      return {
        ...item,
        isBestEv,
        recommendationTag,
      };
    });

    const bestBall = evaluations[bestIndex];
    if (!bestBall) {
      throw new Error(`Missing best ball evaluation for "${rarityId}".`);
    }

    return {
      rarityId,
      bestBall,
      evaluations,
    };
  }

  public optimizeAllRarities(
    strategy: ICatchRateStrategy,
    buffs: BuffConfig,
    economy: EconomyConfig,
    rarities: readonly RarityId[] = RARITY_ORDER,
    goldenHourMultiplier = 1,
  ): readonly RarityOptimizationResult[] {
    return rarities.map((rarityId) =>
      this.evaluateRarity(rarityId, strategy, buffs, economy, goldenHourMultiplier),
    );
  }

  public calculateFishingMetrics(setup: FishingSetup, buffs: BuffConfig): FishingMetrics {
    const rod = ROD_SPECS[setup.rod];
    const lure = LURE_SPECS[setup.lure];

    const effectiveSpawnRate = clampRate(rod.spawnRate + lure.spawnBonus);
    const shinyMultiplier = buffs.shinyCharmOwned ? 2 : 1;
    const goldenHourMultiplier = setup.goldenHour ? 2 : 1;
    const shinyOddsDenominator = Math.max(
      1,
      Math.round(rod.shinyDenominator / (shinyMultiplier * goldenHourMultiplier)),
    );

    const lureCostPerCastCoins =
      lure.uses > 0 ? (lure.tokenCost / lure.uses) * Math.max(0, setup.tokenToCoinRate) : 0;

    return {
      effectiveSpawnRate,
      shinyOddsDenominator,
      lureCostPerCastCoins,
    };
  }

  public computeSingleCatchProfit(
    rarityId: RarityId,
    ballId: BallId,
    caught: boolean,
    buffs: BuffConfig,
    economy: EconomyConfig,
  ): { readonly ballCost: number; readonly coinsEarned: number; readonly netProfit: number } {
    const ballCost = economy.ballPrices[ballId];
    if (!caught) {
      return {
        ballCost,
        coinsEarned: 0,
        netProfit: -ballCost,
      };
    }

    const rarityValue = economy.rarityValues[rarityId];
    const amuletMultiplier = 1 + 0.05 * Math.min(10, Math.max(0, buffs.amuletCoins));
    const secondaryValue = this.getSecondaryValue(rarityId, buffs, economy);
    const coinsEarned = Math.round(rarityValue.catchCoins * amuletMultiplier + secondaryValue);

    return {
      ballCost,
      coinsEarned,
      netProfit: coinsEarned - ballCost,
    };
  }

  public calculateSessionStats(logs: readonly CatchLogEntry[]): SessionStats {
    const byRarity = {} as Record<RarityId, RarityStatBucket>;
    for (const r of RARITY_ORDER) {
      byRarity[r] = { seen: 0, caught: 0, netProfit: 0 };
    }

    const byBall = {} as Record<BallId, BallStatBucket>;
    for (const b of BALL_ORDER) {
      byBall[b] = { used: 0, caught: 0, netProfit: 0 };
    }

    let totalCaught = 0;
    let totalSpent = 0;
    let totalEarned = 0;
    let legendary = 0;
    let shiny = 0;
    let golden = 0;

    for (const entry of logs) {
      if (entry.caught) {
        totalCaught += 1;
        if (entry.rarityId === 'legendary') legendary += 1;
        if (entry.rarityId === 'shiny_full' || entry.rarityId === 'shiny_event') shiny += 1;
        if (entry.rarityId === 'golden') golden += 1;
      }

      totalSpent += entry.ballCost;
      totalEarned += entry.coinsEarned;

      const prevRarity = byRarity[entry.rarityId];
      byRarity[entry.rarityId] = {
        seen: prevRarity.seen + 1,
        caught: prevRarity.caught + (entry.caught ? 1 : 0),
        netProfit: prevRarity.netProfit + entry.netProfit,
      };

      const prevBall = byBall[entry.ballId];
      byBall[entry.ballId] = {
        used: prevBall.used + 1,
        caught: prevBall.caught + (entry.caught ? 1 : 0),
        netProfit: prevBall.netProfit + entry.netProfit,
      };
    }

    const totalEncounters = logs.length;
    const catchSuccessRate = totalEncounters > 0 ? totalCaught / totalEncounters : 0;

    return {
      totalEncounters,
      totalCaught,
      catchSuccessRate,
      totalSpent,
      totalEarned,
      netProfit: totalEarned - totalSpent,
      rareHighlights: { legendary, shiny, golden },
      byRarity,
      byBall,
    };
  }

  /**
   * Computes dual Cash (;release) vs Asset (;market) profit & hourly grind velocity
   * for quick profit analysis (/profit and Live Sync dashboard).
   */
  public calculateQuickProfitReport(
    logs: readonly CatchLogEntry[],
    buffs: BuffConfig,
    economy: EconomyConfig,
  ): QuickProfitReport {
    const byBall = {} as Record<
      BallId,
      { readonly used: number; readonly caught: number; readonly releaseNet: number }
    >;
    for (const b of BALL_ORDER) {
      byBall[b] = { used: 0, caught: 0, releaseNet: 0 };
    }

    if (logs.length === 0) {
      return {
        totalEncounters: 0,
        totalCaught: 0,
        catchSuccessRate: 0,
        totalBallSpent: 0,
        releaseGrossEarned: 0,
        releaseNetProfit: 0,
        marketGrossEarned: 0,
        marketNetProfit: 0,
        durationMinutes: 0,
        catchesPerHour: 0,
        releaseCoinsPerHour: 0,
        byBall,
      };
    }

    const amuletMultiplier = 1 + 0.05 * Math.min(10, Math.max(0, buffs.amuletCoins));
    let totalCaught = 0;
    let totalBallSpent = 0;
    let releaseGrossEarned = 0;
    let marketGrossEarned = 0;
    let minTs = Number.POSITIVE_INFINITY;
    let maxTs = 0;

    for (const entry of logs) {
      if (entry.timestamp < minTs) minTs = entry.timestamp;
      if (entry.timestamp > maxTs) maxTs = entry.timestamp;

      totalBallSpent += entry.ballCost;

      const rv = economy.rarityValues[entry.rarityId];
      let entryReleaseEarned = 0;

      if (entry.caught) {
        totalCaught += 1;
        // Infer actual raw catch coins if coinsEarned included a previous secondaryValue, else compute from config
        const defaultCatchDrop = Math.round(rv.catchCoins * amuletMultiplier);
        entryReleaseEarned = defaultCatchDrop + rv.releaseValue;
        const entryMarketEarned = defaultCatchDrop + rv.marketValue;

        releaseGrossEarned += entryReleaseEarned;
        marketGrossEarned += entryMarketEarned;
      }

      const prev = byBall[entry.ballId];
      const deltaReleaseNet = (entry.caught ? entryReleaseEarned : 0) - entry.ballCost;
      byBall[entry.ballId] = {
        used: prev.used + 1,
        caught: prev.caught + (entry.caught ? 1 : 0),
        releaseNet: prev.releaseNet + deltaReleaseNet,
      };
    }

    const spanMs = Math.max(60_000, maxTs - minTs);
    const durationMinutes = Math.round((spanMs / 60_000) * 10) / 10;
    const hours = spanMs / 3_600_000;
    const releaseNetProfit = releaseGrossEarned - totalBallSpent;
    const marketNetProfit = marketGrossEarned - totalBallSpent;

    return {
      totalEncounters: logs.length,
      totalCaught,
      catchSuccessRate: totalCaught / logs.length,
      totalBallSpent,
      releaseGrossEarned,
      releaseNetProfit,
      marketGrossEarned,
      marketNetProfit,
      durationMinutes,
      catchesPerHour: Math.round(totalCaught / hours),
      releaseCoinsPerHour: Math.round(releaseNetProfit / hours),
      byBall,
    };
  }

  public calculatePityStats(logs: readonly CatchLogEntry[]): PityStats {
    const orderedDesc = [...logs].sort((a, b) => b.timestamp - a.timestamp);
    let sinceSrPlus = 0;
    let foundSrPlus = false;

    let sinceLegOrShiny = 0;
    let foundLegOrShiny = false;
    let lastRareName: string | null = null;
    let lastRareRarity: RarityId | null = null;

    for (const entry of orderedDesc) {
      const isLegOrShiny = HIGH_VALUE_RARITIES.has(entry.rarityId);
      const isSrPlus = isLegOrShiny || entry.rarityId === 'super_rare';

      if (!foundSrPlus) {
        if (isSrPlus) {
          foundSrPlus = true;
        } else {
          sinceSrPlus += 1;
        }
      }

      if (!foundLegOrShiny) {
        if (isLegOrShiny) {
          foundLegOrShiny = true;
          if (entry.caught) {
            lastRareName = entry.pokemonName || RARITY_SPECS[entry.rarityId].label;
            lastRareRarity = entry.rarityId;
          }
        } else {
          sinceLegOrShiny += 1;
        }
      }

      if (foundSrPlus && foundLegOrShiny) break;
    }

    return {
      encountersSinceSuperRarePlus: sinceSrPlus,
      encountersSinceLegendaryOrShiny: sinceLegOrShiny,
      lastRareCatchName: lastRareName,
      lastRareCatchRarity: lastRareRarity,
    };
  }
}

export const optimizerService = new BallOptimizerService();
