const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const REQUEST_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animesuggest')
        .setDescription('Get random anime suggestions'),

    async execute(interaction) {
        await interaction.deferReply(); // Defer the reply as API call can take time

        try {
            const response = await fetch('https://api.jikan.moe/v4/recommendations/anime', { timeout: REQUEST_TIMEOUT_MS });
            const data = await response.json();

            if (!data.data || data.data.length === 0) {
                return await interaction.editReply('❌ Could not fetch anime suggestions at this time.');
            }

            // Shuffle the recommendations and pick a few (e.g., 3 random ones)
            const shuffled = data.data.sort(() => 0.5 - Math.random());
            const suggestions = shuffled.slice(0, 3); 

            if (suggestions.length === 0) {
                return await interaction.editReply('❌ No anime suggestions available.');
            }

            const embed = new EmbedBuilder()
                .setTitle('✨ Anime Suggestions for You!')
                .setDescription('Here are a few anime you might enjoy:')
                .setColor(0x8A2BE2) // A nice purple color
                .setTimestamp()
                .setFooter({ text: 'Data provided by Jikan API' });

            suggestions.forEach((rec, index) => {
                const anime = rec.entry;
                embed.addFields({
                    name: `${index + 1}. ${anime.title}`,
                    value: `Read More\n*Recommended because: ${rec.content.substring(0, 100)}...*`,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Anime suggest command failed:', error);
            await interaction.editReply('❌ Failed to fetch anime suggestions. Please try again later.');
        }
    }
};
