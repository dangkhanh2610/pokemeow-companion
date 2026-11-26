import { loadBotConfig } from '../config';
import { botEmojiRegistry } from '../emoji-registry';

async function main(): Promise<void> {
  const config = loadBotConfig();
  console.log(`Đang đồng bộ Poké Ball Application Emojis lên Discord cho ${config.botName}...`);
  await botEmojiRegistry.syncAndLoad(config.token, config.clientId);
  console.log('Hoàn tất đồng bộ Application Emojis.');
}

main().catch((err: unknown) => {
  console.error('Lỗi đồng bộ Application Emojis:', err);
  process.exit(1);
});
