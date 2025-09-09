require('dotenv').config();

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    guildId: process.env.GUILD_ID,
    gmDiscordId: process.env.GMDISCID
  },
  ffxiv: {
    fcId: process.env.FCID
  },
  database: {
    path: process.env.DB_PATH || './data/eternal_bot.db'
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

// Validate required environment variables
const requiredVars = [
  'DISCORD_TOKEN',
  'FCID',
  'GMDISCID'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Please copy .env.example to .env and fill in the required values');
  process.exit(1);
}

module.exports = config;
