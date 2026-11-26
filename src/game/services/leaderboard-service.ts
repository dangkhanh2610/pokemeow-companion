import type { Prisma } from '@prisma/client';
import { getPrismaClient } from '@/lib/prisma';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import type {
  BallId,
  CommunityCatchFeedItem,
  CommunityOverview,
  LeaderboardEntry,
  LeaderboardMetric,
  RarityTier,
} from '../types';
import { isBallId } from './trainer-service';

function isRarityTier(value: string): value is RarityTier {
  return (
    value === 'common' ||
    value === 'uncommon' ||
    value === 'rare' ||
    value === 'super_rare' ||
    value === 'legendary'
  );
}

function getOrderByForMetric(
  metric: LeaderboardMetric,
): Prisma.TrainerOrderByWithRelationInput[] {
  switch (metric) {
    case 'coins':
      return [{ coins: 'desc' }, { totalCatches: 'desc' }];
    case 'shinies':
      return [{ shinyCatches: 'desc' }, { totalCatches: 'desc' }];
    case 'level':
      return [{ level: 'desc' }, { xp: 'desc' }];
    case 'catches':
    default:
      return [{ totalCatches: 'desc' }, { level: 'desc' }];
  }
}

export class LeaderboardService {
  public async getLeaderboard(
    metric: LeaderboardMetric = 'catches',
    limit = 15,
  ): Promise<readonly LeaderboardEntry[]> {
    const prisma = getPrismaClient();
    const safeLimit = Math.min(50, Math.max(1, limit));

    const trainers = await prisma.trainer.findMany({
      orderBy: getOrderByForMetric(metric),
      take: safeLimit,
      select: {
        userId: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        level: true,
        coins: true,
        totalCatches: true,
        shinyCatches: true,
      },
    });

    return trainers.map((trainer, index) => ({
      rank: index + 1,
      userId: trainer.userId,
      username: trainer.username,
      displayName: trainer.displayName || trainer.username,
      avatarUrl: trainer.avatarUrl,
      level: trainer.level,
      coins: trainer.coins,
      totalCatches: trainer.totalCatches,
      shinyCatches: trainer.shinyCatches,
    }));
  }

  public async getCommunityOverview(): Promise<CommunityOverview> {
    const prisma = getPrismaClient();

    const [totalTrainers, aggregate, highlights] = await Promise.all([
      prisma.trainer.count(),
      prisma.trainer.aggregate({
        _sum: {
          totalCatches: true,
          shinyCatches: true,
        },
      }),
      prisma.caughtCreature.findMany({
        where: {
          released: false,
          OR: [
            { isShiny: true },
            { rarity: { in: ['rare', 'super_rare', 'legendary'] } },
          ],
        },
        orderBy: { caughtAt: 'desc' },
        take: 12,
        include: {
          trainer: {
            select: {
              displayName: true,
              username: true,
            },
          },
        },
      }),
    ]);

    const recentHighlights: CommunityCatchFeedItem[] = highlights.map((row) => {
      const species = defaultCreatureCatalog.getById(row.speciesId);
      const rarity: RarityTier = isRarityTier(row.rarity) ? row.rarity : 'rare';
      const ballUsed: BallId = isBallId(row.ballUsed) ? row.ballUsed : 'pokeball';
      const artworkUrl = row.isShiny
        ? (species?.shinyArtworkUrl ??
          `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${row.speciesId}.png`)
        : (species?.artworkUrl ??
          `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${row.speciesId}.png`);

      return {
        id: row.id,
        userId: row.userId,
        trainerName: row.trainer.displayName || row.trainer.username,
        speciesId: row.speciesId,
        speciesName: row.speciesName,
        rarity,
        isShiny: row.isShiny,
        ivPercent: row.ivPercent,
        ballUsed,
        artworkUrl,
        caughtAt: row.caughtAt.toISOString(),
      };
    });

    return {
      totalTrainers,
      totalCatches: aggregate._sum.totalCatches ?? 0,
      totalShinies: aggregate._sum.shinyCatches ?? 0,
      recentHighlights,
    };
  }
}

export const leaderboardService = new LeaderboardService();
