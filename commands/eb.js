const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const database = require('../database/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eb')
    .setDescription('View your Eternal Bot profile'),

  adminOnly: false,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;
    const member = await database.getMemberByDiscordId(discordId);

    if (!member) {
      await interaction.editReply({ content: 'You are not linked to any FC member. Ping <@&1313525202239619103> to get your Discord linked to your FC character.', embeds: [], components: [] });
      return;
    }

    const points = typeof member.points === 'number' ? member.points : 0;
    const epochSeconds = member.detected_date_time ? Math.floor(new Date(member.detected_date_time).getTime() / 1000) : null;

    const discordText = member.discord_id ? `<@${member.discord_id}>` : '❌ Unlinked';

    const embed = new EmbedBuilder()
      .setTitle(`Your Profile: ${member.username}`)
      .setColor(0x2ECC71)
      .addFields(
        { name: 'Rank', value: member.user_rank || 'N/A', inline: true },
        { name: 'Level', value: member.user_level || 'user', inline: true },
        { name: 'Discord', value: discordText, inline: true },
        { name: 'Firebrands', value: `${points}`, inline: true },
        { name: 'Added', value: epochSeconds ? `<t:${epochSeconds}:R>` : 'N/A', inline: true },
      )
      .setTimestamp();

    const components = [];
    if (member.discord_id === discordId) {
      const encoded = encodeURIComponent(member.username);
      const canClaim = await database.canClaimPoints(discordId);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ebself_unlink:epi:${encoded}`)
          .setLabel('Unlink Discord')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`ebself_claim:epi:${encoded}`)
          .setLabel('Daily Firebrands')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!canClaim)
      );
      components.push(row);
    }

    await interaction.editReply({ embeds: [embed], components });
  }
};
