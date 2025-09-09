const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const database = require('../database/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ebadmin')
    .setDescription('Admin dashboard for Eternal Bot')
    .addBooleanOption(option =>
      option
        .setName('visibility')
        .setDescription('Show to everyone? (default: false = ephemeral)')
        .setRequired(false)
    ),
  adminOnly: true,

  async execute(interaction) {
    const visible = interaction.options.getBoolean('visibility');
    const isEphemeral = !(visible === true);

    await interaction.deferReply({ ephemeral: isEphemeral });

    const memberCount = await database.getMemberCount();

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Eternal Bot Admin')
      .setColor(0x5865F2)
      .setDescription('Use the buttons below to perform admin actions.')
      .addFields(
        { name: '👥 FC Members', value: `${memberCount}`, inline: true },
        { name: 'Visibility', value: isEphemeral ? 'Ephemeral (admins only)' : 'Public (visible to channel)', inline: true }
      )
      .setTimestamp();

    const customVisibilityTag = isEphemeral ? 'epi' : 'pub';
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ebadmin_scrape:${customVisibilityTag}`)
        .setLabel('Scrape Now')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ebadmin_members:${customVisibilityTag}:1`)
        .setLabel('Members')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  }
};
