import { NextResponse } from 'next/server';
import { leaderboardService } from '@/game/services/leaderboard-service';
import type { LeaderboardMetric } from '@/game/types';

export const dynamic = 'force-dynamic';

function parseMetric(raw: string | null): LeaderboardMetric {
  switch (raw) {
    case 'coins':
    case 'shinies':
    case 'level':
    case 'catches':
      return raw;
    default:
      return 'catches';
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const metric = parseMetric(url.searchParams.get('metric'));

    const [overview, leaderboard] = await Promise.all([
      leaderboardService.getCommunityOverview(),
      leaderboardService.getLeaderboard(metric, 20),
    ]);

    return NextResponse.json({
      metric,
      overview,
      leaderboard,
    });
  } catch (error) {
    console.error('Lỗi tải dữ liệu leaderboard API:', error);
    return NextResponse.json(
      { error: 'Không thể kết nối cơ sở dữ liệu cộng đồng.' },
      { status: 500 },
    );
  }
}
