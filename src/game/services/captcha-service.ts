import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { trainerService, type TrainerIdentityInput } from './trainer-service';

const CAPTCHA_MIN_THRESHOLD = 80;
const CAPTCHA_MAX_THRESHOLD = 100;
const CAPTCHA_MAX_ATTEMPTS = 3;
const CAPTCHA_PENALTY_MS = 5 * 60 * 1000;
export const CAPTCHA_CODE_LENGTH = 5;
export const CAPTCHA_REWARD_COINS = 1000;
export const CAPTCHA_REWARD_BALLS = 2;

export interface CaptchaView {
  readonly userId: string;
  readonly code: string;
  readonly question: string;
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

const NUMERIC_CODE_REGEX = new RegExp(`^\\d{${CAPTCHA_CODE_LENGTH}}$`);

export function generateCaptchaCode(): string {
  const min = 10 ** (CAPTCHA_CODE_LENGTH - 1);
  const max = 10 ** CAPTCHA_CODE_LENGTH - 1;
  return String(min + Math.floor(Math.random() * (max - min + 1)));
}

function isValidNumericCode(value: string): boolean {
  return NUMERIC_CODE_REGEX.test(value);
}

function buildCaptchaChallengeData(): {
  readonly speciesId: number;
  readonly question: string;
  readonly correctAnswer: string;
  readonly options: readonly string[];
} {
  const code = generateCaptchaCode();
  return {
    speciesId: 0,
    question: `Hệ thống chống tool tự động: Hãy nhập chính xác **${CAPTCHA_CODE_LENGTH} chữ số** hiển thị trong ảnh bên dưới để tiếp tục chơi!`,
    correctAnswer: code,
    options: [],
  };
}

function toCaptchaView(row: {
  readonly userId: string;
  readonly question: string;
  readonly correctAnswer: string;
  readonly attempts: number;
  readonly penaltyUntil: Date | null;
}): CaptchaView {
  return {
    userId: row.userId,
    code: row.correctAnswer,
    question: row.question,
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
    if (!row) {
      return null;
    }
    if (!isValidNumericCode(row.correctAnswer)) {
      const refreshed = buildCaptchaChallengeData();
      const updated = await withDbRetry(() =>
        prisma.captchaChallenge.update({
          where: { userId },
          data: {
            speciesId: refreshed.speciesId,
            question: refreshed.question,
            correctAnswer: refreshed.correctAnswer,
            optionsJson: [],
            attempts: 0,
            penaltyUntil: null,
          },
        }),
      );
      return toCaptchaView(updated);
    }
    return toCaptchaView(row);
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
      if (!isValidNumericCode(existing.correctAnswer)) {
        const refreshed = buildCaptchaChallengeData();
        const updated = await withDbRetry(() =>
          prisma.captchaChallenge.update({
            where: { userId },
            data: {
              speciesId: refreshed.speciesId,
              question: refreshed.question,
              correctAnswer: refreshed.correctAnswer,
              optionsJson: [],
              attempts: 0,
              penaltyUntil: null,
            },
          }),
        );
        return toCaptchaView(updated);
      }
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

        const normalized = trimmed.replace(/\s+/g, '');
        const isCorrect =
          isValidNumericCode(challenge.correctAnswer) &&
          normalized.length === CAPTCHA_CODE_LENGTH &&
          normalized === challenge.correctAnswer;

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
            mode: 'numeric',
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
