const EternalBot = require('./bot/bot');
const database = require('./database/database');
const logger = require('./utils/logger');
const fs = require('fs');

// Polyfill web APIs for Node.js 18 environments where File/FormData may be missing
try {
  const { fetch, File, Blob, FormData } = require('undici');
  if (typeof globalThis.fetch === 'undefined') globalThis.fetch = fetch;
  if (typeof globalThis.File === 'undefined') globalThis.File = File;
  if (typeof globalThis.Blob === 'undefined') globalThis.Blob = Blob;
  if (typeof globalThis.FormData === 'undefined') globalThis.FormData = FormData;
} catch (e) {
  // If undici isn't available for some reason, continue; discord.js bundles undici but this is a safety net
}

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
