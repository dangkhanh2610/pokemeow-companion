import { Client, Events, GatewayIntentBits } from 'discord.js';
import { encounterService } from '@/game/services/encounter-service';
import { loadBotConfig } from './config';
import { botEmojiRegistry } from './emoji-registry';
import { BotCommandRouter } from './handlers/command-router';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function bootstrapBot(): Promise<void> {
  const config = loadBotConfig();
  await botEmojiRegistry.syncAndLoad(config.token, config.clientId);
  const router = new BotCommandRouter(config.prefix, config.botName, config.ownerIds);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  let cleanupTimer: NodeJS.Timeout | undefined;

  client.once(Events.ClientReady, (readyClient) => {
    console.log(
      `[${config.botName}] Đã kết nối Discord dưới tên ${readyClient.user.tag} (${readyClient.guilds.cache.size} servers).`,
    );
    console.log(
      `[${config.botName}] Sẵn sàng nhận Slash Commands (/), Prefix mặc định (${config.prefix}) và Mention (@${readyClient.user.username}).`,
    );

    const runCleanup = (): void => {
      void encounterService
        .cleanupStaleEncounters(24)
        .then((deleted) => {
          if (deleted > 0) {
            console.log(`[${config.botName}] Đã dọn ${deleted} phiên chạm trán cũ (> 24h).`);
          }
        })
        .catch((err: unknown) => {
          console.warn(
            `[${config.botName}] Không thể dọn phiên chạm trán cũ:`,
            err instanceof Error ? err.message : err,
          );
        });
    };

    runCleanup();
    cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await router.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await router.handleButtonInteraction(interaction);
      }
    } catch (error) {
      console.error('Lỗi xử lý Interaction:', error);
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction
            .followUp({ content: '❌ Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.', ephemeral: true })
            .catch(() => undefined);
        } else {
          await interaction
            .reply({ content: '❌ Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.', ephemeral: true })
            .catch(() => undefined);
        }
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await router.handlePrefixMessage(message);
    } catch (error) {
      console.error('Lỗi xử lý Prefix Message:', error);
      await message
        .reply('❌ Đã xảy ra lỗi khi xử lý lệnh. Vui lòng thử lại sau.')
        .catch(() => undefined);
    }
  });

  const shutdown = (signal: string): void => {
    console.log(`[${config.botName}] Nhận tín hiệu ${signal}, đang ngắt kết nối Discord...`);
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
    }
    router.dispose();
    client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await client.login(config.token);
}

bootstrapBot().catch((error: unknown) => {
  console.error('Không thể khởi động bot:', error);
  process.exit(1);
});
