const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animenews')
        .setDescription('Get the latest airing anime and trending updates'),

    async execute(interaction) {
        try {
            // Fetches currently airing anime (season data)
            const response = await fetch('https://api.jikan.moe/v4/seasons/now?limit=5');
            const data = await response.json();

            if (!data.data || data.data.length === 0) {
                return await interaction.editReply('❌ No anime updates found at the moment.');
            }

            const embed = new EmbedBuilder()
                .setTitle('📺 Current Season Anime Updates')
                .setDescription('Here are some of the latest airing anime trending right now:')
                .setColor(0x2E51A2)
                .setTimestamp()
                .setFooter({ text: 'Data provided by Jikan API (MyAnimeList)' });

            data.data.forEach(anime => {
                embed.addFields({
                    name: anime.title,
                    value: `⭐ **Score:** ${anime.score || 'N/A'}\n🎭 **Genres:** ${anime.genres.map(g => g.name).join(', ')}\n🔗 View on MAL`,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Anime news command failed:', error);
            await interaction.editReply('❌ Failed to fetch anime news. Please try again later.');
        }
    }
};