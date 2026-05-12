const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animesuggest')
        .setDescription('Fetch anime suggestions and post them 1 by 1 to the suggestions channel'),

    async execute(interaction) {
        const targetChannelId = config.system.animeSuggestChannelId;
        const targetChannel = interaction.guild.channels.cache.get(targetChannelId);

        if (!targetChannel) {
            return await interaction.editReply('❌ The anime suggestions channel is not configured correctly in config.js.');
        }

        try {
            const response = await fetch('https://api.jikan.moe/v4/recommendations/anime');
            const data = await response.json();

            if (!data.data || data.data.length === 0) {
                return await interaction.editReply('❌ Could not fetch anime suggestions at this time.');
            }

            // Shuffle and pick 3 random recommendations from the API response
            const shuffled = data.data.sort(() => 0.5 - Math.random());
            const suggestions = shuffled.slice(0, 3);

            await interaction.editReply(`✅ Posting ${suggestions.length} suggestions to <#${targetChannelId}>...`);

            for (const rec of suggestions) {
                // Each recommendation pair contains a primary anime entry
                const anime = rec.entry[0]; 
                
                const embed = new EmbedBuilder()
                    .setTitle(`✨ Suggested Anime: ${anime.title}`)
                    .setDescription(`**Why it's recommended:**\n${rec.content.substring(0, 450)}...`)
                    .setURL(anime.url)
                    .setImage(anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url)
                    .setColor(0x8A2BE2) // Purple theme
                    .setTimestamp()
                    .setFooter({ text: 'Data provided by Jikan API' });

                await targetChannel.send({ embeds: [embed] });
                // 2-second delay between posts for the "1 by 1" effect
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (error) {
            console.error('Anime suggest command failed:', error);
            await interaction.editReply('❌ Failed to fetch anime suggestions. Please try again later.');
        }
    }
};