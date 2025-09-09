const EternalBot = require('./bot/bot');
const database = require('./database/database');
const logger = require('./utils/logger');
const fs = require('fs');

// Ensure logs directory exists
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

const bot = new EternalBot();

// Graceful shutdown handling
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await bot.stop();
  database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await bot.stop();
  database.close();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the bot
bot.start().catch((error) => {
  logger.error('Failed to start bot:', error);
  process.exit(1);
});
