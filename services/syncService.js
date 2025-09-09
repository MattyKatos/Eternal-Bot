const LodestoneScraper = require('../scrapers/lodestone');
const database = require('../database/database');
const logger = require('../utils/logger');

class SyncService {
  constructor(client) {
    this.client = client;
    this.scraper = new LodestoneScraper();
    this.syncInterval = null;
  }

  start() {
    // Run initial sync after 30 seconds
    setTimeout(() => {
      this.performSync();
    }, 30000);

    // Set up 30-minute interval
    this.syncInterval = setInterval(() => {
      this.performSync();
    }, 30 * 60 * 1000); // 30 minutes

    logger.info('Sync service started - will sync every 30 minutes');
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('Sync service stopped');
    }
  }

  async performSync() {
    try {
      logger.info('Starting FC member sync...');
      
      // Get current FC members from Lodestone
      const currentMembers = await this.scraper.scrapeFCMembers();
      const currentUsernames = currentMembers.map(m => m.username);
      
      // Process each current member
      for (const member of currentMembers) {
        await this.processMember(member);
      }

      // Check for members who left the FC
      if (currentUsernames.length > 0) {
        const departedMembers = await database.getMembersNotInList(currentUsernames);
        for (const departedMember of departedMembers) {
          await this.processDepartedMember(departedMember);
        }
      }

      logger.info(`Sync completed - processed ${currentMembers.length} members`);
      
    } catch (error) {
      logger.error('Error during sync:', error);
      await this.logToChannel('❌ **Sync Error**\nFailed to sync FC members: ' + error.message);
    }
  }

  async processMember(member) {
    try {
      // Get existing member data
      const existingMember = await database.getMember(member.username);
      
      if (existingMember) {
        // Check for rank changes
        if (existingMember.user_rank !== member.rank) {
          await this.processRankChange(existingMember, member.rank);
        }
        
        // Update member data (but preserve user_level and discord_id)
        await database.updateMemberRank(member.username, member.rank);
      } else {
        // New member joined
        await database.upsertMember(member.username, member.level, member.rank);
        await this.logToChannel(`🆕 **New Member Joined**\n**${member.username}** joined as ${member.rank}`);
      }
      
    } catch (error) {
      logger.error(`Error processing member ${member.username}:`, error);
    }
  }

  async processRankChange(existingMember, newRank) {
    try {
      const oldRank = existingMember.user_rank;
      
      // Log rank change
      await this.logToChannel(
        `📈 **Rank Change**\n**${existingMember.username}** promoted from ${oldRank} to ${newRank}`
      );

      // Handle Discord role changes if member is linked
      if (existingMember.discord_id) {
        await this.updateDiscordRoles(existingMember.discord_id, oldRank, newRank);
      }
      
    } catch (error) {
      logger.error(`Error processing rank change for ${existingMember.username}:`, error);
    }
  }

  async processDepartedMember(departedMember) {
    try {
      // Log departure
      await this.logToChannel(
        `👋 **Member Left FC**\n**${departedMember.username}** (${departedMember.user_rank}) is no longer in the FC`
      );

      // Remove FC roles if member is linked
      if (departedMember.discord_id && departedMember.user_rank) {
        await this.removeDiscordRole(departedMember.discord_id, departedMember.user_rank);
      }

      // Remove member from database
      await database.removeMember(departedMember.username);
      
    } catch (error) {
      logger.error(`Error processing departed member ${departedMember.username}:`, error);
    }
  }

  async updateDiscordRoles(discordId, oldRank, newRank) {
    try {
      const guild = this.client.guilds.cache.first();
      if (!guild) return;

      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) return;

      // Remove old rank role
      if (oldRank) {
        await this.removeDiscordRole(discordId, oldRank);
      }

      // Add new rank role
      await this.addDiscordRole(discordId, newRank);
      
    } catch (error) {
      logger.error(`Error updating Discord roles for ${discordId}:`, error);
    }
  }

  async addDiscordRole(discordId, fcRank) {
    try {
      const rankRole = await database.getRankRole(fcRank);
      if (!rankRole) return;

      const guild = this.client.guilds.cache.first();
      if (!guild) return;

      const member = await guild.members.fetch(discordId).catch(() => null);
      const role = await guild.roles.fetch(rankRole.disc_role).catch(() => null);

      if (member && role && !member.roles.cache.has(role.id)) {
        await member.roles.add(role);
        logger.info(`Added role ${role.name} to ${member.user.tag}`);
      }
      
    } catch (error) {
      logger.error(`Error adding Discord role for ${discordId}:`, error);
    }
  }

  async removeDiscordRole(discordId, fcRank) {
    try {
      const rankRole = await database.getRankRole(fcRank);
      if (!rankRole) return;

      const guild = this.client.guilds.cache.first();
      if (!guild) return;

      const member = await guild.members.fetch(discordId).catch(() => null);
      const role = await guild.roles.fetch(rankRole.disc_role).catch(() => null);

      if (member && role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        logger.info(`Removed role ${role.name} from ${member.user.tag}`);
      }
      
    } catch (error) {
      logger.error(`Error removing Discord role for ${discordId}:`, error);
    }
  }

  async logToChannel(message) {
    try {
      const loggingChannel = await database.getChannel('logging');
      if (!loggingChannel) return;

      const guild = this.client.guilds.cache.first();
      if (!guild) return;

      const channel = await guild.channels.fetch(loggingChannel.disc_channel).catch(() => null);
      if (channel && channel.isTextBased()) {
        await channel.send(message);
      }
      
    } catch (error) {
      logger.error('Error logging to channel:', error);
    }
  }
}

module.exports = SyncService;
