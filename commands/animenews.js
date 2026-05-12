const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const REQUEST_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animenews')
        .setDescription('Get the latest airing anime and trending updates'),

    async execute(interaction) {
        try {
            // Fetch New Episode Releases
            const epRes = await fetch('https://api.jikan.moe/v4/watch/episodes?limit=5', { timeout: REQUEST_TIMEOUT_MS });
            const epData = await epRes.json();

            // Fetch Upcoming Anime
            const upcomingRes = await fetch('https://api.jikan.moe/v4/seasons/upcoming?limit=5', { timeout: REQUEST_TIMEOUT_MS });
            const upcomingData = await upcomingRes.json();

            // Fetch Currently Airing
            const seasonRes = await fetch('https://api.jikan.moe/v4/seasons/now?limit=10', { timeout: REQUEST_TIMEOUT_MS });
            const seasonData = await seasonRes.json();

            const headerEmbed = new EmbedBuilder()
                .setTitle('📺 Anime News Flash')
                .setDescription('Sending the latest updates one by one...')
                .setColor(0x2E51A2);

            await interaction.editReply({ embeds: [headerEmbed] });

            // Post New Episodes
            if (epData.data?.length) {
                for (const item of epData.data.slice(0, 2)) {
                    const epEmbed = new EmbedBuilder()
                        .setTitle(`🆕 New Release: ${item.entry.title}`)
                        .setDescription(`New update available!`)
                        .setImage(item.entry.images?.jpg?.large_image_url || item.entry.images?.jpg?.image_url)
                        .setURL(item.entry.url)
                        .setColor(0x57F287);
                    
                    await interaction.followUp({ embeds: [epEmbed], flags: 64 });
                }
            }

            // Post Upcoming
            if (upcomingData.data?.length) {
                for (const a of upcomingData.data.slice(0, 2)) {
                    const upEmbed = new EmbedBuilder()
                        .setTitle(`⏳ Upcoming: ${a.title}`)
                        .setDescription(`Airing: ${a.aired?.string || 'TBA'}`)
                        .setImage(a.images?.jpg?.large_image_url || a.images?.jpg?.image_url)
                        .setURL(a.url)
                        .setColor(0xFEE75C);

                    await interaction.followUp({ embeds: [upEmbed], flags: 64 });
                }
            }

            // Post Recently Finished / Status
            if (seasonData.data?.length) {
                const finished = seasonData.data.filter(a => a.status === 'Finished Airing').slice(0, 3);
                if (finished.length > 0) {
                    for (const a of finished) {
                        const finEmbed = new EmbedBuilder()
                            .setTitle(`🏁 Finished: ${a.title}`)
                            .setImage(a.images?.jpg?.large_image_url || a.images?.jpg?.image_url)
                            .setURL(a.url)
                            .setColor(0xED4245);
                        
                        await interaction.followUp({ embeds: [finEmbed], flags: 64 });
                    }
                } else {
                    for (const a of seasonData.data.slice(0, 2)) {
                        const trendEmbed = new EmbedBuilder()
                            .setTitle(`🔥 Trending: ${a.title}`)
                            .setDescription(`Rating: ⭐ ${a.score || 'N/A'}`)
                            .setImage(a.images?.jpg?.large_image_url || a.images?.jpg?.image_url)
                            .setURL(a.url)
                            .setColor(0x5865F2);

                        await interaction.followUp({ embeds: [trendEmbed], flags: 64 });
                    }
                }
            }

        } catch (error) {
            console.error('Anime news command failed:', error);
            await interaction.editReply('❌ Failed to fetch anime news. Please try again later.');
        }
    }
};
