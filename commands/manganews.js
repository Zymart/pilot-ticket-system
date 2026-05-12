const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const REQUEST_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manganews')
        .setDescription('Get the latest manga chapter updates from MangaDex'),

    async execute(interaction) {
        try {
            const response = await fetch('https://api.mangadex.org/chapter?limit=5&order[readableAt]=desc&contentRating[]=safe&includes[]=manga&includes[]=cover_art&translatedLanguage[]=en', { timeout: REQUEST_TIMEOUT_MS });
            const data = await response.json();

            if (!data.data || data.data.length === 0) {
                return await interaction.editReply('❌ No manga updates found at the moment.');
            }

            const headerEmbed = new EmbedBuilder()
                .setTitle('📚 MangaDex Quick Updates')
                .setDescription('Sending the latest chapter releases one by one...')
                .setColor(0xFF6740);

            await interaction.editReply({ embeds: [headerEmbed] });

            for (const chapter of data.data) {
                const mangaRel = chapter.relationships.find(r => r.type === 'manga');
                const coverRel = chapter.relationships.find(r => r.type === 'cover_art');
                const mangaTitle = mangaRel?.attributes?.title?.en || mangaRel?.attributes?.title?.['ja-ro'] || 'New Manga';
                const mangaId = mangaRel?.id;
                const fileName = coverRel?.attributes?.fileName;

                const embed = new EmbedBuilder()
                    .setTitle(`📖 ${mangaTitle}`)
                    .setDescription(`Chapter **${chapter.attributes.chapter}** has been released!`)
                    .setURL(`https://mangadex.org/chapter/${chapter.id}`)
                    .setColor(0xFF6740)
                    .setTimestamp();

                if (mangaId && fileName) {
                    embed.setImage(`https://uploads.mangadex.org/covers/${mangaId}/${fileName}`);
                }
                
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            }

        } catch (error) {
            console.error('Manga news command failed:', error);
            await interaction.editReply('❌ Failed to fetch manga news. Please try again later.');
        }
    }
};
