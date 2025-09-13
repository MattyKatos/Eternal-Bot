const { SlashCommandBuilder } = require('discord.js');
const database = require('../database/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ebgive')
    .setDescription('Give Firebrands to another linked user')
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('The Discord user to receive Firebrands')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('Amount of Firebrands to give')
        .setRequired(true)
        .setMinValue(1)
    ),

  adminOnly: false,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const giverDiscordId = interaction.user.id;
    const targetUser = interaction.options.getUser('target', true);
    const targetDiscordId = targetUser.id;
    const amount = interaction.options.getInteger('amount', true);

    if (giverDiscordId === targetDiscordId) {
      await interaction.editReply({ content: 'You cannot give Firebrands to yourself.' });
      return;
    }

    // Ensure both are linked
    const giver = await database.getMemberByDiscordId(giverDiscordId);
    if (!giver) {
      await interaction.editReply({ content: 'You are not linked to an FC member. Use /eb to view your profile and get linked.' });
      return;
    }

    const recipient = await database.getMemberByDiscordId(targetDiscordId);
    if (!recipient) {
      await interaction.editReply({ content: 'The target user is not linked to an FC member.' });
      return;
    }

    const giverPoints = typeof giver.points === 'number' ? giver.points : 0;
    if (giverPoints < amount) {
      await interaction.editReply({ content: `You do not have enough Firebrands. You have ${giverPoints}, but tried to give ${amount}.` });
      return;
    }

    // Transfer
    await database.addPoints(giver.username, -amount);
    await database.addPoints(recipient.username, amount);

    await interaction.editReply({ content: `✅ Transferred ${amount} Firebrands to ${targetUser}.` });
  }
};
