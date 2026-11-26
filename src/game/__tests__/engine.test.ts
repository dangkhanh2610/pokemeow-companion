import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BALL_CATALOG, getBallSpec, resolveBallId } from '../catalog/ball-catalog';
import { PokemonCreatureCatalog, RARITY_CONFIGS } from '../catalog/creature-catalog';
import { CatchStrategyRegistry } from '../engine/catch-strategy';
import { applyXp, computeIvSummary, SpawnEngine, xpForNextLevel } from '../engine/spawn-engine';

describe('PokéVerse RPG Core Engine', () => {
  it('PokemonCreatureCatalog tải đầy đủ toàn bộ 1,025 loài National Dex với đủ 5 độ hiếm', () => {
    const catalog = new PokemonCreatureCatalog();
    const all = catalog.getAll();
    assert.equal(all.length, 1025);

    const uniqueIds = new Set(all.map((s) => s.id));
    assert.equal(uniqueIds.size, 1025);

    assert.ok(catalog.getByRarity('common').length > 0);
    assert.ok(catalog.getByRarity('uncommon').length > 0);
    assert.ok(catalog.getByRarity('rare').length > 0);
    assert.ok(catalog.getByRarity('super_rare').length > 0);
    assert.ok(catalog.getByRarity('legendary').length > 0);

    const pikachu = catalog.getById(25);
    const mrMime = catalog.getById(122);
    const hoOh = catalog.getById(250);
    const rayquaza = catalog.getById(384);
    const koraidon = catalog.getById(1007);
    const pecharunt = catalog.getById(1025);

    assert.equal(pikachu?.name, 'Pikachu');
    assert.equal(mrMime?.name, 'Mr. Mime');
    assert.equal(mrMime?.slug, 'mrmime');
    assert.equal(hoOh?.name, 'Ho-Oh');
    assert.equal(hoOh?.slug, 'hooh');
    assert.equal(rayquaza?.rarity, 'legendary');
    assert.equal(koraidon?.name, 'Koraidon');
    assert.equal(pecharunt?.name, 'Pecharunt');
    assert.ok(catalog.search('dragon').length >= 1);

    for (const species of all) {
      assert.ok(species.baseStats.bst > 0, `${species.name} thiếu baseStats.bst`);
      assert.ok(
        species.animatedSpriteUrl.startsWith('https://'),
        `${species.name} thiếu animatedSpriteUrl hợp lệ`,
      );
      assert.ok(
        species.shinyAnimatedSpriteUrl.startsWith('https://'),
        `${species.name} thiếu shinyAnimatedSpriteUrl hợp lệ`,
      );
    }
  });

  it('BallCatalog và resolveBallId phân giải chính xác các bí danh bóng', () => {
    assert.equal(BALL_CATALOG.length, 5);
    for (const ball of BALL_CATALOG) {
      assert.ok(ball.iconUrl.startsWith('https://'), `${ball.id} thiếu iconUrl hợp lệ`);
    }
    assert.equal(resolveBallId('pb'), 'pokeball');
    assert.equal(resolveBallId('GB'), 'greatball');
    assert.equal(resolveBallId('ultra'), 'ultraball');
    assert.equal(resolveBallId('PRB'), 'premierball');
    assert.equal(resolveBallId('mb'), 'masterball');
    assert.equal(resolveBallId('unknown-ball'), null);
    assert.equal(getBallSpec('masterball').price, 100000);
  });

  it('CatchStrategyRegistry tính đúng tỉ lệ bắt cho Master Ball, Premier Ball và giới hạn biên', () => {
    const registry = new CatchStrategyRegistry();

    const masterChance = registry.calculateChance({
      baseCatchRate: 0.08,
      rarity: 'legendary',
      isShiny: true,
      trainerLevel: 1,
      ballId: 'masterball',
    });
    assert.equal(masterChance, 1.0);

    const ultraLegendary = registry.calculateChance({
      baseCatchRate: 0.1,
      rarity: 'legendary',
      isShiny: false,
      trainerLevel: 1,
      ballId: 'ultraball',
    });
    const premierLegendary = registry.calculateChance({
      baseCatchRate: 0.1,
      rarity: 'legendary',
      isShiny: false,
      trainerLevel: 1,
      ballId: 'premierball',
    });
    assert.ok(premierLegendary > ultraLegendary);

    const lowLevelPoke = registry.calculateChance({
      baseCatchRate: 0.08,
      rarity: 'legendary',
      isShiny: true,
      trainerLevel: 1,
      ballId: 'pokeball',
    });
    const highLevelPoke = registry.calculateChance({
      baseCatchRate: 0.08,
      rarity: 'legendary',
      isShiny: true,
      trainerLevel: 50,
      ballId: 'pokeball',
    });
    assert.ok(highLevelPoke >= lowLevelPoke);
    assert.ok(highLevelPoke <= 0.98);
    assert.ok(lowLevelPoke >= 0.05);
  });

  it('SpawnEngine sinh loài hợp lệ, chỉ số IV nằm trong [0..31] và tổng IV% trong [0..100]', () => {
    const catalog = new PokemonCreatureCatalog();
    const engine = new SpawnEngine(catalog, () => 0.42);
    const roll = engine.rollEncounter();

    assert.ok(catalog.getById(roll.species.id));
    for (const stat of Object.values(roll.ivs)) {
      assert.ok(stat >= 0 && stat <= 31);
    }
    assert.ok(roll.ivTotal >= 0 && roll.ivTotal <= 186);
    assert.ok(roll.ivPercent >= 0 && roll.ivPercent <= 100);

    const ivSummary = computeIvSummary({
      hp: 31,
      atk: 31,
      def: 31,
      spAtk: 31,
      spDef: 31,
      spd: 31,
    });
    assert.equal(ivSummary.ivTotal, 186);
    assert.equal(ivSummary.ivPercent, 100);
  });

  it('applyXp tăng cấp chính xác khi vượt ngưỡng xpForNextLevel', () => {
    const needLv1 = xpForNextLevel(1);
    const res = applyXp(0, 1, needLv1 + 20);
    assert.equal(res.level, 2);
    assert.equal(res.xp, 20);
    assert.equal(res.leveledUp, true);
    assert.ok(RARITY_CONFIGS.legendary.xpReward > RARITY_CONFIGS.common.xpReward);
  });
});
