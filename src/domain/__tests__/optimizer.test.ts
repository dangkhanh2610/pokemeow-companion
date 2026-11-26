import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectGenerationGroup, isGen6Or7Pokemon } from '../data/gen6-7-pokemon';
import {
  BALL_SPECS,
  DEFAULT_BUFF_CONFIG,
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_FISHING_SETUP,
  RARITY_SPECS,
} from '../data/pokemeow-data';
import { calculateDefensiveMatchups } from '../data/type-chart';
import { BallOptimizerService } from '../services/optimizer-service';
import {
  FishingCatchRateStrategy,
  WildCatchRateStrategy,
} from '../strategies/catch-rate-strategy';
import type { BuffConfig, CatchLogEntry, FishingSetup } from '../types';

const service = new BallOptimizerService();

describe('Gen 6 & 7 Pokémon Detection & Battle Type Effectiveness', () => {
  it('identifies Kalos, Alola, and Alolan variants accurately', () => {
    assert.equal(isGen6Or7Pokemon('Froakie'), true);
    assert.equal(isGen6Or7Pokemon('Shiny Greninja'), true);
    assert.equal(isGen6Or7Pokemon('Vivillon'), true);
    assert.equal(isGen6Or7Pokemon('Togedemaru'), true);
    assert.equal(isGen6Or7Pokemon('Alolan Vulpix'), true);
    assert.equal(isGen6Or7Pokemon('Pidgey'), false);
    assert.equal(detectGenerationGroup('Rowlet'), 'gen6_7');
    assert.equal(detectGenerationGroup('Pikachu'), 'gen1_5_8');
  });

  it('computes 4x, 2x, and 0x defensive type matchups accurately for Battle (;b)', () => {
    // Dragonite (Dragon + Flying) -> 4x weak to Ice, immune (0x) to Ground
    const dragonite = calculateDefensiveMatchups(['dragon', 'flying']);
    assert.deepEqual(dragonite.quadWeak, ['ice']);
    assert.equal(dragonite.immune.includes('ground'), true);

    // Scizor (Bug + Steel) -> 4x weak to Fire, immune (0x) to Poison
    const scizor = calculateDefensiveMatchups(['bug', 'steel']);
    assert.deepEqual(scizor.quadWeak, ['fire']);
    assert.equal(scizor.immune.includes('poison'), true);
  });
});

describe('WildCatchRateStrategy & FishingCatchRateStrategy', () => {
  it('calculates Gen 1-5 & 8 and Gen 6-7 catch rates accurately', () => {
    const std = new WildCatchRateStrategy('gen1_5_8');
    const hard = new WildCatchRateStrategy('gen6_7');

    assert.equal(std.calculateCatchRate(RARITY_SPECS.common, BALL_SPECS.pb, DEFAULT_BUFF_CONFIG), 0.8);
    assert.equal(hard.calculateCatchRate(RARITY_SPECS.common, BALL_SPECS.pb, DEFAULT_BUFF_CONFIG), 0.5);
  });

  it('computes Diveball base 85% and stacks PokéLure +5% to 90%', () => {
    const withPokeLure: FishingSetup = {
      ...DEFAULT_FISHING_SETUP,
      lure: 'pokelure',
    };
    const lureFishing = new FishingCatchRateStrategy(withPokeLure);
    assert.equal(
      lureFishing.calculateCatchRate(RARITY_SPECS.super_rare, BALL_SPECS.db, DEFAULT_BUFF_CONFIG),
      0.9,
    );
  });
});

describe('BallOptimizerService EV, Release Valuation & Pity Stats', () => {
  it('supports release valuation mode (;release duplicates) distinct from market mode', () => {
    const strategy = new WildCatchRateStrategy('gen1_5_8');
    const releaseBuffs: BuffConfig = {
      ...DEFAULT_BUFF_CONFIG,
      valuationMode: 'release',
    };

    const srRelease = service.evaluateRarity(
      'super_rare',
      strategy,
      releaseBuffs,
      DEFAULT_ECONOMY_CONFIG,
    );
    const srMarket = service.evaluateRarity(
      'super_rare',
      strategy,
      DEFAULT_BUFF_CONFIG,
      DEFAULT_ECONOMY_CONFIG,
    );

    assert.ok(srMarket.bestBall.expectedReward > srRelease.bestBall.expectedReward);
  });

  it('aggregates session stats, dual cash/market profit, and pity dry-streak counters', () => {
    const logs: CatchLogEntry[] = [
      {
        id: '1',
        timestamp: 1_000_000,
        source: 'wild',
        rarityId: 'legendary',
        ballId: 'mb',
        caught: true,
        pokemonName: 'Rayquaza',
        ballCost: 100000,
        coinsEarned: 205000,
        netProfit: 105000,
      },
      {
        id: '2',
        timestamp: 2_000_000,
        source: 'wild',
        rarityId: 'super_rare',
        ballId: 'ub',
        caught: true,
        pokemonName: 'Dragonite',
        ballCost: 1500,
        coinsEarned: 3500,
        netProfit: 2000,
      },
      {
        id: '3',
        timestamp: 3_000_000,
        source: 'wild',
        rarityId: 'common',
        ballId: 'pb',
        caught: true,
        pokemonName: 'Pidgey',
        ballCost: 200,
        coinsEarned: 250,
        netProfit: 50,
      },
      {
        id: '4',
        timestamp: 4_000_000,
        source: 'wild',
        rarityId: 'uncommon',
        ballId: 'pb',
        caught: false,
        pokemonName: 'Machoke',
        ballCost: 200,
        coinsEarned: 0,
        netProfit: -200,
      },
    ];

    const pity = service.calculatePityStats(logs);
    assert.equal(pity.encountersSinceSuperRarePlus, 2);
    assert.equal(pity.encountersSinceLegendaryOrShiny, 3);
    assert.equal(pity.lastRareCatchName, 'Rayquaza');
  });
});
