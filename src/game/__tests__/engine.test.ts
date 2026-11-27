import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BALL_CATALOG, getBallSpec, resolveBallId } from '../catalog/ball-catalog';
import { defaultCreatureCatalog, PokemonCreatureCatalog, RARITY_CONFIGS } from '../catalog/creature-catalog';
import { getWaterPools, resolveBaitId, resolveRodId, ROD_CATALOG } from '../catalog/fishing-catalog';
import { getSpeciesMovePool, resolveEquippedMoves } from '../catalog/move-catalog';
import {
  analyzeDefensiveMatchups,
  applyEndOfRoundStatus,
  buildCombatant,
  computeComputedStats,
  executeMove,
  getEffectiveSpeed,
  getTypeEffectiveness,
} from '../engine/battle-engine';
import { CHALLENGER_ROSTER } from '../services/battle-service';
import { CatchStrategyRegistry } from '../engine/catch-strategy';
import {
  applyXp,
  calculateBuddyCatchXp,
  computeIvSummary,
  creatureXpNeeded,
  MAX_CREATURE_LEVEL,
  SHINY_CHANCE,
  SpawnEngine,
  xpForNextLevel,
} from '../engine/spawn-engine';
import { rollNextCaptchaThreshold } from '../services/captcha-service';
import { ENCOUNTER_NETWORK_GRACE_MS, ENCOUNTER_TTL_MS } from '../services/encounter-service';
import { addCreatureXp, getEvolutionBranches } from '../services/evolution-service';
import { isChannelAllowed, validatePrefix } from '../services/guild-config-service';
import {
  parseBoxCommandArgs,
  sortBoxCreatures,
  type SortableBoxCreature,
} from '../services/trainer-service';

describe('PokéVerse RPG Core Engine', () => {
  it('PokemonCreatureCatalog tải đủ 1,025 loài gốc + các dạng Mega/Gmax/Regional/Special', () => {
    const catalog = new PokemonCreatureCatalog();
    const all = catalog.getAll();
    const baseSpecies = all.filter((s) => s.formType === 'base');
    const megaSpecies = all.filter((s) => s.formType === 'mega');

    assert.equal(baseSpecies.length, 1025);
    assert.ok(all.length > 1100);
    assert.ok(megaSpecies.length >= 45);

    const uniqueIds = new Set(all.map((s) => s.id));
    assert.equal(uniqueIds.size, all.length);

    assert.ok(catalog.getByRarity('common').length > 0);
    assert.ok(catalog.getByRarity('uncommon').length > 0);
    assert.ok(catalog.getByRarity('rare').length > 0);
    assert.ok(catalog.getByRarity('super_rare').length > 0);
    assert.ok(catalog.getByRarity('legendary').length > 0);
    assert.ok(catalog.getByRarity('mega').length >= 45);

    const pikachu = catalog.getById(25);
    const mrMime = catalog.getById(122);
    const hoOh = catalog.getById(250);
    const rayquaza = catalog.getById(384);
    const koraidon = catalog.getById(1007);
    const pecharunt = catalog.getById(1025);
    const megaCharizardX = all.find((s) => s.name === 'Charizard-Mega-X');
    const primalGroudon = all.find((s) => s.name === 'Groudon-Primal');
    const megaRayquaza = all.find((s) => s.name === 'Rayquaza-Mega');

    assert.equal(pikachu?.name, 'Pikachu');
    assert.equal(mrMime?.name, 'Mr. Mime');
    assert.equal(mrMime?.slug, 'mrmime');
    assert.equal(hoOh?.name, 'Ho-Oh');
    assert.equal(hoOh?.slug, 'hooh');
    assert.equal(rayquaza?.rarity, 'legendary');
    assert.equal(koraidon?.name, 'Koraidon');
    assert.equal(pecharunt?.name, 'Pecharunt');
    assert.equal(megaCharizardX?.rarity, 'mega');
    assert.equal(megaCharizardX?.dexNumber, 6);
    assert.equal(primalGroudon?.rarity, 'mega');
    const raichuMegaX = all.find((s) => s.name === 'Raichu-Mega-X');
    const greninjaMega = all.find((s) => s.name === 'Greninja-Mega');

    assert.equal(megaRayquaza?.rarity, 'mega');
    assert.ok(raichuMegaX?.shinyAnimatedSpriteUrl);
    assert.ok(!raichuMegaX.shinyAnimatedSpriteUrl.includes('ani-shiny'));
    assert.ok(greninjaMega?.shinyAnimatedSpriteUrl.includes('dex-shiny'));
    assert.ok(catalog.search('dragon').length >= 1);
    assert.equal(catalog.findMegaByQuery('rayquaza')?.name, 'Rayquaza-Mega');
    assert.equal(catalog.findMegaByQuery('charizard x')?.name, 'Charizard-Mega-X');
    assert.equal(RARITY_CONFIGS.legendary.weight, 0.05);
    assert.equal(RARITY_CONFIGS.mega.weight, 0);
    assert.equal(SHINY_CHANCE, 1 / 8192);
    assert.equal(ENCOUNTER_TTL_MS, 10_000);
    assert.ok(ENCOUNTER_NETWORK_GRACE_MS >= 3_000);

    // Đảm bảo SpawnEngine không bao giờ spawn ra Mega ngoài tự nhiên
    for (let i = 0; i < 500; i += 1) {
      const fixedEngine = new SpawnEngine(defaultCreatureCatalog, () => i / 500);
      assert.notEqual(fixedEngine.rollRarity(), 'mega');
    }

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
    assert.equal(resolveBallId('1'), 'pokeball');
    assert.equal(resolveBallId('2'), 'greatball');
    assert.equal(resolveBallId('3'), 'ultraball');
    assert.equal(resolveBallId('4'), 'premierball');
    assert.equal(resolveBallId('5'), 'masterball');
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

    const ultraMega = registry.calculateChance({
      baseCatchRate: 0.08,
      rarity: 'mega',
      isShiny: false,
      trainerLevel: 1,
      ballId: 'ultraball',
    });
    const premierMega = registry.calculateChance({
      baseCatchRate: 0.08,
      rarity: 'mega',
      isShiny: false,
      trainerLevel: 1,
      ballId: 'premierball',
    });
    assert.ok(premierMega > ultraMega);

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

  it('isChannelAllowed và validatePrefix xử lý đúng cấu hình server đa bot', () => {
    assert.equal(
      isChannelAllowed({ allowedChannels: [], blockedChannels: [] }, 'ch-1'),
      true,
    );
    assert.equal(
      isChannelAllowed({ allowedChannels: [], blockedChannels: ['ch-1'] }, 'ch-1'),
      false,
    );
    assert.equal(
      isChannelAllowed({ allowedChannels: ['ch-2'], blockedChannels: [] }, 'ch-1'),
      false,
    );
    assert.equal(
      isChannelAllowed({ allowedChannels: ['ch-2'], blockedChannels: ['ch-2'] }, 'ch-2'),
      false,
    );
    assert.equal(
      isChannelAllowed({ allowedChannels: ['ch-2'], blockedChannels: [] }, 'ch-2'),
      true,
    );

    assert.equal(validatePrefix(' n! '), 'n!');
    assert.equal(validatePrefix('.'), '.');
    assert.equal(validatePrefix(''), null);
    assert.equal(validatePrefix('a b'), null);
    assert.equal(validatePrefix('toolong'), null);
    assert.equal(validatePrefix('<@123>'), null);
  });

  it('Hệ thống Tiến hóa, Câu cá Nước, Buddy Bonus, Chiến đấu theo lượt & Anti-Macro Captcha hoạt động chính xác', () => {
    // 1. Evolution chains & Creature XP
    const bulbaEvos = getEvolutionBranches(1);
    assert.equal(bulbaEvos.length, 1);
    assert.equal(bulbaEvos[0]?.toSpeciesId, 2);
    assert.equal(bulbaEvos[0]?.requiredLevel, 16);

    const eeveeEvos = getEvolutionBranches(133);
    assert.equal(eeveeEvos.length, 8);

    const charMega = defaultCreatureCatalog.getAll().find((s) => s.name === 'Charizard-Mega-X');
    assert.ok(charMega);
    assert.equal(getEvolutionBranches(charMega.id).length, 0);

    const xpRes = addCreatureXp(0, 1, 60);
    assert.equal(xpRes.level, 2);
    assert.equal(xpRes.xp, 10);
    assert.equal(xpRes.leveledUp, true);
    assert.equal(xpRes.levelsGained, 1);

    // Progressive Creature XP Curve: strictly increasing XP needed per level
    assert.equal(creatureXpNeeded(1), 50);
    for (let lv = 1; lv < MAX_CREATURE_LEVEL; lv += 1) {
      assert.ok(
        creatureXpNeeded(lv + 1) > creatureXpNeeded(lv),
        `XP cần cho Lv.${lv + 1} phải lớn hơn Lv.${lv}`,
      );
    }

    // Buddy Catch XP scales with Rarity, Shiny & Fishing
    const xpCommon = calculateBuddyCatchXp('common', false, 'wild');
    const xpUncommon = calculateBuddyCatchXp('uncommon', false, 'wild');
    const xpRare = calculateBuddyCatchXp('rare', false, 'wild');
    const xpSuperRare = calculateBuddyCatchXp('super_rare', false, 'wild');
    const xpLegendary = calculateBuddyCatchXp('legendary', false, 'wild');
    const xpShinyCommon = calculateBuddyCatchXp('common', true, 'wild');
    const xpFishingRare = calculateBuddyCatchXp('rare', false, 'fishing');

    assert.ok(xpCommon < xpUncommon);
    assert.ok(xpUncommon < xpRare);
    assert.ok(xpRare < xpSuperRare);
    assert.ok(xpSuperRare < xpLegendary);
    assert.ok(xpShinyCommon >= 600);
    assert.ok(xpFishingRare > xpRare);

    // Catching a Legendary (+1000 XP) levels a Lv.1 Buddy up multiple levels with leftover XP
    const multiJump = addCreatureXp(0, 1, xpLegendary);
    assert.ok(multiJump.levelsGained >= 6);
    assert.equal(multiJump.leveledUp, true);
    assert.ok(multiJump.xp < creatureXpNeeded(multiJump.level));

    // 2. Fishing catalog & Water pools
    assert.equal(ROD_CATALOG.length, 4);
    assert.equal(resolveRodId('good'), 'good_rod');
    assert.equal(resolveBaitId('lure'), 'bait_lure');
    assert.ok(getWaterPools().common.length >= 20);
    assert.ok(getWaterPools().legendary.length >= 2);

    // 3. Buddy +4% catch bonus
    const registry = new CatchStrategyRegistry();
    const noBuddy = registry.calculateChance({
      baseCatchRate: 0.3,
      rarity: 'rare',
      isShiny: false,
      trainerLevel: 1,
      ballId: 'pokeball',
      hasBuddyBonus: false,
    });
    const withBuddy = registry.calculateChance({
      baseCatchRate: 0.3,
      rarity: 'rare',
      isShiny: false,
      trainerLevel: 1,
      ballId: 'pokeball',
      hasBuddyBonus: true,
    });
    assert.ok(withBuddy > noBuddy);

    const masterWithBuddy = registry.calculateChance({
      baseCatchRate: 0.08,
      rarity: 'legendary',
      isShiny: true,
      trainerLevel: 1,
      ballId: 'masterball',
      hasBuddyBonus: true,
    });
    assert.equal(masterWithBuddy, 1.0);

    // 4. Exact type effectiveness chart (including 0x immunities), Dragon Self-Hit trait & status effects
    assert.equal(getTypeEffectiveness('Water', ['Fire']), 2);
    assert.equal(getTypeEffectiveness('Fire', ['Water']), 0.5);
    assert.equal(getTypeEffectiveness('Electric', ['Ground']), 0);
    assert.equal(getTypeEffectiveness('Dragon', ['Fairy']), 0);

    const blastoise = defaultCreatureCatalog.getById(9)!;
    const charizard = defaultCreatureCatalog.getById(6)!;
    const dragonite = defaultCreatureCatalog.getById(149)!;
    const ivs = { hp: 20, atk: 20, def: 20, spAtk: 20, spDef: 20, spd: 20 };

    // Default combatant has strictly 2 starter moves until buying more in the Skill Shop
    const combatA = buildCombatant(blastoise, ivs, 36, false, 'u1', 'PlayerA');
    const combatB = buildCombatant(charizard, ivs, 36, false, 'u2', 'PlayerB');
    assert.equal(combatA.moves.length, 2);

    const hitRes = executeMove(combatA, combatB, 0, true, () => 0.5);
    assert.equal(hitRes.hit, true);
    assert.ok(hitRes.damageDealt > 0);
    assert.ok(combatB.hp < combatB.maxHp);

    // Unlocking & equipping extra moves expands slots up to 4
    const blastPool = getSpeciesMovePool(blastoise);
    assert.ok(blastPool.shopMoves.length >= 6);
    const customEquipped = resolveEquippedMoves(
      blastoise,
      [
        blastPool.starterMoves[0].id,
        blastPool.starterMoves[1].id,
        blastPool.shopMoves[0]!.id,
        blastPool.shopMoves[1]!.id,
      ],
      [blastPool.shopMoves[0]!.id, blastPool.shopMoves[1]!.id],
    );
    assert.equal(customEquipped.length, 4);

    // Exhaustive check: every species in Pokedex gets 2 starter moves with no shared 0x immunity lock + >=6 shop moves
    const allTargets = defaultCreatureCatalog.getAll();
    for (const sp of allTargets) {
      const pool = getSpeciesMovePool(sp);
      assert.equal(pool.starterMoves.length, 2, `${sp.name} phải có đúng 2 skill mặc định`);
      assert.ok(pool.shopMoves.length >= 6, `${sp.name} phải có ít nhất 6 skill trong shop riêng`);
      const m1EffGhost = getTypeEffectiveness(pool.starterMoves[0].type, ['Ghost']);
      const m2EffGhost = getTypeEffectiveness(pool.starterMoves[1].type, ['Ghost']);
      assert.ok(m1EffGhost > 0 || m2EffGhost > 0, `${sp.name} không được kẹt 0x trước Ghost`);
    }

    // Dragon Type Trait: Self-Hit recoil when RNG rolls < 0.22
    const combatDragon = buildCombatant(dragonite, ivs, 55, false, 'u3', 'Lance');
    const dragonHpBefore = combatDragon.hp;
    const dragonHit = executeMove(combatDragon, combatB, 0, true, () => 0.1);
    assert.equal(dragonHit.hit, true);
    assert.ok(dragonHit.selfDamageDealt > 0);
    assert.equal(combatDragon.hp, dragonHpBefore - dragonHit.selfDamageDealt);

    // End-of-round Poison tick & Paralyze speed reduction
    const hpBeforePoison = combatA.hp;
    combatA.status = 'POISON';
    const poisonLog = applyEndOfRoundStatus(combatA);
    assert.ok(poisonLog);
    assert.ok(combatA.hp < hpBeforePoison);

    const normalSpeed = getEffectiveSpeed(combatB);
    combatB.status = 'PARALYZE';
    assert.ok(getEffectiveSpeed(combatB) < normalSpeed);

    // Challengers roster validity
    assert.equal(CHALLENGER_ROSTER.length, 12);
    for (const challenger of CHALLENGER_ROSTER) {
      assert.ok(defaultCreatureCatalog.getById(challenger.speciesId), `Missing challenger ${challenger.speciesId}`);
    }

    // 5. Inspector stats, 2 starter skills & defensive type matchups (with 0x immunities)
    const computedBlastoise = computeComputedStats(blastoise, ivs, 50, false);
    assert.ok(computedBlastoise.combatPower > 0);
    assert.equal(computedBlastoise.starterMoves[0].type, 'Water');
    assert.notEqual(computedBlastoise.starterMoves[1].type, 'Water');

    const secHit = executeMove(combatA, combatB, 1, true, () => 0.5);
    assert.equal(secHit.hit, true);
    assert.ok(secHit.damageDealt > 0);

    const charMatchup = analyzeDefensiveMatchups(['Fire', 'Flying']);
    const rockWeak = charMatchup.weaknesses.find((w) => w.type === 'Rock');
    const grassResist = charMatchup.resistances.find((r) => r.type === 'Grass');
    const groundImmune = charMatchup.immunities.find((im) => im.type === 'Ground');
    assert.equal(rockWeak?.mult, 4);
    assert.equal(grassResist?.mult, 0.25);
    assert.equal(groundImmune?.mult, 0);

    // 6. Captcha threshold range [80..100]
    for (let i = 0; i < 30; i += 1) {
      const th = rollNextCaptchaThreshold();
      assert.ok(th >= 80 && th <= 100);
    }

    // 7. Box command parser & multi-mode sorting (default rarity)
    assert.deepEqual(parseBoxCommandArgs([]), { page: 1, sort: 'rarity', filter: '' });
    assert.deepEqual(parseBoxCommandArgs(['iv', '2']), { page: 2, sort: 'iv', filter: '' });
    assert.deepEqual(parseBoxCommandArgs(['3', 'lv', 'fire']), {
      page: 3,
      sort: 'level',
      filter: 'fire',
    });
    assert.deepEqual(parseBoxCommandArgs(['shiny', 'cp']), {
      page: 1,
      sort: 'cp',
      filter: 'shiny',
    });
    assert.deepEqual(parseBoxCommandArgs(['#25']), {
      page: 1,
      sort: 'rarity',
      filter: '#25',
    });

    const sampleBox: SortableBoxCreature[] = [
      {
        id: 'c1',
        speciesId: 16,
        speciesName: 'Pidgey',
        rarity: 'common',
        isShiny: false,
        ivTotal: 150,
        level: 5,
        caughtAt: new Date(1000),
      },
      {
        id: 'c2',
        speciesId: 150,
        speciesName: 'Mewtwo',
        rarity: 'legendary',
        isShiny: false,
        ivTotal: 110,
        level: 30,
        caughtAt: new Date(2000),
      },
      {
        id: 'c3',
        speciesId: 25,
        speciesName: 'Pikachu',
        rarity: 'common',
        isShiny: true,
        ivTotal: 120,
        level: 18,
        caughtAt: new Date(3000),
      },
      {
        id: 'c4',
        speciesId: 10001,
        speciesName: 'Venusaur-Mega',
        rarity: 'mega',
        isShiny: false,
        ivTotal: 140,
        level: 45,
        caughtAt: new Date(4000),
      },
      {
        id: 'c5',
        speciesId: 6,
        speciesName: 'Charizard',
        rarity: 'rare',
        isShiny: false,
        ivTotal: 170,
        level: 40,
        caughtAt: new Date(5000),
      },
    ];

    const byRarity = sortBoxCreatures(sampleBox, 'rarity').map((c) => c.id);
    assert.deepEqual(byRarity, ['c4', 'c3', 'c2', 'c5', 'c1']);

    const byIv = sortBoxCreatures(sampleBox, 'iv').map((c) => c.id);
    assert.deepEqual(byIv, ['c5', 'c1', 'c4', 'c3', 'c2']);

    const byDex = sortBoxCreatures(sampleBox, 'dex').map((c) => c.id);
    assert.deepEqual(byDex, ['c4', 'c5', 'c1', 'c3', 'c2']);

    const byName = sortBoxCreatures(sampleBox, 'name').map((c) => c.id);
    assert.deepEqual(byName, ['c5', 'c2', 'c1', 'c3', 'c4']);
  });
});
