import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseManualCommandTrigger,
  parsePokemeowCaptchaAlert,
  parsePokemeowCatchOutcome,
  parsePokemeowCatchbotTimer,
  parsePokemeowCooldownWait,
  parsePokemeowEncounter,
  parsePokemeowQuests,
  parsePokemeowSeaFlute,
} from '../parsers/pokemeow-embed-parser';
import { isLegacyCorruptedLog } from '../store/bot-store';

describe('parsePokemeowEncounter & Multi-Player Trainer Extraction', () => {
  it('parses wild spawn rarities, emoji-prefixed names, and trainer display name', () => {
    const gen6Spawn = parsePokemeowEncounter({
      content: '',
      embedAuthor: 'Lil D found a wild <:froakie:11223344> **Froakie**!',
      embedTitle: '',
      embedDescription: '<:uncommon:9988776655> <:froakie:11223344> **Froakie**',
      embedFooter: 'Pokéballs: 15 | Greatballs: 8',
      componentsText: '[{"custom_id":"pb"},{"custom_id":"gb"}]',
      interactionCommandName: 'pokemon',
    });
    assert.equal(gen6Spawn?.source, 'wild');
    assert.equal(gen6Spawn?.rarityId, 'uncommon');
    assert.equal(gen6Spawn?.pokemonName, 'Froakie');
    assert.equal(gen6Spawn?.trainerName, 'Lil D');
  });

  it('strictly ignores CAPTCHA prompts in encounter parser while flagging parsePokemeowCaptchaAlert', () => {
    const input = {
      content: 'Please verify you are human! Solve the captcha to continue.',
      embedTitle: 'Anti-bot Verification',
      embedDescription: 'Rarity: Legendary',
      embedFooter: '',
    };
    assert.equal(parsePokemeowEncounter(input), null);
    assert.equal(parsePokemeowCaptchaAlert(input), true);
  });
});

describe('parsePokemeowCatchOutcome (Buddy & Multi-line Ball Safety)', () => {
  it('ignores Buddy EXP lines ("Your Virizion gained 50 EXP") and detects Greatball on line 2', () => {
    const outcome = parsePokemeowCatchOutcome(
      {
        content: '',
        embedAuthor: 'dangsimp found a wild Dragonair!',
        embedTitle: '',
        embedDescription:
          'Wild <:dragonair:111> **Dragonair** appeared!\nYou caught a <:dragonair:111> **Dragonair** with a <:gb:222>!\nYour buddy <:virizion:333> **Virizion** gained 85 EXP!\nYou earned 1,246 PokeCoins!',
        embedFooter: 'Pokeballs: 30 | Greatballs: 10 | Masterballs: 1',
      },
      { source: 'wild', rarityId: 'rare', pokemonName: 'Dragonair' },
    );

    assert.notEqual(outcome, null);
    assert.equal(outcome?.caught, true);
    assert.equal(outcome?.ballId, 'gb');
    assert.equal(outcome?.pokemonName, 'Dragonair');
    assert.equal(outcome?.trainerName, 'dangsimp');
    assert.equal(outcome?.coinsEarnedOverride, 1246);
  });

  it('identifies legacy corrupted logs (-100k MB / "wild") without touching valid catches', () => {
    assert.equal(
      isLegacyCorruptedLog({
        id: 'old-1',
        timestamp: 1000,
        source: 'wild',
        rarityId: 'uncommon',
        ballId: 'mb',
        caught: false,
        pokemonName: 'wild',
        ballCost: 100000,
        coinsEarned: 0,
        netProfit: -100000,
      }),
      true,
    );

    assert.equal(
      isLegacyCorruptedLog({
        id: 'valid-1',
        timestamp: 2000,
        source: 'wild',
        rarityId: 'uncommon',
        ballId: 'pb',
        caught: true,
        pokemonName: 'Togedemaru',
        ballCost: 200,
        coinsEarned: 541,
        netProfit: 341,
      }),
      false,
    );
  });
});

describe('Cooldown, CatchBot, Sea Flute & Quest Parsers', () => {
  it('parses exact remaining fishing cooldown ("Please wait ⏱️ 8 seconds before fishing again!")', () => {
    const wait = parsePokemeowCooldownWait({
      content: 'Please wait ⏱️ 8 seconds before fishing again!',
      embedTitle: '',
      embedDescription: '',
      embedFooter: '',
    });
    assert.deepEqual(wait, { source: 'fishing', waitSeconds: 8 });
  });

  it('parses CatchBot (;cb) and Sea Flute (;seaflute) Golden Hour timers', () => {
    const cb = parsePokemeowCatchbotTimer({
      content: '',
      embedTitle: "Lil D's Catchbot",
      embedDescription: 'Returns in: **2h 35m**',
      embedFooter: '',
    });
    assert.deepEqual(cb, { remainingSeconds: 2 * 3600 + 35 * 60 });

    const gh = parsePokemeowSeaFlute({
      content: '',
      embedTitle: 'Sea Flute',
      embedDescription: 'The next Golden Fishing Hour begins in **1h 20m**!',
      embedFooter: '',
    });
    assert.deepEqual(gh, { startsInSeconds: 1 * 3600 + 20 * 60 });
  });

  it('parses Daily Quests (;q) into structured progress items', () => {
    const quests = parsePokemeowQuests({
      content: '',
      embedTitle: "Lil D's Daily Quests",
      embedDescription:
        '1. Catch 50 Pokemon (12/50)\n2. Catch 15 Uncommon Pokemon (4/15)\n3. Fish 10 Pokemon (2/10)',
      embedFooter: '',
    });

    assert.notEqual(quests, null);
    assert.equal(quests?.length, 3);
    assert.equal(quests?.[0]?.kind, 'any_catch');
    assert.equal(quests?.[0]?.current, 12);
    assert.equal(quests?.[0]?.goal, 50);
    assert.equal(quests?.[1]?.kind, 'rarity');
    assert.equal(quests?.[1]?.rarityFilter, 'uncommon');
    assert.equal(quests?.[2]?.kind, 'fishing');
  });

  it('detects manual ;p and ;f triggers', () => {
    assert.equal(parseManualCommandTrigger(';p'), 'wild');
    assert.equal(parseManualCommandTrigger(';f'), 'fishing');
    assert.equal(parseManualCommandTrigger(';profile'), null);
  });
});
