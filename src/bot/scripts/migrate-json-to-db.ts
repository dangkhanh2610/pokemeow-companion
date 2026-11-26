import 'dotenv/config';
import { BotStore } from '../store/bot-store';
import { PrismaBotStore } from '../store/prisma-bot-store';
import { isDatabaseConfigured } from '../store/store-factory';

async function migrateJsonToPostgres(): Promise<void> {
  if (!isDatabaseConfigured()) {
    throw new Error(
      'Chưa cấu hình DATABASE_URL hợp lệ trong file .env (hãy lấy connection string PostgreSQL miễn phí từ Neon hoặc Supabase).',
    );
  }

  const jsonStore = new BotStore();
  const dbStore = new PrismaBotStore();

  const users = jsonStore.getAllUsersSnapshot();
  const channels = jsonStore.getAllChannelsSnapshot();
  const goldenHour = jsonStore.getGoldenHourSchedule();
  const hallOfFame = jsonStore.getHallOfFame();

  let userCount = 0;
  let logCount = 0;

  for (const [userId, profile] of Object.entries(users)) {
    await dbStore.updateUserIdentity(userId, profile.displayName, profile.avatarUrl);
    await dbStore.updateUserBuffs(userId, profile.buffs);
    await dbStore.updateUserFishingSetup(userId, profile.fishingSetup);
    await dbStore.setUserReminders(userId, profile.remindersEnabled);
    await dbStore.setUserCatchbotSchedule(
      userId,
      profile.catchbotReturnAtMs,
      profile.catchbotChannelId,
    );
    await dbStore.setUserQuests(userId, profile.quests);

    for (const log of profile.logs) {
      await dbStore.addUserLog(userId, log);
      logCount += 1;
    }
    userCount += 1;
  }

  for (const [channelId, chSettings] of Object.entries(channels)) {
    await dbStore.setChannelSettings(channelId, chSettings);
  }

  if (goldenHour.startAtMs !== null) {
    await dbStore.setGoldenHourSchedule(goldenHour);
  }

  for (const hof of hallOfFame) {
    await dbStore.addHallOfFameEntry(hof);
  }

  console.log(
    `✅ Đã đồng bộ xong ${userCount} người chơi, ${logCount} lượt bắt, ${Object.keys(channels).length} kênh và ${hallOfFame.length} bản ghi Hall of Fame từ data/bot-state.json lên PostgreSQL!`,
  );
}

void migrateJsonToPostgres().catch((error: unknown) => {
  console.error('❌ Lỗi migrate JSON sang PostgreSQL:', error);
  process.exitCode = 1;
});
