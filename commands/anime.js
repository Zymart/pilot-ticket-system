const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('anime')
        .setDescription('Search for anime info using Jikan API')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The name of the anime to search for')
                .setRequired(true)
        ),

    async execute(interaction) {
        const query = interaction.options.getString('query');

        try {
            const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`);
            const data = await response.json();

            if (!data.data || data.data.length === 0) {
                return await interaction.editReply('❌ No anime found for that search query.');
            }

            const anime = data.data[0];
            const embed = new EmbedBuilder()
                .setTitle(anime.title)
                .setURL(anime.url)
                .setThumbnail(anime.images.jpg.image_url)
                .setColor(0x2E51A2) // MyAnimeList Blue
                .addFields(
                    { name: '📺 Type', value: anime.type || 'N/A', inline: true },
                    { name: '🎬 Episodes', value: anime.episodes?.toString() || 'Unknown', inline: true },
                    { name: '⭐ Score', value: anime.score?.toString() || 'N/A', inline: true },
                    { name: '📅 Status', value: anime.status || 'N/A', inline: true },
                    { name: '📝 Synopsis', value: anime.synopsis ? (anime.synopsis.substring(0, 1000) + '...') : 'No synopsis available.' }
                )
                .setFooter({ text: 'Data provided by Jikan API (MyAnimeList)' });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Anime command failed:', error);
            await interaction.editReply('❌ Failed to fetch anime data. Please try again later.');
        }
    }
};