import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import { trainerService, type TrainerIdentityInput } from './trainer-service';

const CAPTCHA_MIN_THRESHOLD = 80;
const CAPTCHA_MAX_THRESHOLD = 100;
const CAPTCHA_MAX_ATTEMPTS = 3;
const CAPTCHA_PENALTY_MS = 5 * 60 * 1000;
const CAPTCHA_REWARD_COINS = 300;
const CAPTCHA_REWARD_BALLS = 1;

export interface CaptchaView {
  readonly userId: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly spriteUrl: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly attempts: number;
  readonly lockedUntil: Date | null;
}

export type VerifyCaptchaOutcome =
  | {
      readonly ok: true;
      readonly correct: true;
      readonly rewardCoins: number;
      readonly rewardPokeballs: number;
      readonly newCoinsBalance: number;
      readonly nextVerifyThreshold: number;
    }
  | {
      readonly ok: true;
      readonly correct: false;
      readonly remainingAttempts: number;
      readonly penaltyUntil: Date | null;
      readonly updatedChallenge: CaptchaView;
    }
  | {
      readonly ok: false;
      readonly reason: 'NO_ACTIVE_CAPTCHA' | 'PENALTY_LOCKED';
      readonly message: string;
      readonly penaltyUntil?: Date;
    };

function parseOptionsJson(value: Prisma.JsonValue): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function buildCaptchaChallengeData(): {
  readonly speciesId: number;
  readonly speciesName: string;
  readonly question: string;
  readonly correctAnswer: string;
  readonly options: readonly string[];
} {
  const basePool = defaultCreatureCatalog.getAll().filter((s) => s.formType === 'base');
  const target = basePool[Math.floor(Math.random() * basePool.length)] ?? basePool[0];
  if (!target) {
    throw new Error('Không tìm thấy dữ liệu Pokémon cho hệ thống Captcha.');
  }

  const decoys = new Set<string>();
  let guard = 0;
  while (decoys.size < 3 && guard < 100) {
    guard += 1;
    const candidate = basePool[Math.floor(Math.random() * basePool.length)];
    if (candidate && candidate.id !== target.id && candidate.name !== target.name) {
      decoys.add(candidate.name);
    }
  }

  const options = [target.name, ...decoys];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = options[i]!;
    options[i] = options[j]!;
    options[j] = tmp;
  }

  return {
    speciesId: target.id,
    speciesName: target.name,
    question: 'Hệ thống chống tool tự động: Hãy chọn đúng tên Pokémon bên dưới để tiếp tục chơi!',
    correctAnswer: target.name,
    options,
  };
}

function toCaptchaView(row: {
  readonly userId: string;
  readonly speciesId: number;
  readonly question: string;
  readonly correctAnswer: string;
  readonly optionsJson: Prisma.JsonValue;
  readonly attempts: number;
  readonly penaltyUntil: Date | null;
}): CaptchaView {
  const species = defaultCreatureCatalog.getById(row.speciesId);
  return {
    userId: row.userId,
    speciesId: row.speciesId,
    speciesName: row.correctAnswer,
    spriteUrl: species?.artworkUrl ?? '',
    question: row.question,
    options: parseOptionsJson(row.optionsJson),
    attempts: row.attempts,
    lockedUntil: row.penaltyUntil,
  };
}

export function rollNextCaptchaThreshold(): number {
  const span = CAPTCHA_MAX_THRESHOLD - CAPTCHA_MIN_THRESHOLD + 1;
  return CAPTCHA_MIN_THRESHOLD + Math.floor(Math.random() * span);
}

export class CaptchaService {
  public async getActiveChallenge(userId: string): Promise<CaptchaView | null> {
    const prisma = getPrismaClient();
    const row = await withDbRetry(() =>
      prisma.captchaChallenge.findUnique({ where: { userId } }),
    );
    return row ? toCaptchaView(row) : null;
  }

  public async checkSpawnGate(userId: string): Promise<CaptchaView | null> {
    const prisma = getPrismaClient();
    const [trainer, existing] = await withDbRetry(() =>
      Promise.all([
        prisma.trainer.findUnique({
          where: { userId },
          select: { actionsSinceVerify: true, nextVerifyThreshold: true },
        }),
        prisma.captchaChallenge.findUnique({ where: { userId } }),
      ]),
    );

    if (existing) {
      return toCaptchaView(existing);
    }

    if (!trainer || trainer.actionsSinceVerify < trainer.nextVerifyThreshold) {
      return null;
    }

    const payload = buildCaptchaChallengeData();
    const created = await withDbRetry(() =>
      prisma.captchaChallenge.upsert({
        where: { userId },
        update: {
          speciesId: payload.speciesId,
          question: payload.question,
          correctAnswer: payload.correctAnswer,
          optionsJson: [...payload.options],
          attempts: 0,
          penaltyUntil: null,
        },
        create: {
          userId,
          speciesId: payload.speciesId,
          question: payload.question,
          correctAnswer: payload.correctAnswer,
          optionsJson: [...payload.options],
        },
      }),
    );

    return toCaptchaView(created);
  }

  public async verifyChallenge(
    userMeta: TrainerIdentityInput,
    rawAnswer: string,
    idempotencyKey: string,
  ): Promise<VerifyCaptchaOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const prisma = getPrismaClient();
    const trimmed = rawAnswer.trim();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingTx = await tx.economyTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (existingTx) {
          const trainer = await tx.trainer.findUniqueOrThrow({
            where: { userId: userMeta.userId },
          });
          return {
            ok: true,
            correct: true,
            rewardCoins: CAPTCHA_REWARD_COINS,
            rewardPokeballs: CAPTCHA_REWARD_BALLS,
            newCoinsBalance: trainer.coins,
            nextVerifyThreshold: trainer.nextVerifyThreshold,
          };
        }

        const challenge = await tx.captchaChallenge.findUnique({
          where: { userId: userMeta.userId },
        });

        if (!challenge) {
          return {
            ok: false,
            reason: 'NO_ACTIVE_CAPTCHA',
            message: 'Bạn hiện không có yêu cầu xác minh nào. Cứ tiếp tục bắt Pokémon bình thường nhé!',
          };
        }

        const now = new Date();
        if (challenge.penaltyUntil && challenge.penaltyUntil > now) {
          const sec = Math.ceil((challenge.penaltyUntil.getTime() - now.getTime()) / 1000);
          return {
            ok: false,
            reason: 'PENALTY_LOCKED',
            penaltyUntil: challenge.penaltyUntil,
            message: `Bạn đã nhập sai 3 lần nên bị tạm khóa xác minh trong **${sec} giây** nữa.`,
          };
        }

        const options = parseOptionsJson(challenge.optionsJson);
        let chosen = trimmed;
        if (/^[0-3]$/.test(trimmed)) {
          const idx = Number.parseInt(trimmed, 10);
          chosen = options[idx] ?? trimmed;
        }

        const isCorrect =
          chosen.length > 0 &&
          chosen.toLowerCase() === challenge.correctAnswer.toLowerCase();

        if (isCorrect) {
          const nextThreshold = rollNextCaptchaThreshold();
          await tx.captchaChallenge.delete({ where: { userId: userMeta.userId } });

          const updatedTrainer = await tx.trainer.update({
            where: { userId: userMeta.userId },
            data: {
              actionsSinceVerify: 0,
              nextVerifyThreshold: nextThreshold,
              coins: { increment: CAPTCHA_REWARD_COINS },
            },
          });

          await tx.inventoryItem.upsert({
            where: {
              userId_itemId: { userId: userMeta.userId, itemId: 'pokeball' },
            },
            update: { quantity: { increment: CAPTCHA_REWARD_BALLS } },
            create: {
              userId: userMeta.userId,
              itemId: 'pokeball',
              quantity: CAPTCHA_REWARD_BALLS,
            },
          });

          const meta: Prisma.InputJsonObject = {
            speciesId: challenge.speciesId,
            pokeball: CAPTCHA_REWARD_BALLS,
          };

          await tx.economyTransaction.create({
            data: {
              idempotencyKey,
              userId: userMeta.userId,
              type: 'CAPTCHA_REWARD',
              coinsDelta: CAPTCHA_REWARD_COINS,
              metadata: meta,
            },
          });

          return {
            ok: true,
            correct: true,
            rewardCoins: CAPTCHA_REWARD_COINS,
            rewardPokeballs: CAPTCHA_REWARD_BALLS,
            newCoinsBalance: updatedTrainer.coins,
            nextVerifyThreshold: nextThreshold,
          };
        }

        const nextAttempts = challenge.attempts + 1;
        if (nextAttempts >= CAPTCHA_MAX_ATTEMPTS) {
          const penaltyUntil = new Date(now.getTime() + CAPTCHA_PENALTY_MS);
          const refreshed = buildCaptchaChallengeData();
          const updated = await tx.captchaChallenge.update({
            where: { userId: userMeta.userId },
            data: {
              speciesId: refreshed.speciesId,
              question: refreshed.question,
              correctAnswer: refreshed.correctAnswer,
              optionsJson: [...refreshed.options],
              attempts: 0,
              penaltyUntil,
            },
          });

          return {
            ok: true,
            correct: false,
            remainingAttempts: 0,
            penaltyUntil,
            updatedChallenge: toCaptchaView(updated),
          };
        }

        const updated = await tx.captchaChallenge.update({
          where: { userId: userMeta.userId },
          data: { attempts: nextAttempts },
        });

        return {
          ok: true,
          correct: false,
          remainingAttempts: CAPTCHA_MAX_ATTEMPTS - nextAttempts,
          penaltyUntil: null,
          updatedChallenge: toCaptchaView(updated),
        };
      }),
    );
  }
}

export const captchaService = new CaptchaService();
