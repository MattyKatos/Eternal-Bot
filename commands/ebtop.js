const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../database/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ebtop')
    .setDescription('Show the top 5 leaders by Firebrands and by Wins'),

  adminOnly: false,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    // Fetch leaderboards
    const [topPoints, topWins] = await Promise.all([
      database.getTopByPoints(5),
      database.getTopWins(5),
    ]);

    // Resolve usernames for wins (winner is a discord_id)
    const winsDetailed = await Promise.all(
      (topWins || []).map(async (row) => {
        const member = row.discord_id ? await database.getMemberByDiscordId(row.discord_id) : null;
        return {
          discord_id: row.discord_id,
          wins: row.wins,
          username: member?.username || 'Unknown',
        };
      })
    );

    const pointsLines = (topPoints || []).map((m, idx) => {
      const place = idx + 1;
      const name = m.username || 'Unknown';
      const mention = m.discord_id ? ` (<@${m.discord_id}>)` : '';
      const pts = typeof m.points === 'number' ? m.points : 0;
      return `${place}. **${name}**${mention} — ${pts} Firebrands`;
    });

    const winsLines = (winsDetailed || []).map((w, idx) => {
      const place = idx + 1;
      const mention = w.discord_id ? `<@${w.discord_id}>` : w.username;
      return `${place}. ${mention} — ${w.wins} wins`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🏆 Eternal Bot Leaderboards')
      .setColor(0xF1C40F)
      .addFields(
        { name: 'Top Firebrands', value: pointsLines.length ? pointsLines.join('\n') : 'No data yet.', inline: false },
        { name: 'Top Wins (Deathroll)', value: winsLines.length ? winsLines.join('\n') : 'No games played yet.', inline: false },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
