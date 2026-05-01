const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animenews')
        .setDescription('Get the latest airing anime and trending updates'),

    async execute(interaction) {
        try {
            // Fetch New Episode Releases
            const epRes = await fetch('https://api.jikan.moe/v4/watch/episodes?limit=5');
            const epData = await epRes.json();

            // Fetch Upcoming Anime
            const upcomingRes = await fetch('https://api.jikan.moe/v4/seasons/upcoming?limit=5');
            const upcomingData = await upcomingRes.json();

            // Fetch Currently Airing
            const seasonRes = await fetch('https://api.jikan.moe/v4/seasons/now?limit=10');
            const seasonData = await seasonRes.json();

            const embed = new EmbedBuilder()
                .setTitle('📺 Latest Anime News & New Releases')
                .setDescription('Currently trending, recently aired, and upcoming titles!')
                .setColor(0x2E51A2)
                .setTimestamp()
                .setFooter({ text: 'Data provided by Jikan API (MyAnimeList)' });

            // New Episodes
            if (epData.data?.length) {
                const list = epData.data.slice(0, 5).map(item => `• **${item.entry.title}** - ${item.episodes?.[0]?.mal_id || 'New'}`).join('\n');
                embed.addFields({ name: '🆕 New Episode Releases', value: list });
            }

            // Upcoming
            if (upcomingData.data?.length) {
                const list = upcomingData.data.slice(0, 5).map(a => `• **${a.title}** (${a.aired?.string || 'TBA'})`).join('\n');
                embed.addFields({ name: '⏳ Upcoming Series', value: list });
            }

            // Recently Finished / Status
            if (seasonData.data?.length) {
                const finished = seasonData.data.filter(a => a.status === 'Finished Airing').slice(0, 3);
                if (finished.length > 0) {
                    const list = finished.map(a => `• **${a.title}** (Completed)`).join('\n');
                    embed.addFields({ name: '🏁 Recently Finished', value: list });
                } else {
                    const trending = seasonData.data.slice(0, 3).map(a => `• **${a.title}** (Rating: ${a.score || 'N/A'})`).join('\n');
                    embed.addFields({ name: '🔥 Top Airing Now', value: trending });
                }
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Anime news command failed:', error);
            await interaction.editReply('❌ Failed to fetch anime news. Please try again later.');
        }
    }
};