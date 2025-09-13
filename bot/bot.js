const { Client, GatewayIntentBits, Collection, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');
const database = require('../database/database');
const SyncService = require('../services/syncService');

class EternalBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
      ]
    });

    this.commands = new Collection();
    this.syncService = new SyncService(this.client);
    this.loadCommands();
    this.setupEventListeners();
  }

  loadCommands() {
    const commandsPath = path.join(__dirname, '../commands');
    
    if (!fs.existsSync(commandsPath)) {
      fs.mkdirSync(commandsPath, { recursive: true });
      return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      
      if ('data' in command && 'execute' in command) {
        this.commands.set(command.data.name, command);
        logger.info(`Loaded command: ${command.data.name}`);
      } else {
        logger.warn(`Command at ${filePath} is missing required "data" or "execute" property`);
      }
    }
  }

  setupEventListeners() {
    this.client.once('ready', () => {
      logger.info(`Bot logged in as ${this.client.user.tag}`);
      this.syncService.start();
    });

    this.client.on('interactionCreate', async (interaction) => {
      // Slash commands
      if (interaction.isChatInputCommand()) {
        const command = this.commands.get(interaction.commandName);

        if (!command) {
          logger.error(`No command matching ${interaction.commandName} was found`);
          return;
        }

        try {
          // Check if command requires admin permissions
          if (command.adminOnly) {
            const isGlobalAdmin = interaction.user.id === config.discord.gmDiscordId;
            const isDbAdmin = await database.isAdmin(interaction.user.id);
            
            if (!isGlobalAdmin && !isDbAdmin) {
              await interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
              });
              return;
            }
          }

          await command.execute(interaction);
        } catch (error) {
          logger.error(`Error executing command ${interaction.commandName}:`, error);
          
          const errorMessage = 'There was an error while executing this command!';
          
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
        return;
      }

      // Button interactions
      if (interaction.isButton()) {
        try {
          const customId = interaction.customId || '';
          // Self-service unlink path (allowed without admin if unlinking self)
          if (customId.startsWith('ebself_unlink')) {
            const parts = customId.split(':');
            const visibilityTag = parts[1] || 'epi';
            const encoded = parts[2] || '';
            const username = decodeURIComponent(encoded);
            const member = await database.getMember(username);
            if (!member || !member.discord_id || member.discord_id !== interaction.user.id) {
              await interaction.reply({ content: 'You can only unlink your own account.', ephemeral: true });
              return;
            }
            await database.unlinkDiscordId(username);
            await interaction.update({ content: '✅ Your Discord has been unlinked from your character.', embeds: [], components: [] });
            return;
          }

          if (customId.startsWith('ebself_claim')) {
            const parts = customId.split(':');
            const visibilityTag = parts[1] || 'epi';
            const encoded = parts[2] || '';
            const username = decodeURIComponent(encoded);
            const member = await database.getMember(username);
            if (!member || !member.discord_id || member.discord_id !== interaction.user.id) {
              await interaction.reply({ content: 'You can only claim Firebrands for your own linked account.', ephemeral: true });
              return;
            }

            const canClaim = await database.canClaimPoints(interaction.user.id);
            if (!canClaim) {
              await interaction.reply({ content: '⏳ You have already claimed your daily Firebrands. Please try again later.', ephemeral: true });
              return;
            }

            await database.addPoints(username, 100);
            await database.recordClaim(interaction.user.id);

            // Refresh the embed similar to /eb output (no note)
            const updated = await database.getMember(username);
            const points = typeof updated.points === 'number' ? updated.points : 0;
            const epochSeconds = updated.detected_date_time ? Math.floor(new Date(updated.detected_date_time).getTime() / 1000) : null;
            const discordText = updated.discord_id ? `<@${updated.discord_id}>` : '❌ Unlinked';

            const embed = new EmbedBuilder()
              .setTitle(`Your Profile: ${updated.username}`)
              .setColor(0x2ECC71)
              .addFields(
                { name: 'Rank', value: updated.user_rank || 'N/A', inline: true },
                { name: 'Level', value: updated.user_level || 'user', inline: true },
                { name: 'Discord', value: discordText, inline: true },
                { name: 'Firebrands', value: `${points}`, inline: true },
                { name: 'Added', value: epochSeconds ? `<t:${epochSeconds}:R>` : 'N/A', inline: true },
              )
              .setTimestamp();

            const encodedUser = encodeURIComponent(updated.username);
            const row = {
              type: 1,
              components: [
                {
                  type: 2,
                  custom_id: `ebself_unlink:${visibilityTag}:${encodedUser}`,
                  label: 'Unlink Discord',
                  style: 4,
                },
                {
                  type: 2,
                  custom_id: `ebself_claim:${visibilityTag}:${encodedUser}`,
                  label: 'Claim 100 Firebrands',
                  style: 1,
                  disabled: true,
                },
              ],
            };

            await interaction.update({ content: '🎉 You claimed 100 Firebrands!', embeds: [embed], components: [row] });
            return;
          }

          // For admin-only buttons, enforce admin. Public game buttons (ebdr_*) are allowed.
          const adminPrefixes = ['ebadmin_', 'ebmember_'];
          if (adminPrefixes.some(p => customId.startsWith(p))) {
            const isGlobalAdmin = interaction.user.id === config.discord.gmDiscordId;
            const isDbAdmin = await database.isAdmin(interaction.user.id);
            if (!isGlobalAdmin && !isDbAdmin) {
              await interaction.reply({ content: 'You do not have permission to use this action.', ephemeral: true });
              return;
            }
          }

          if (customId.startsWith('ebadmin_scrape')) {
            const parts = customId.split(':');
            const visibilityTag = parts[1] || 'epi';

            // Build disabled buttons while running
            const disabledComponents = [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: `ebadmin_scrape:${visibilityTag}`,
                    label: 'Scrape Now',
                    style: 1,
                    disabled: true,
                  },
                  {
                    type: 2,
                    custom_id: `ebadmin_members:${visibilityTag}:1`,
                    label: 'Members',
                    style: 2,
                    disabled: true,
                  },
                ],
              },
            ];

            // Acknowledge by updating the original message to show progress
            await interaction.update({
              content: '🔄 Running sync... Please wait.',
              components: disabledComponents,
              embeds: [],
            });

            await this.syncService.performSync();

            // Re-enable buttons and update the message in-place
            const enabledComponents = [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: `ebadmin_scrape:${visibilityTag}`,
                    label: 'Scrape Now',
                    style: 1,
                    disabled: false,
                  },
                  {
                    type: 2,
                    custom_id: `ebadmin_members:${visibilityTag}:1`,
                    label: 'Members',
                    style: 2,
                    disabled: false,
                  },
                ],
              },
            ];

            await interaction.editReply({
              content: '✅ Sync completed successfully.',
              components: enabledComponents,
              embeds: [],
            });
          } else if (customId.startsWith('ebadmin_members')) {
            // customId format: ebadmin_members:<visibilityTag>:<page>
            const parts = customId.split(':');
            const visibilityTag = parts[1] || 'epi';
            const page = parseInt(parts[2] || '1', 10);
            const payload = await this.buildMembersPayload(page, visibilityTag);
            // Edit the original message rather than creating a new one
            await interaction.update(payload);
          } else if (customId.startsWith('ebadmin_edit')) {
            // customId format: ebadmin_edit:<visibilityTag>
            const parts = customId.split(':');
            const visibilityTag = parts[1] || 'epi';

            const modal = new ModalBuilder()
              .setCustomId(`ebadmin_edit_modal:${visibilityTag}`)
              .setTitle('Edit Member');

            const usernameInput = new TextInputBuilder()
              .setCustomId('member_username')
              .setLabel('Enter the member\'s username')
              .setStyle(TextInputStyle.Short)
              .setMinLength(2)
              .setMaxLength(32)
              .setPlaceholder('e.g., Matty Katos')
              .setRequired(true);

            const row = new ActionRowBuilder().addComponents(usernameInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
          } else if (customId.startsWith('ebmember_link')) {
            // Show modal to input Discord ID to link
            const parts = customId.split(':');
            const visibilityTag = parts[1] || 'epi';
            const encoded = parts[2] || '';
            const username = decodeURIComponent(encoded);

            const modal = new ModalBuilder()
              .setCustomId(`ebmember_link_modal:${visibilityTag}:${encodeURIComponent(username)}`)
              .setTitle(`Link Discord → ${username}`);

            const idInput = new TextInputBuilder()
              .setCustomId('discord_id')
              .setLabel('Enter Discord ID (snowflake) or mention')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., 197518567086751744 or @User')
              .setRequired(true);

            const row = new ActionRowBuilder().addComponents(idInput);
            modal.addComponents(row);
            await interaction.showModal(modal);
          } else if (customId.startsWith('ebmember_unlink')) {
            const parts = customId.split(':');
            const visibilityTag = parts[1] || 'epi';
            const encoded = parts[2] || '';
            const username = decodeURIComponent(encoded);

            await database.unlinkDiscordId(username);
            const payload = await this.buildMemberEditPayload(username, visibilityTag);
            await interaction.update(payload);
          } else if (customId.startsWith('ebmember_makeadmin') || customId.startsWith('ebmember_removeadmin')) {
            const parts = customId.split(':');
            const visibilityTag = parts[1] || 'epi';
            const encoded = parts[2] || '';
            const username = decodeURIComponent(encoded);
            const newLevel = customId.startsWith('ebmember_makeadmin') ? 'admin' : 'user';
            await database.setUserLevel(username, newLevel);
            const payload = await this.buildMemberEditPayload(username, visibilityTag);
            await interaction.update(payload);
          } else if (customId.startsWith('ebmember_editnote')) {
            const parts = customId.split(':');
            const visibilityTag = parts[1] || 'epi';
            const encoded = parts[2] || '';
            const username = decodeURIComponent(encoded);

            const member = await database.getMember(username);
            const modal = new ModalBuilder()
              .setCustomId(`ebmember_note_modal:${visibilityTag}:${encodeURIComponent(username)}`)
              .setTitle(`Edit Note → ${username}`);

            const noteInput = new TextInputBuilder()
              .setCustomId('member_note')
              .setLabel('Note')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false);
            if (member && member.user_note) {
              noteInput.setValue(member.user_note);
            }
            const row = new ActionRowBuilder().addComponents(noteInput);
            modal.addComponents(row);
            await interaction.showModal(modal);
          } else if (customId.startsWith('ebmember_givepoints') || customId.startsWith('ebmember_removepoints')) {
            const parts = customId.split(':');
            const visibilityTag = parts[1] || 'epi';
            const encoded = parts[2] || '';
            const username = decodeURIComponent(encoded);
            const action = customId.startsWith('ebmember_givepoints') ? 'give' : 'remove';

            const modal = new ModalBuilder()
              .setCustomId(`ebmember_points_modal:${visibilityTag}:${encodeURIComponent(username)}:${action}`)
              .setTitle(`${action === 'give' ? 'Give' : 'Remove'} Points → ${username}`);

            const deltaInput = new TextInputBuilder()
              .setCustomId('points_delta')
              .setLabel('Amount')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., 1, 5, 10')
              .setRequired(true);
            const row = new ActionRowBuilder().addComponents(deltaInput);
            modal.addComponents(row);
            await interaction.showModal(modal);
          } else if (customId.startsWith('ebdr_')) {
            // Deathroll game buttons (public)
            const [action, idStr] = customId.split(':');
            const gambaId = parseInt(idStr, 10);
            const game = await database.getGambaById(gambaId);
            if (!game) {
              await interaction.reply({ content: 'This game no longer exists.', ephemeral: true });
              return;
            }

            const renderGame = async () => {
              const userMention = game.user ? `<@${game.user}>` : 'Unknown';
              const challengerMention = game.challenger ? `<@${game.challenger}>` : '—';
              const currentMax = (game.status === 0 || typeof game.status === 'number') ? game.status : (game.status ? parseInt(game.status, 10) : 1000);
              const statusText = game.winner
                ? `Winner: <@${game.winner}>`
                : (game.challenger
                    ? `Current max: ${currentMax}\nTurn: <@${game.turn}>`
                    : 'Waiting for a challenger...');

              const embed = {
                title: '💀 Deathroll',
                color: 0x8E44AD,
                description: `A deathroll has been issued by ${userMention}!`,
                fields: [
                  { name: 'Wager', value: `${game.bet} Firebrands`, inline: true },
                  { name: 'User', value: userMention, inline: true },
                  { name: 'Challenger', value: challengerMention, inline: true },
                  { name: 'Status', value: statusText, inline: false },
                ],
                timestamp: new Date().toISOString(),
              };

              let components = [];
              if (!game.challenger && !game.winner) {
                components = [
                  { type: 1, components: [
                    { type: 2, custom_id: `ebdr_accept:${gambaId}`, label: 'Accept', style: 3 },
                    { type: 2, custom_id: `ebdr_cancel:${gambaId}`, label: 'Cancel', style: 4 },
                  ]}
                ];
              } else if (!game.winner) {
                components = [
                  { type: 1, components: [
                    { type: 2, custom_id: `ebdr_roll:${gambaId}`, label: 'Roll', emoji: { name: '🎲' }, style: 1 }
                  ]}
                ];
              }
              return { embeds: [embed], components };
            };

            if (action === 'ebdr_cancel') {
              if (interaction.user.id !== game.user) {
                await interaction.reply({ content: 'Only the game creator can cancel.', ephemeral: true });
                return;
              }
              if (game.challenger) {
                await interaction.reply({ content: 'Cannot cancel after a challenger has accepted.', ephemeral: true });
                return;
              }
              // Refund creator; do NOT mark a winner on cancel
              const creatorMember = await database.getMemberByDiscordId(game.user);
              if (creatorMember) await database.addPoints(creatorMember.username, game.bet);
              // Update message to reflect cancellation
              const userMention = game.user ? `<@${game.user}>` : 'Unknown';
              const embed = {
                title: '💀 Deathroll',
                color: 0x8E44AD,
                description: `A deathroll issued by ${userMention} has been cancelled.`,
                fields: [
                  { name: 'Wager', value: `${game.bet} Firebrands`, inline: true },
                  { name: 'User', value: userMention, inline: true },
                  { name: 'Status', value: 'Cancelled by creator', inline: false },
                ],
                timestamp: new Date().toISOString(),
              };
              await interaction.update({ embeds: [embed], components: [] });
              return;
            }

            if (action === 'ebdr_accept') {
              if (interaction.user.id === game.user) {
                await interaction.reply({ content: 'You cannot accept your own challenge.', ephemeral: true });
                return;
              }
              if (game.challenger) {
                await interaction.reply({ content: 'This challenge has already been accepted.', ephemeral: true });
                return;
              }
              const challengerMember = await database.getMemberByDiscordId(interaction.user.id);
              if (!challengerMember) {
                await interaction.reply({ content: 'You must be linked to accept. Use /eb to check.', ephemeral: true });
                return;
              }
              const challengerPoints = typeof challengerMember.points === 'number' ? challengerMember.points : 0;
              if (challengerPoints < game.bet) {
                await interaction.reply({ content: `You need ${game.bet} Firebrands to accept. You have ${challengerPoints}.`, ephemeral: true });
                return;
              }
              await database.addPoints(challengerMember.username, -game.bet);

              const initial = Math.floor(Math.random() * 1001);
              const fields = { challenger: interaction.user.id, status: initial, turn: game.user };
              if (initial === 0) {
                // Rolling 0 loses. Since this initial roll is attributed to the challenger accepting,
                // mark the other player (creator) as the winner previously, but per new rule, 0 loses -> other wins.
                // The roller is effectively the challenger for the initial roll.
                const winnerId = game.user; // other player (creator) wins if challenger "rolled" 0 initially
                fields.winner = winnerId;
                const winnerMember = await database.getMemberByDiscordId(winnerId);
                if (winnerMember) await database.addPoints(winnerMember.username, game.bet * 2);
              }
              await database.updateGamba(gambaId, fields);
              Object.assign(game, fields);
              const payload = await renderGame();
              await interaction.update(payload);
              return;
            }

            if (action === 'ebdr_roll') {
              if (game.winner) {
                await interaction.reply({ content: 'This game is already over.', ephemeral: true });
                return;
              }
              if (!game.challenger) {
                await interaction.reply({ content: 'This game has not been accepted yet.', ephemeral: true });
                return;
              }
              if (interaction.user.id !== game.turn) {
                await interaction.reply({ content: 'It is not your turn to roll.', ephemeral: true });
                return;
              }
              const max = (game.status === 0 || typeof game.status === 'number') ? game.status : (game.status ? parseInt(game.status, 10) : 1000);
              const roll = Math.floor(Math.random() * (max + 1));
              const updates = { status: roll };
              if (roll === 0) {
                // Rolling 0 loses; winner is the other player
                const winnerId = (game.turn === game.user) ? game.challenger : game.user;
                updates.winner = winnerId;
                const winnerMember = await database.getMemberByDiscordId(winnerId);
                if (winnerMember) await database.addPoints(winnerMember.username, game.bet * 2);
              } else {
                updates.turn = (game.turn === game.user) ? game.challenger : game.user;
              }
              await database.updateGamba(gambaId, updates);
              Object.assign(game, updates);
              const payload = await renderGame();
              await interaction.update(payload);
              return;
            }
          }
        } catch (error) {
          logger.error('Error handling button interaction:', error);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while processing this action.', ephemeral: true });
          } else {
            await interaction.reply({ content: 'There was an error while processing this action.', ephemeral: true });
          }
        }
      }
    });

    this.client.on('error', (error) => {
      logger.error('Discord client error:', error);
    });

    // Handle modal submissions
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isModalSubmit()) return;
      try {
        const customId = interaction.customId || '';
        const parts = customId.split(':');
        const visibilityTag = parts[1] || 'epi';
        const isEphemeral = visibilityTag !== 'pub';

        // Enforce admin check on modal submission as well
        const isGlobalAdmin = interaction.user.id === config.discord.gmDiscordId;
        const isDbAdmin = await database.isAdmin(interaction.user.id);
        if (!isGlobalAdmin && !isDbAdmin) {
          await interaction.reply({ content: 'You do not have permission to use this action.', ephemeral: true });
          return;
        }

        if (customId.startsWith('ebadmin_edit_modal')) {
          const username = interaction.fields.getTextInputValue('member_username').trim();
          const payload = await this.buildMemberEditPayload(username, visibilityTag);
          await interaction.reply({ ...payload, ephemeral: isEphemeral });
          return;
        }

        if (customId.startsWith('ebmember_link_modal')) {
          const username = decodeURIComponent(parts[2] || '');
          let value = interaction.fields.getTextInputValue('discord_id').trim();
          // Allow mention format <@123>
          const mentionMatch = value.match(/\d{15,20}/);
          const discordId = mentionMatch ? mentionMatch[0] : value;
          await database.linkDiscordId(username, discordId);
          const payload = await this.buildMemberEditPayload(username, visibilityTag);
          await interaction.reply({ ...payload, ephemeral: isEphemeral });
          return;
        }

        if (customId.startsWith('ebmember_note_modal')) {
          const username = decodeURIComponent(parts[2] || '');
          const note = interaction.fields.getTextInputValue('member_note').trim();
          await database.updateMemberNote(username, note || null);
          const payload = await this.buildMemberEditPayload(username, visibilityTag);
          await interaction.reply({ ...payload, ephemeral: isEphemeral });
          return;
        }

        if (customId.startsWith('ebmember_points_modal')) {
          const username = decodeURIComponent(parts[2] || '');
          const action = parts[3] || 'give';
          const raw = interaction.fields.getTextInputValue('points_delta').trim();
          const amt = parseInt(raw, 10);
          if (!Number.isFinite(amt) || amt <= 0) {
            await interaction.reply({ content: 'Please enter a positive integer amount.', ephemeral: true });
            return;
          }
          const delta = action === 'give' ? amt : -amt;
          await database.addPoints(username, delta);
          const payload = await this.buildMemberEditPayload(username, visibilityTag);
          await interaction.reply({ ...payload, ephemeral: isEphemeral });
          return;
        }
      } catch (error) {
        logger.error('Error handling modal submission:', error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while processing the modal.', ephemeral: true });
        } else {
          await interaction.reply({ content: 'There was an error while processing the modal.', ephemeral: true });
        }
      }
    });
  }

  // Build a detailed single-member edit payload with action buttons
  async buildMemberEditPayload(username, visibilityTag = 'epi') {
    const member = await database.getMember(username);
    if (!member) {
      return { content: `❌ Member not found: ${username}`, components: [], embeds: [] };
    }
    const points = typeof member.points === 'number' ? member.points : 0;
    const epochSeconds = member.detected_date_time ? Math.floor(new Date(member.detected_date_time).getTime() / 1000) : null;
    const discordText = member.discord_id ? `<@${member.discord_id}>` : '❌ Unlinked';
    const embed = new EmbedBuilder()
      .setTitle(`Edit Member: ${member.username}`)
      .setColor(0xFFA500)
      .addFields(
        { name: 'Rank', value: member.user_rank || 'N/A', inline: true },
        { name: 'Level', value: member.user_level || 'user', inline: true },
        { name: 'Discord', value: discordText, inline: true },
        { name: 'Points', value: `${points}`, inline: true },
        { name: 'Added', value: epochSeconds ? `<t:${epochSeconds}:R>` : 'N/A', inline: true },
      )
      .setTimestamp();
    if (member.user_note) {
      embed.addFields({ name: 'Note', value: member.user_note, inline: false });
    }

    const encoded = encodeURIComponent(member.username);
    const components = [
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: member.discord_id ? `ebmember_unlink:${visibilityTag}:${encoded}` : `ebmember_link:${visibilityTag}:${encoded}`,
            label: member.discord_id ? 'Unlink Discord' : 'Link Discord',
            style: 1,
          },
          {
            type: 2,
            custom_id: member.user_level === 'admin' ? `ebmember_removeadmin:${visibilityTag}:${encoded}` : `ebmember_makeadmin:${visibilityTag}:${encoded}`,
            label: member.user_level === 'admin' ? 'Remove Admin' : 'Make Admin',
            style: 2,
          },
          {
            type: 2,
            custom_id: `ebmember_editnote:${visibilityTag}:${encoded}`,
            label: 'Edit Note',
            style: 2,
          },
        ],
      },
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: `ebmember_givepoints:${visibilityTag}:${encoded}`,
            label: 'Give Points',
            style: 3,
          },
          {
            type: 2,
            custom_id: `ebmember_removepoints:${visibilityTag}:${encoded}`,
            label: 'Remove Points',
            style: 4,
          },
        ],
      },
    ];

    return { embeds: [embed], components };
  }

  async buildMembersPayload(page = 1, visibilityTag = 'epi') {
    const perPage = 10;
    const all = await database.getAllMembers();
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * perPage;
    const members = all.slice(start, start + perPage);

    const lines = members.map((m) => {
      const crown = m.user_level === 'admin' ? '👑 ' : '';
      const rank = m.user_rank ? m.user_rank : 'No Rank';
      const discord = m.discord_id ? `<@${m.discord_id}>` : '❌ Unlinked';
      const points = typeof m.points === 'number' ? m.points : 0;
      const noteLine = m.user_note ? `\nNote: ${m.user_note}` : '';
      let detectedLine = '\nDetected: N/A';
      if (m.detected_date_time) {
        const epochSeconds = Math.floor(new Date(m.detected_date_time).getTime() / 1000);
        if (!Number.isNaN(epochSeconds)) detectedLine = `\nDetected: <t:${epochSeconds}:R>`;
      }
      return `${crown}**${m.username}** - ${rank}\nDiscord: ${discord}\nFirebrands: ${points}${noteLine}${detectedLine}`;
    });

    const embed = {
      title: '👥 FC Members',
      color: 0x0099FF,
      description: lines.length ? lines.map(l => `${l}`).join('\n\n') : 'No members found.',
      footer: { text: `Page ${currentPage}/${totalPages} • ${total} total members` },
      timestamp: new Date().toISOString(),
    };

    const prevDisabled = currentPage <= 1;
    const nextDisabled = currentPage >= totalPages;

    const components = [
      {
        type: 1, // ActionRow
        components: [
          {
            type: 2, // Button
            custom_id: `ebadmin_members:${visibilityTag}:${currentPage - 1}`,
            label: 'Previous',
            style: 2, // Secondary
            disabled: prevDisabled,
          },
          {
            type: 2, // Button
            custom_id: `ebadmin_edit:${visibilityTag}`,
            label: 'Edit Member',
            style: 2, // Secondary
          },
          {
            type: 2, // Button
            custom_id: `ebadmin_members:${visibilityTag}:${currentPage + 1}`,
            label: 'Next',
            style: 2, // Secondary
            disabled: nextDisabled,
          },
        ],
      },
    ];

    return { embeds: [embed], components };
  }

  async start() {
    try {
      await this.client.login(config.discord.token);
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  async stop() {
    logger.info('Shutting down bot...');
    this.syncService.stop();
    await this.client.destroy();
  }
}

module.exports = EternalBot;
