# Eternal Bot

A Discord bot for FFXIV Free Company management that scrapes member data from the Lodestone, provides an admin dashboard, user self-service profile, daily Firebrands claims, and a Deathroll mini-game.

## Features

- **Lodestone Scraping**: Automatically scrape FC member data from FFXIV Lodestone
- **SQLite Database**: Store member information including usernames, levels, ranks, notes, and Firebrands
- **Admin Dashboard**: `/ebadmin` dashboard with member listing, edit controls, and pagination
- **Member Tracking**: Track member changes and add administrative notes
- **User Profile**: `/eb` shows your linked FC profile and lets you claim Daily Firebrands or unlink
- **Daily Firebrands**: Users can claim 100 Firebrands once per day
- **Deathroll Game**: `/ebdeathroll` lets members wager Firebrands in a public, button-driven game
- **Scalable Architecture**: Built to support additional commands and features

## Commands

### Admin
- `/ebadmin` — Admin dashboard with:
  - Scrape Now
  - Members list pagination and formatting
  - Edit Member dialog with actions: Link/Unlink Discord, Make/Remove Admin, Edit Note, Give/Remove Firebrands

### General
- `/eb` — View your Eternal Bot profile (Rank, Level, Discord, Firebrands, Added)
  - Buttons: Unlink Discord, Daily Firebrands (claim once per 24 hours)
- `/ebdeathroll <bet>` — Create a Deathroll wager for the specified Firebrands amount
  - Public message with Accept/Cancel
  - After acceptance, game proceeds with a 🎲 Roll button and alternates turns
  - Rolling 0 loses and the other player wins (winner receives 2× bet)

## Setup

### Prerequisites
- Node.js 16.9.0 or higher
- A Discord application and bot token
- Your FC ID from Lodestone URL

### Installation

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   GUILD_ID=your_guild_id_here (optional, for faster command deployment)
   FCID=9231394073691181144
   GMDISCID=your_admin_discord_user_id_here
   DB_PATH=./data/eternal_bot.db
   LOG_LEVEL=info
   ```

3. **Get your FC ID**:
   - Visit your FC page on Lodestone: `https://na.finalfantasyxiv.com/lodestone/freecompany/YOUR_FC_ID/member/`
   - Copy the number from the URL (e.g., `9231394073691181144`)

4. **Get your Discord User ID**:
   - Enable Developer Mode in Discord
   - Right-click your username and select "Copy User ID"

5. **Deploy slash commands**:
   ```bash
   # Add CLIENT_ID to your .env file first
   CLIENT_ID=your_bot_application_id_here
   
   node scripts/deploy-commands.js
   ```

6. **Start the bot**:
   ```bash
   npm start
   # or for development with auto-restart:
   npm run dev
   ```

## Project Structure

```
eternal-bot/
├── bot/
│   └── bot.js              # Main bot client and command handler
├── commands/
│   ├── ebscrape.js         # Admin: Scrape FC members
│   ├── ebmembers.js        # List FC members
│   ├── ebnote.js           # Admin: Add member notes
│   ├── eblink.js           # Link Discord to FC character
│   ├── ebunlink.js         # Unlink Discord from FC character
│   ├── eblinkadmin.js      # Admin: Link any user to character
│   ├── ebunlinkadmin.js    # Admin: Unlink any user
│   ├── eblinks.js          # Admin: View all links
│   ├── ebwhoami.js         # Show your linked character
│   └── ebpermissions.js    # Admin: Manage user permissions
├── config/
│   └── config.js           # Configuration management
├── database/
│   └── database.js         # SQLite database operations
├── scrapers/
│   └── lodestone.js        # Lodestone web scraper
├── scripts/
│   └── deploy-commands.js  # Deploy slash commands
├── utils/
│   └── logger.js           # Winston logging configuration
├── .env.example            # Environment variables template
├── package.json            # Dependencies and scripts
└── index.js                # Application entry point
```

## Database Schema

The bot uses SQLite with the following schema:

Core tables (simplified):

```sql
CREATE TABLE fc_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  discord_id TEXT UNIQUE,
  detected_date_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_level TEXT DEFAULT 'user',
  user_rank TEXT,
  user_note TEXT,
  points INTEGER DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE point_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL,
  claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gamba (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  user TEXT NOT NULL,
  challenger TEXT,
  bet INTEGER NOT NULL,
  turn TEXT,
  status INTEGER,
  winner TEXT
);
```

## Usage

1. **Admin Dashboard**: Use `/ebadmin` for scraping, viewing members, and editing profiles.
2. **User Profile**: Users run `/eb` to see their profile and claim Daily Firebrands.
   - If unlinked, users are prompted to ping `<@&1313525202239619103>` to get linked.
3. **Deathroll**: Start a game with `/ebdeathroll <bet>`, accept with the button, and take turns rolling.
4. **Regular Sync**: The sync service runs automatically every 30 minutes and can be triggered from `/ebadmin`.

## Permission System

- **Global Admin**: User specified in `GMDISCID` has full access to admin dashboard actions
- **Database Admins**: FC members with `user_level = 'admin'` can use admin dashboard actions
- **Regular Users**: Can use `/eb` and `/ebdeathroll`
- **Self-Service**: Users can unlink themselves; only admins can link users

## Permissions

- **Admin Actions**: Global admin (`GMDISCID`) and database admins (`user_level: 'admin'`) can use admin actions in `/ebadmin`
- **General Commands**: All server members can use `/eb` and `/ebdeathroll`
- **Self-Service**: Users can unlink their own characters. Linking is admin-only.

## Logging

Logs are stored in the `logs/` directory:
- `error.log` - Error messages only
- `combined.log` - All log messages
- Console output with colored formatting

## Adding New Commands

1. Create a new file in `commands/` directory
2. Follow the existing command structure:
   ```javascript
   const { SlashCommandBuilder } = require('discord.js');
   
   module.exports = {
     data: new SlashCommandBuilder()
       .setName('commandname')
       .setDescription('Command description'),
     adminOnly: false, // Set to true for admin-only commands
     async execute(interaction) {
       // Command logic here
     }
   };
   ```
3. Restart the bot to load the new command
4. Run `node scripts/deploy-commands.js` to register with Discord
   - The deploy script fully replaces registered commands with those in `commands/`

## Troubleshooting

- **Commands not appearing**: Run the deploy script and wait a few minutes
- **Permission errors**: Verify `GMDISCID` matches your Discord user ID exactly
- **Scraping issues**: Check if Lodestone structure has changed or if rate limiting is occurring
- **Database errors**: Ensure the `data/` directory is writable

## Contributing

This bot is designed to be extensible. Feel free to add new commands, improve the scraper, or enhance the database schema for your FC's needs.
