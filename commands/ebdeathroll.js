const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const database = require('../database/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ebdeathroll')
    .setDescription('Create a Deathroll bet')
    .addIntegerOption(opt =>
      opt.setName('bet')
        .setDescription('Amount of Firebrands to wager')
        .setMinValue(1)
        .setRequired(true)
    ),

  async execute(interaction) {
    const bet = interaction.options.getInteger('bet', true);
    const discordId = interaction.user.id;

    // Find the linked member and ensure enough points
    const member = await database.getMemberByDiscordId(discordId);
    if (!member) {
      await interaction.reply({ content: '❌ You are not linked to an FC member. Use /eb to view your profile and contact an admin to link.', ephemeral: true });
      return;
    }

    const currentPoints = typeof member.points === 'number' ? member.points : 0;
    if (currentPoints < bet) {
      await interaction.reply({ content: `❌ You do not have enough Firebrands to wager ${bet}. You currently have ${currentPoints}.`, ephemeral: true });
      return;
    }

    // Deduct bet up front
    await database.addPoints(member.username, -bet);

    // Create gamba entry
    const { id: gambaId } = await database.createGamba('deathroll', discordId, bet);

    const embed = new EmbedBuilder()
      .setTitle('💀 Deathroll')
      .setColor(0x8E44AD)
      .setDescription(`A deathroll has been issued by <@${discordId}>!`)
      .addFields(
        { name: 'Wager', value: `${bet} Firebrands`, inline: true },
        { name: 'User', value: `<@${discordId}>`, inline: true },
        { name: 'Status', value: 'Waiting for a challenger...', inline: false },
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ebdr_accept:${gambaId}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ebdr_cancel:${gambaId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
};
