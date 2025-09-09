# Eternal Bot

A Discord bot for FFXIV Free Company management that scrapes member data from the Lodestone and provides administrative tools.

## Features

- **Lodestone Scraping**: Automatically scrape FC member data from FFXIV Lodestone
- **SQLite Database**: Store member information including usernames, levels, ranks, and notes
- **Admin Commands**: Restricted commands for FC management
- **Member Tracking**: Track member changes and add administrative notes
- **Scalable Architecture**: Built to support additional commands and features

## Commands

### Admin Commands (GMDISCID or database admin users)
- `/ebscrape` - Scrape FC members from Lodestone and update database
- `/ebnote <username> [note]` - Add or update notes for FC members
- `/eblinkadmin <user> <username>` - Link any Discord user to an FC character
- `/ebunlinkadmin [user] [username]` - Unlink Discord user from FC character
- `/eblinks [filter] [page]` - Show Discord-FC character links with filtering
- `/ebpermissions <username> <level>` - Set user permission level (user/admin)

### General Commands
- `/ebmembers [page]` - List FC members from database with pagination
- `/eblink <username>` - Link your Discord account to your FC character
- `/ebunlink` - Unlink your Discord account from your FC character
- `/ebwhoami` - Show your linked FC character information

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

```sql
CREATE TABLE fc_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  discord_id TEXT UNIQUE,
  detected_date_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_level TEXT DEFAULT 'user',
  user_rank TEXT,
  user_note TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Usage

1. **Initial Setup**: Run `/ebscrape` to populate the database with current FC members
2. **View Members**: Use `/ebmembers` to see paginated member lists (👑 indicates admin users)
3. **Link Characters**: Users can link themselves with `/eblink <username>`
4. **Manage Permissions**: Use `/ebpermissions <username> <level>` to grant admin access
5. **Add Notes**: Use `/ebnote <username> <note>` to add administrative notes
6. **Regular Updates**: Run `/ebscrape` periodically to keep member data current

## Permission System

- **Global Admin**: User specified in `GMDISCID` has full access to all commands
- **Database Admins**: FC members with `user_level` set to 'admin' can use admin commands
- **Regular Users**: Default permission level, can use general commands only
- **Permission Management**: Use `/ebpermissions` to promote users to admin or demote to user

## Permissions

- **Admin Commands**: Global admin (`GMDISCID`) and database admins (`user_level: 'admin'`) can use admin commands
- **General Commands**: All server members can use general commands like `/ebmembers`
- **Self-Service**: Users can link/unlink their own characters without admin intervention

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

## Troubleshooting

- **Commands not appearing**: Run the deploy script and wait a few minutes
- **Permission errors**: Verify `GMDISCID` matches your Discord user ID exactly
- **Scraping issues**: Check if Lodestone structure has changed or if rate limiting is occurring
- **Database errors**: Ensure the `data/` directory is writable

## Contributing

This bot is designed to be extensible. Feel free to add new commands, improve the scraper, or enhance the database schema for your FC's needs.
