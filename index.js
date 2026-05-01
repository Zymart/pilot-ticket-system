const {
    Client,
    GatewayIntentBits,
    Collection,
    REST,
    Routes,
    Events,
    ChannelType,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const configManager = require('./utils/configManager');
const {
    buildTranscriptAttachment,
    createTranscript,
    deleteConnectedChannels,
    getTicketEntryByChannel,
    isTicketChannel,
    removeTicketByChannel
} = require('./utils/ticketHelpers');

console.log('=== CONFIG DEBUG ===');
console.log('Token exists:', !!config.token);
console.log('Token length:', config.token?.length);
console.log('Token starts with:', config.token?.substring(0, 10) + '...');
console.log('Client ID:', config.clientId);
console.log('Guild ID:', config.guildId);
console.log('====================');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    rest: {
        timeout: 60000,
        retries: 3
    },
    ws: {
        large_threshold: 50,
        compress: false
    }
});

client.commands = new Collection();
client.ticketPanelDrafts = new Map();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commands = [];

for (const file of commandFiles) {
    if (file === 'setup.js') continue;
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
    console.log(`Loaded command: ${command.data.name}`);
}

if (process.env.NODE_ENV === 'production') {
    const rest = new REST({ version: '10' }).setToken(config.token);

    (async () => {
        try {
            console.log('Deploying commands...');
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands }
            );
            console.log('Commands deployed successfully');
        } catch (error) {
            console.error('Deploy failed:', error.message);
        }
    })();
}

async function sendPostGuide(channel) {
    const guideEmbed = new EmbedBuilder()
        .setTitle('📖 How to Post a Product')
        .setDescription('To showcase your products in the marketplace, follow these steps:')
        .addFields(
            { name: 'Step 1', value: 'Type the command `/post` in any channel.' },
            { name: 'Step 2', value: 'Fill in the **Product Name**, **Description**, and **Price**.' },
            { name: 'Step 3', value: 'Select your preferred **Currency** (Dollars or Pesos).' },
            { name: 'Step 4', value: '(Optional) Provide an **Image URL** to show your product.' },
            { 
                name: '🖼️ How to get an Image URL', 
                value: '• **From Discord:** Upload your image to any channel, right-click (or long-press) the image, and select **"Copy Link"**.\n' +
                       '• **From Web:** Right-click any image online and select **"Copy Image Address"**.\n' +
                       '• **Tip:** Make sure the link ends in `.png`, `.jpg`, or `.webp` so Discord can display it!'
            }
        )
        .setFooter({ text: 'Your post will be sent to the official marketplace channel automatically.' })
        .setColor(0x5865F2);

    // Clear previous bot messages in guide channel to keep it clean
    const messages = await channel.messages.fetch({ limit: 50 });
    const botMessages = messages.filter(m => m.author.id === client.user.id);
    if (botMessages.size > 0) {
        await channel.bulkDelete(botMessages).catch(() => {});
    }

    await channel.send({ embeds: [guideEmbed] });
}

async function autoPostAnimeNews() {
    const channelId = config.system.animeNewsChannelId;
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    try {
        // Fetch New Episode Releases (Watch Feed)
        const epRes = await fetch('https://api.jikan.moe/v4/watch/episodes?limit=5');
        const epData = await epRes.json();

        // Fetch Upcoming Anime
        const upcomingRes = await fetch('https://api.jikan.moe/v4/seasons/upcoming?limit=5');
        const upcomingData = await upcomingRes.json();

        // Fetch Recently Finished or Top Airing (Season data)
        const seasonRes = await fetch('https://api.jikan.moe/v4/seasons/now?limit=10');
        const seasonData = await seasonRes.json();

        if (!epData.data || !upcomingData.data || !seasonData.data) return;

        // Generate a composite key to track state changes based on latest items
        const latestEpId = epData.data[0]?.entry?.mal_id || '';
        const latestUpcomingId = upcomingData.data[0]?.mal_id || '';
        const currentIds = `eps:${latestEpId}-up:${latestUpcomingId}`;

        const state = configManager.getAnimeState();
        if (state.lastIds === currentIds) {
            console.log('No new anime updates found since the last post.');
            return;
        }

        // Post New Episode Releases Individually
        const recentEps = epData.data.slice(0, 3);
        for (const item of recentEps) {
            const epTitle = item.episodes?.[0]?.title || 'New Episode';
            const epEmbed = new EmbedBuilder()
                .setTitle(`🆕 New Release: ${item.entry.title}`)
                .setDescription(`A new episode has just been released!\n**Episode:** ${epTitle}`)
                .setImage(item.entry.images?.jpg?.large_image_url || item.entry.images?.jpg?.image_url)
                .setURL(item.entry.url)
                .setColor(0x57F287) // Green for new releases
                .setTimestamp();
            
            await channel.send({ embeds: [epEmbed] });
        }

        // Post Upcoming Anime Individually
        const upcoming = upcomingData.data.slice(0, 2);
        for (const anime of upcoming) {
            const upEmbed = new EmbedBuilder()
                .setTitle(`⏳ Upcoming: ${anime.title}`)
                .setDescription(`Get ready! This anime is coming soon.\n**Airing:** ${anime.aired?.string || 'TBA'}`)
                .setImage(anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url)
                .setURL(anime.url)
                .setColor(0xFEE75C) // Yellow for upcoming
                .setTimestamp();

            await channel.send({ embeds: [upEmbed] });
        }

        // Post Recently Finished or Trending Individually
        const finished = seasonData.data.filter(a => a.status === 'Finished Airing').slice(0, 3);
        if (finished.length > 0) {
            for (const a of finished) {
                const finEmbed = new EmbedBuilder()
                    .setTitle(`🏁 Finished: ${a.title}`)
                    .setDescription(`This series has successfully finished airing! Time to binge-watch?`)
                    .setImage(a.images?.jpg?.large_image_url || a.images?.jpg?.image_url)
                    .setURL(a.url)
                    .setColor(0xED4245) // Red for finished
                    .setTimestamp();
                
                await channel.send({ embeds: [finEmbed] });
            }
        } else {
            const trending = seasonData.data.slice(0, 2);
            for (const a of trending) {
                const trendEmbed = new EmbedBuilder()
                    .setTitle(`🔥 Trending: ${a.title}`)
                    .setDescription(`People are talking about this right now!\n**Rating:** ⭐ ${a.score || 'N/A'}`)
                    .setImage(a.images?.jpg?.large_image_url || a.images?.jpg?.image_url)
                    .setURL(a.url)
                    .setColor(0x5865F2) // Blue for trending
                    .setTimestamp();

                await channel.send({ embeds: [trendEmbed] });
            }
        }
        
        // Update state to prevent duplicate posts
        configManager.setAnimeState({ lastIds: currentIds });
        console.log(`Successfully posted anime updates to ${channelId}`);
    } catch (error) {
        console.error('Auto anime news post failed:', error);
    }
}

async function autoPostMangaNews() {
    const channelId = config.system.mangaNewsChannelId;
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    try {
        // Fetch New Chapter Releases
        const chRes = await fetch('https://api.mangadex.org/chapter?limit=3&order[readableAt]=desc&contentRating[]=safe&includes[]=manga&includes[]=cover_art&translatedLanguage[]=en');
        const chData = await chRes.json();

        // Fetch Recently Added Manga Titles (New/Upcoming)
        const mgRes = await fetch('https://api.mangadex.org/manga?limit=2&order[createdAt]=desc&contentRating[]=safe&includes[]=cover_art');
        const mgData = await mgRes.json();

        if (!chData.data) return;

        const currentIds = [
            ...(chData.data?.map(ch => ch.id) || []),
            ...(mgData.data?.map(mg => mg.id) || [])
        ].join(',');

        const state = configManager.getMangaState();
        if (state.lastIds === currentIds) return;

        // Post New Chapters
        for (const chapter of chData.data) {
            const mangaRel = chapter.relationships.find(r => r.type === 'manga');
            const coverRel = chapter.relationships.find(r => r.type === 'cover_art');
            const mangaTitle = mangaRel?.attributes?.title?.en || mangaRel?.attributes?.title?.['ja-ro'] || 'New Manga';
            const mangaId = mangaRel?.id;
            const fileName = coverRel?.attributes?.fileName;
            
            const embed = new EmbedBuilder()
                .setTitle(`📖 New Manga Chapter: ${mangaTitle}`)
                .setDescription(`Chapter **${chapter.attributes.chapter}** is now available on MangaDex!`)
                .setURL(`https://mangadex.org/chapter/${chapter.id}`)
                .setColor(0xFF6740) // MangaDex Orange
                .setTimestamp()
                .setFooter({ text: 'Powered by MangaDex API' });

            if (mangaId && fileName) {
                embed.setImage(`https://uploads.mangadex.org/covers/${mangaId}/${fileName}`);
            }

            await channel.send({ embeds: [embed] });
        }

        // Post New Manga Titles
        if (mgData.data) {
            for (const manga of mgData.data) {
                const coverRel = manga.relationships.find(r => r.type === 'cover_art');
                const mangaTitle = manga.attributes.title.en || manga.attributes.title['ja-ro'] || 'New Title';
                const fileName = coverRel?.attributes?.fileName;

                const embed = new EmbedBuilder()
                    .setTitle(`🌟 New Manga: ${mangaTitle}`)
                    .setDescription(truncateText(manga.attributes.description?.en || 'No description available.', 500))
                    .setURL(`https://mangadex.org/manga/${manga.id}`)
                    .setColor(0x5865F2)
                    .setTimestamp();

                if (fileName) {
                    embed.setImage(`https://uploads.mangadex.org/covers/${manga.id}/${fileName}`);
                }

                await channel.send({ embeds: [embed] });
            }
        }

        configManager.setMangaState({ lastIds: currentIds });
        console.log(`Successfully posted manga updates to ${channelId}`);
    } catch (error) {
        console.error('Auto manga news post failed:', error);
    }
}

async function autoPostAnimeSuggestions() {
    const channelId = config.system.animeSuggestChannelId;
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    try {
        const response = await fetch('https://api.jikan.moe/v4/recommendations/anime');
        const data = await response.json();

        if (!data.data || data.data.length === 0) return;

        // Pick 3 random recommendations
        const shuffled = data.data.sort(() => 0.5 - Math.random());
        const suggestions = shuffled.slice(0, 3);

        // Create a unique key for these 3 suggestions to avoid posting the exact same set twice
        const currentIds = suggestions.map(s => s.entry[0].mal_id).join(',');
        const state = configManager.getSuggestionState();

        if (state.lastIds === currentIds) return;

        console.log('Posting automated anime suggestions...');

        for (const rec of suggestions) {
            // Fetch full details for each recommended anime to get genres and streaming info
            const anime = rec.entry[0];
            
            const embed = new EmbedBuilder()
                .setTitle(`✨ Automated Suggestion: ${anime.title}`)
                .setDescription(`**Why you should watch it:**\n${rec.content.substring(0, 450)}...`)
                .setURL(anime.url)
                .setImage(anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url)
                .setColor(0x8A2BE2)
                .setTimestamp()
                .setFooter({ text: 'Daily Suggestions • Data by Jikan' });

            try {
                const detailResponse = await fetch(`https://api.jikan.moe/v4/anime/${anime.mal_id}`);
                const detailData = await detailResponse.json();

                if (detailData.data) {
                    const detailedAnime = detailData.data;

                    // Add Genres/Themes
                    const genres = detailedAnime.genres?.map(g => g.name) || [];
                    const themes = detailedAnime.themes?.map(t => t.name) || [];
                    const categories = [...new Set([...genres, ...themes])]; // Combine and remove duplicates
                    if (categories.length > 0) {
                        embed.addFields({ name: '📚 Categories', value: categories.slice(0, 3).join(', ') || 'N/A', inline: true });
                    }

                    // Add Streaming Platforms
                    const streamingPlatforms = detailedAnime.streaming?.map(s => s.name) || [];
                    if (streamingPlatforms.length > 0) {
                        embed.addFields({ name: '📺 Available On', value: streamingPlatforms.slice(0, 3).join(', ') || 'N/A', inline: true });
                    }
                }
            } catch (detailError) {
                console.error(`Failed to fetch detailed info for anime ${anime.mal_id}:`, detailError);
            }

            await channel.send({ embeds: [embed] });
            
            // 2-second delay between each of the 3 posts
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        configManager.setSuggestionState({ lastIds: currentIds });

    } catch (error) {
        console.error('Auto anime suggestions failed:', error);
    }
}

async function autoPostAniListUpdates() {
    const channelId = config.system.animeNewsChannelId;
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    try {
        const query = `
            query ($page: Int, $perPage: Int) {
                Page (page: $page, perPage: $perPage) {
                    media (type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: false) {
                        id
                        title {
                            romaji
                            english
                            native
                        }
                        description(asHtml: false)
                        coverImage {
                            extraLarge
                        }
                        genres
                        averageScore
                        siteUrl
                        status
                        episodes
                        startDate {
                            year
                            month
                            day
                        }
                    }
                }
            }
        `;
        const variables = {
            page: 1,
            perPage: 5 // Fetch a few to pick from
        };

        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                variables: variables
            })
        });
        const data = await response.json();

        if (!data.data || !data.data.Page || !data.data.Page.media || data.data.Page.media.length === 0) {
            console.log('AniList: No media found or API error.');
            return;
        }

        const trendingAnime = data.data.Page.media.slice(0, 3); // Pick top 3

        const currentIds = trendingAnime.map(anime => anime.id).join(',');
        const state = configManager.getAniListState();
        if (state.lastIds === currentIds) {
            console.log('AniList: No new trending anime updates found since last post.');
            return;
        }

        console.log('Posting automated AniList updates...');

        for (const anime of trendingAnime) {
            const embed = new EmbedBuilder()
                .setTitle(`✨ AniList Trending: ${anime.title.english || anime.title.romaji || anime.title.native}`)
                .setURL(anime.siteUrl)
                .setDescription(truncateText(anime.description || 'No description available.', 500))
                .setColor(0x2E51A2) // AniList blue
                .setTimestamp()
                .setFooter({ text: 'Data provided by AniList' });

            if (anime.coverImage?.extraLarge) embed.setImage(anime.coverImage.extraLarge);
            if (anime.genres && anime.genres.length > 0) embed.addFields({ name: 'Genres', value: anime.genres.join(', '), inline: true });
            if (anime.averageScore) embed.addFields({ name: 'Score', value: `${anime.averageScore}%`, inline: true });
            if (anime.episodes) embed.addFields({ name: 'Episodes', value: anime.episodes.toString(), inline: true });
            if (anime.status) embed.addFields({ name: 'Status', value: anime.status.replace(/_/g, ' '), inline: true });

            await channel.send({ embeds: [embed] });
            await new Promise(resolve => setTimeout(resolve, 2000)); // Delay between posts
        }

        configManager.setAniListState({ lastIds: currentIds });
        console.log(`Successfully posted AniList updates to ${channelId}`);

    } catch (error) {
        console.error('Auto AniList updates failed:', error);
    }
}

async function checkAndCleanOldPosts() {
    console.log('Running old post cleanup...');
    const allPosts = configManager.getAllPosts();
    const now = Date.now();

    for (const [messageId, postData] of allPosts) {
        if (now >= postData.deletionTimestamp) {
            try {
                const channel = client.channels.cache.get(postData.channelId);
                if (channel) {
                    // Fetch the message to ensure it exists before attempting to delete
                    const message = await channel.messages.fetch(messageId).catch(() => null);
                    if (message) {
                        await message.delete();
                        
                        const user = await client.users.fetch(postData.userId).catch(() => null);
                        if (user) {
                            await user.send(`📦 Your product post for **${postData.productName || 'Unknown Product'}** has expired and was removed from the marketplace.`).catch(() => {});
                        }
                        console.log(`Deleted old post message ${messageId} in channel ${postData.channelId}`);
                    } else {
                        console.log(`Old post message ${messageId} not found in channel ${postData.channelId}, removing from storage.`);
                    }
                } else {
                    console.log(`Channel ${postData.channelId} for old post ${messageId} not found, removing from storage.`);
                }
            } catch (error) {
                console.error(`Failed to delete old post ${messageId}:`, error);
            } finally {
                configManager.removePost(messageId); // Always remove from storage after processing
            }
        }
    }
    console.log('Old post cleanup finished.');
}

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot ready: ${client.user.tag}`);
    configManager.init();

    // Initialize Guide Channel
    const guideChannelId = config.system.guideChannelId;
    const guideChannel = client.channels.cache.get(guideChannelId);
    if (guideChannel) {
        console.log('Refreshing Post Guide...');
        await sendPostGuide(guideChannel);
    }

    // Start periodic old post cleanup
    await checkAndCleanOldPosts(); // Run once on startup
    setInterval(checkAndCleanOldPosts, 6 * 60 * 60 * 1000); // Run every 6 hours (adjust as needed)

    // Start periodic Anime News updates - checking every minute for changes
    await autoPostAnimeNews(); // Run once on startup
    setInterval(autoPostAnimeNews, 60 * 1000); // Run every minute

    // Start periodic Manga News updates - checking every minute for changes
    await autoPostMangaNews(); // Run once on startup
    setInterval(autoPostMangaNews, 60 * 1000); // Run every minute

    // Start periodic Anime Suggestions - checking every 1 hour
    await autoPostAnimeSuggestions(); // Run once on startup
    setInterval(autoPostAnimeSuggestions, 1 * 60 * 60 * 1000); // 1 hour

    // Start periodic AniList Updates - checking every 1 hour
    await autoPostAniListUpdates(); // Run once on startup
    setInterval(autoPostAniListUpdates, 1 * 60 * 60 * 1000); // 1 hour

    console.log(`Bot initialized with ${client.commands.size} commands`);
});

client.on(Events.Debug, info => {
    console.log('Discord Debug:', info);
});

client.on(Events.Warn, info => {
    console.log('Discord Warn:', info);
});

client.on(Events.Error, error => {
    console.error('Discord Client Error:', error.message);
    console.error('Error stack:', error.stack);
});

client.on(Events.ShardError, error => {
    console.error('WebSocket Error:', error.message);
});

client.on(Events.Invalidated, () => {
    console.error('Session invalidated!');
});

function buildCloseActionRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('transcript_ticket')
            .setLabel('Transcript')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📄'),
        new ButtonBuilder()
            .setCustomId('delete_ticket')
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );
}

function buildTicketPanelActionRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel('Create Ticket')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎫')
    );
}

function truncateText(text, limit) {
    if (!text || text.length <= limit) {
        return text;
    }

    return `${text.slice(0, limit - 3)}...`;
}

function isImageAttachment(attachment) {
    return Boolean(attachment?.contentType?.startsWith('image/')) ||
        /\.(png|jpe?g|gif|webp|bmp)$/i.test(attachment?.name || '');
}

function buildTicketPanelEmbedFromMessage(message) {
    const embed = new EmbedBuilder()
        .setDescription(truncateText(message.content?.trim() || 'Open a ticket by clicking the button below.', 4096))
        .setColor(0x5865F2)
        .setTimestamp();

    const attachments = Array.from(message.attachments.values());
    const firstImage = attachments.find(isImageAttachment);
    if (firstImage) {
        embed.setImage(firstImage.url);
    }

    const otherAttachmentUrls = attachments
        .filter(attachment => !firstImage || attachment.id !== firstImage.id)
        .map(attachment => attachment.url);

    if (otherAttachmentUrls.length > 0) {
        embed.addFields({
            name: 'Attachments',
            value: truncateText(otherAttachmentUrls.join('\n'), 1024)
        });
    }

    return embed;
}

async function autoDeleteMessage(message, delayMs = 60000) {
    if (message.components?.length > 0) {
        const hasTicketButton = message.components.some(row =>
            row.components.some(button => button.customId === 'create_ticket')
        );

        if (hasTicketButton) {
            return;
        }
    }

    if (message.embeds?.length > 0) {
        const isPilotwebInfo = message.embeds.some(embed =>
            embed.title === '📦 New Web Channel' || embed.title === '📋 Channel Info'
        );

        if (isPilotwebInfo && message.author.id === client.user.id) {
            return;
        }
    }

    setTimeout(() => {
        message.delete().catch(() => {});
    }, delayMs);
}

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                return;
            }

            const shouldDeferReply = command.deferReply ?? true;

            if (shouldDeferReply) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            }

            try {
                await command.execute(interaction, { configManager });

                if (shouldDeferReply && !['setup', 'ticket', 'dmall'].includes(interaction.commandName)) {
                    const reply = await interaction.fetchReply();
                    autoDeleteMessage(reply, 120000);
                }
            } catch (error) {
                console.error(error);
                const errorReply = { content: '❌ Error executing command.', flags: MessageFlags.Ephemeral };
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(errorReply).catch(() => {});
                } else {
                    await interaction.reply(errorReply).catch(() => {});
                }
            }

            // If the command showed a modal, it doesn't need a final reply here.
            // The modal submission will handle its own reply.
            if (interaction.commandName === 'post') {
                return;
            }
            return;
        }

        if (interaction.isChannelSelectMenu() && interaction.customId === 'ticket_panel_channel_select') {
            const targetChannelId = interaction.values[0];
            const targetChannel = interaction.guild.channels.cache.get(targetChannelId);

            if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
                await interaction.update({
                    content: 'Please choose a text channel.',
                    components: interaction.message.components
                });
                return;
            }

            client.ticketPanelDrafts.set(interaction.user.id, {
                guildId: interaction.guild.id,
                sourceChannelId: interaction.channelId,
                targetChannelId,
                expiresAt: Date.now() + 300000,
                setupMessageId: interaction.message.id
            });

            await interaction.update({
                content: `Send your message in ${interaction.channel}. I will turn your next message into the ticket panel and post it in ${targetChannel}.`,
                components: []
            });
            return;
        }

        if (interaction.isButton() && interaction.customId === 'create_ticket') {
            if (configManager.hasTicket(interaction.user.id)) {
                await interaction.reply({
                    content: '❌ You already have an open ticket. Close it first.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId('ticket_modal')
                .setTitle('Create Your Ticket');

            const robloxInput = new TextInputBuilder()
                .setCustomId('roblox_username')
                .setLabel('What is your Roblox username?')
                .setPlaceholder('e.g., Builderman')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(50);

            const buyInput = new TextInputBuilder()
                .setCustomId('buying')
                .setLabel('What you gonna buy?')
                .setPlaceholder('e.g., 1000 Robux, Premium')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100);

            const gameInput = new TextInputBuilder()
                .setCustomId('game')
                .setLabel('What Roblox game?')
                .setPlaceholder('e.g., Blox Fruits, Adopt Me')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100);

            modal.addComponents(
                new ActionRowBuilder().addComponents(robloxInput),
                new ActionRowBuilder().addComponents(buyInput),
                new ActionRowBuilder().addComponents(gameInput)
            );

            await interaction.showModal(modal);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const robloxUser = interaction.fields.getTextInputValue('roblox_username');
            const buying = interaction.fields.getTextInputValue('buying');
            const game = interaction.fields.getTextInputValue('game');
            const cleanName = robloxUser.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
            const channelName = `ticket-${cleanName}`;

            try {
                const guildConfig = config.system;
                const permissionOverwrites = [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles
                        ]
                    }
                ];

                if (guildConfig?.supportRoleIds?.length > 0) {
                    for (const roleId of guildConfig.supportRoleIds) {
                        const role = interaction.guild.roles.cache.get(roleId);
                        if (!role) {
                            continue;
                        }

                        permissionOverwrites.push({
                            id: roleId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        });
                    }
                }

                const channelOptions = {
                    name: channelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites
                };

                if (guildConfig?.ticketCategoryId) {
                    const category = interaction.guild.channels.cache.get(guildConfig.ticketCategoryId);
                    if (category && category.type === ChannelType.GuildCategory) {
                        channelOptions.parent = guildConfig.ticketCategoryId;
                    }
                }

                const ticketChannel = await interaction.guild.channels.create(channelOptions);

                await configManager.saveTicket(interaction.user.id, {
                    channelId: ticketChannel.id,
                    robloxUsername: robloxUser,
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    buying,
                    game,
                    status: 'open',
                    createdAt: new Date().toISOString()
                });

                const infoEmbed = new EmbedBuilder()
                    .setTitle('🎫 New Ticket')
                    .addFields(
                        { name: 'Roblox User', value: robloxUser, inline: true },
                        { name: 'Buying', value: buying, inline: true },
                        { name: 'Game', value: game, inline: true },
                        { name: 'Ticket Owner', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: false }
                    )
                    .setColor(0x5865F2)
                    .setTimestamp();

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`close_${interaction.user.id}`)
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                );

                let pingContent = `<@${interaction.user.id}>`;
                if (guildConfig?.supportRoleIds?.length > 0) {
                    const roleMentions = guildConfig.supportRoleIds.map(id => `<@&${id}>`).join(' ');
                    pingContent += ` ${roleMentions}`;
                }

                await ticketChannel.send({
                    content: pingContent,
                    embeds: [infoEmbed],
                    components: [closeRow]
                });

                const pilotRules = `\`\`\`RULES

Never use account while pilot is on-going!

Please coordinate with the guidelines.

If you think your pilot is done, coordinate with the owner before opening your account.

Do not rush the pilot. Please wait patiently for your pilot to be done. Depending on the service, it can take days or hours.

Any sort of harassment / rude behavior can and will lead to your pilot being discontinued.



---

TERMS OF SERVICE

Renz and Tmarz use a high-end script to make your piloting easier.

Renz and Tmarz will not be liable in case your account gets terminated while piloting your account. However, this happens rarely as the scripts we use are high-end, safe, and reliable.

Ren and Tmarz will also not be liable if any of your in-game items disappear while piloting. Any data-saving issues are not liable by Akiee.*



---

Note:

Once you use the account / change password / or log out all sessions while pilot is ongoing
= cut pilot

Once you spend gems / service / any in-game currency or item related while pilot is ongoing
= cut pilot

Once paid, no refund!

Once the pilot is done, we humbly ask that you take a screenshot of your finished result, and ping the owner when vouching. 
\`\`\``;

                try {
                    await interaction.user.send({
                        content: `**Rules for Pilot**\n${pilotRules}`
                    });
                } catch (dmError) {
                    console.error('Failed to send Rules DM:', dmError);
                }

                const rulesRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('acknowledge_rules')
                        .setLabel('I Have Read the Rules')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                );

                await ticketChannel.send({
                    content: `Rules for Pilot\n<@${interaction.user.id}>, please check your dms.\n\nPlease click the button below if u already read the rules so it will not send again`,
                    components: [rulesRow]
                });

                await interaction.editReply({
                    content: `✅ Ticket created: ${ticketChannel}\n**Roblox:** ${robloxUser}`
                });
            } catch (error) {
                console.error('Ticket creation failed:', error);
                await interaction.editReply({ content: '❌ Failed to create ticket. Check bot permissions.' });
            }

            return;
        }

        if (interaction.isModalSubmit() && interaction.customId === 'post_modal') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Defer the reply for the modal submission

            const productName = interaction.fields.getTextInputValue('product_name');
            const productDescription = interaction.fields.getTextInputValue('product_description');
            const productPrice = interaction.fields.getTextInputValue('product_price');
            const productCurrency = interaction.fields.getTextInputValue('product_currency');
            const productImage = interaction.fields.getTextInputValue('product_image_url');

            const targetChannelId = config.system.postChannelId;
            const targetChannel = interaction.guild.channels.cache.get(targetChannelId);

            if (!targetChannel) {
                return await interaction.editReply({ content: '❌ Target post channel not found in configuration. Please contact an administrator.' });
            }

            // Validate currency
            let currencySymbol;
            let currencyName;
            if (productCurrency.toLowerCase() === 'dollars') {
                currencySymbol = '$';
                currencyName = 'Dollars';
            } else if (productCurrency.toLowerCase() === 'pesos') {
                currencySymbol = '₱';
                currencyName = 'Pesos';
            } else {
                return await interaction.editReply({ content: '❌ Invalid currency. Please type "Dollars" or "Pesos".' });
            }

            // Validate price
            const parsedPrice = parseFloat(productPrice);
            if (isNaN(parsedPrice) || parsedPrice < 0) {
                return await interaction.editReply({ content: '❌ Invalid price. Please enter a valid number (e.g., 10.99).' });
            }

            const deletionTimestamp = Date.now() + (3 * 24 * 60 * 60 * 1000); // 3 days from now
            const postEmbed = new EmbedBuilder()
                .setTitle(`📦 ${productName}`)
                .setColor(0x9B59B6) // Purple theme
                .addFields(
                    { name: '💵 Price', value: `**${currencySymbol}${parsedPrice.toFixed(2)}**`, inline: true },
                    { name: '🪙 Currency', value: `\`${currencyName}\``, inline: true },
                    { name: '👤 Seller', value: `<@${interaction.user.id}>`, inline: false },
                    { name: '⏳ Expires', value: `<t:${Math.floor(deletionTimestamp / 1000)}:R>`, inline: true },
                    { name: ' Description', value: productDescription }
                )
                .setTimestamp();

            const postRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`contact_seller_${interaction.user.id}_${productName.substring(0, 50)}`)
                    .setLabel('Contact Seller')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📩')
            );

            if (productImage && productImage.startsWith('http')) {
                postEmbed.setImage(productImage);
            }
            
            // Notify user if image URL was provided but seems invalid (doesn't start with http)
            if (productImage && !productImage.startsWith('http')) {
                await interaction.followUp({
                    content: '⚠️ The image URL must start with `http` or `https` to be displayed.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            try {
                const sentMessage = await targetChannel.send({ 
                    embeds: [postEmbed],
                    components: [postRow]
                }); 
                
                configManager.savePost(sentMessage.id, { 
                    channelId: targetChannel.id, 
                    deletionTimestamp,
                    userId: interaction.user.id,
                    productName: productName
                });
                const reply = await interaction.editReply({
                    content: `✅ Successfully posted your product in ${targetChannel}!`
                });

                // Auto-delete the confirmation message after 5 seconds
                setTimeout(() => reply.delete().catch(() => {}), 5000);
            } catch (error) {
                console.error('Post command (modal submit) failed:', error);
                await interaction.editReply({ content: '❌ Failed to send the post. Check bot permissions in the target channel.' });
            }
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith('contact_seller_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const parts = interaction.customId.split('_');
            const sellerId = parts[2];
            const productName = parts.slice(3).join('_');
            const tradeCategory = config.system.tradeCategoryId;
            const guildConfig = config.system;

            try {
                const cleanUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
                const tradeChannel = await interaction.guild.channels.create({
                    name: `trade-${cleanUser}`,
                    type: ChannelType.GuildText,
                    parent: tradeCategory,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: interaction.user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles
                            ]
                        },
                        {
                            id: sellerId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles
                            ]
                        }
                    ]
                });

                // Add Support Roles
                if (guildConfig?.supportRoleIds?.length > 0) {
                    for (const roleId of guildConfig.supportRoleIds) {
                        await tradeChannel.permissionOverwrites.edit(roleId, {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true
                        }).catch(() => {});
                    }
                }

                // Notify Seller
                try {
                    const seller = await interaction.client.users.fetch(sellerId);
                    await seller.send(`📩 **New Trade Inquiry!**\n<@${interaction.user.id}> is interested in buying **${productName}**.\nJoin the trade here: ${tradeChannel}`);
                } catch (e) { console.error('DM Seller Error:', e); }

                // Trading Rules for Buyer (moved to a separate function or constant if used elsewhere)
                const tradeRules = `\`\`\`RULES FOR TRADING

Always trade with proof. Screenshots or video recordings are highly recommended before, during, and after the trade.

Do not rush trades. Take your time to confirm all items or currency involved before accepting any trade.

No middleman = Trade at your own risk. If you refuse a trusted middleman, we are not responsible for any loss.

Once the trade is completed, it's final. No refunds or exchanges unless agreed beforehand by both parties and proven with evidence.

Never trade outside of approved platforms. This helps us ensure a safe and secure trading environment.

Scamming = Permanent ban. No warnings will be given if caught attempting or committing a scam.

Do not impersonate staff or other users. Impersonation will result in an immediate ban.

Do not spam or beg for items. This creates a negative experience for others and is not tolerated.\`\`\``;

                try {
                    await interaction.user.send(tradeRules);
                } catch (e) { console.error('DM Buyer Error:', e); }

                const actionRows = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`close_${interaction.user.id}`)
                            .setLabel('Close Ticket')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🔒')
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('call_midman')
                            .setLabel('Call a Midman')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🚨')
                    )
                ];

                await tradeChannel.send({
                    content: `<@${interaction.user.id}>, please check your DMs for the Trading Rules.\n\n**When your transaction is done please type /done**\n\nIf you would like to be helped by admin click the button "Call a Midman"`,
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🤝 New Trade Session')
                            .setDescription(`Buyer: <@${interaction.user.id}>\nSeller: <@${sellerId}>\nProduct: **${productName}**`)
                            .setColor(0x9B59B6)
                            .setTimestamp()
                    ],
                    components: actionRows
                });

                await interaction.editReply(`✅ Trade ticket created: ${tradeChannel}`);
            } catch (error) {
                console.error('Trade Ticket creation failed:', error);
                await interaction.editReply('❌ Failed to create trade ticket. Check bot permissions.');
            }
            return;
        }

        if (interaction.isButton() && interaction.customId === 'call_midman') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            if (!isTicketChannel(interaction.channel)) {
                return await interaction.editReply({
                    content: '❌ This button can only be used in ticket channels.'
                });
            }

            const guildConfig = config.system;
            let pingContent = `🚨 **Midman called by ${interaction.user.tag}!**`;

            if (guildConfig?.supportRoleIds?.length > 0) {
                const roleMentions = guildConfig.supportRoleIds.map(id => `<@&${id}>`).join(' ');
                pingContent += ` ${roleMentions}`;
            } else {
                pingContent += ` (No support roles configured to ping.)`;
            }

            try {
                await interaction.channel.send(pingContent);

                // Disable the button after it's clicked
                const originalMessage = interaction.message;
                const updatedComponents = originalMessage.components.map(row => {
                    return new ActionRowBuilder().addComponents(
                        row.components.map(component => {
                            if (component.customId === 'call_midman') {
                                return ButtonBuilder.from(component).setDisabled(true);
                            }
                            return component;
                        })
                    );
                });

                await originalMessage.edit({ components: updatedComponents });

                await interaction.editReply({
                    content: '✅ Support roles have been notified!'
                });
            } catch (error) {
                console.error('Call midman failed:', error);
                await interaction.editReply({ content: '❌ Failed to call a midman.' });
            }
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith('close_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                removeTicketByChannel(configManager, interaction.channel.id);

                await interaction.channel.permissionOverwrites.set([
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }
                ]);

                const newName = `closed-${interaction.channel.name}`.slice(0, 100);
                await interaction.channel.setName(newName);

                const closeMessage = await interaction.editReply({
                    content: '🔒 Ticket closed.',
                    components: [buildCloseActionRow()]
                });

                autoDeleteMessage(closeMessage, 300000);

                await interaction.channel.send({
                    embeds: [{
                        title: 'Ticket Closed',
                        description: `Closed by ${interaction.user.tag}`,
                        color: 0xED4245,
                        timestamp: new Date()
                    }]
                });
            } catch (error) {
                console.error('Close ticket failed:', error);
                await interaction.editReply({ content: '❌ Error closing ticket.' });
            }

            return;
        }

        if (interaction.isButton() && interaction.customId === 'acknowledge_rules') {
            await interaction.reply({
                content: '✅ Rules acknowledged. Thank you!',
                flags: MessageFlags.Ephemeral
            });
            
            await interaction.message.delete().catch(() => {});
            return;
        }

        if (interaction.isButton() && interaction.customId === 'transcript_ticket') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const ticketEntry = getTicketEntryByChannel(configManager, interaction.channel.id);
                const ticketData = ticketEntry ? ticketEntry[1] : null;
                const { fileName, fileBuffer } = await createTranscript(
                    interaction.channel,
                    ticketData,
                    interaction.user.tag
                );

                const reply = await interaction.editReply({
                    content: '✅ Transcript generated!',
                    files: [buildTranscriptAttachment(fileName, fileBuffer)]
                });

                autoDeleteMessage(reply, 120000);
            } catch (error) {
                console.error('Transcript failed:', error);
                await interaction.editReply({ content: '❌ Failed to generate transcript.' });
            }

            return;
        }

        if (interaction.isButton() && interaction.customId === 'delete_ticket') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const deletedCount = await deleteConnectedChannels(interaction.channel, configManager);
                removeTicketByChannel(configManager, interaction.channel.id);

                await interaction.editReply({
                    content: `🗑️ Deleting ticket${deletedCount > 0 ? ` and ${deletedCount} connected channel(s)` : ''}...`
                });

                setTimeout(() => {
                    interaction.channel.delete('Ticket deleted by admin').catch(console.error);
                }, 2000);
            } catch (error) {
                console.error('Delete ticket failed:', error);
                await interaction.editReply({ content: '❌ Error deleting ticket.' });
            }

            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith('copy_webhook_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const webhooks = await interaction.channel.fetchWebhooks();
                const webhookId = interaction.customId.replace('copy_webhook_', '');
                const webhook = webhooks.find(candidate => candidate.id === webhookId);

                if (!webhook) {
                    await interaction.editReply({ content: '❌ Webhook not found.' });
                    return;
                }

                const reply = await interaction.editReply({
                    content: `📋 **Click to copy:**\n\`\`\`${webhook.url}\`\`\``
                });

                autoDeleteMessage(reply, 60000);
            } catch (error) {
                console.error('Copy webhook failed:', error);
                await interaction.editReply({ content: '❌ Failed to retrieve webhook URL.' });
            }
        }
    } catch (error) {
        console.error('Interaction handler error:', error);
    }
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) {
        return;
    }

    // Sticky Message Logic for Guide Channel
    if (message.channel.id === config.system.guideChannelId) {
        // Delete user message to keep channel read-only
        await message.delete().catch(() => {});
        
        // Re-send guide to keep it at the bottom (sticky)
        await sendPostGuide(message.channel);
        return;
    }

    const draft = client.ticketPanelDrafts.get(message.author.id);
    if (!draft) {
        return;
    }

    if (draft.guildId !== message.guild.id || draft.sourceChannelId !== message.channel.id) {
        return;
    }

    client.ticketPanelDrafts.delete(message.author.id);

    if (draft.expiresAt < Date.now()) {
        const expiredReply = await message.channel.send('Ticket panel setup expired. Use /ticket again.');
        autoDeleteMessage(expiredReply, 120000);
        return;
    }

    const targetChannel = message.guild.channels.cache.get(draft.targetChannelId);
    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
        const missingChannelReply = await message.channel.send('I could not find the selected channel. Use /ticket again.');
        autoDeleteMessage(missingChannelReply, 120000);
        return;
    }

    try {
        await targetChannel.send({
            content: '@everyone',
            embeds: [buildTicketPanelEmbedFromMessage(message)],
            components: [buildTicketPanelActionRow()]
        });
        
        await message.delete().catch(() => {});
        
        if (draft.setupMessageId) {
            const setupMsg = await message.channel.messages.fetch(draft.setupMessageId).catch(() => null);
            if (setupMsg) await setupMsg.delete().catch(() => {});
        }
    } catch (error) {
        console.error('Ticket panel post failed:', error);
        const failureReply = await message.channel.send('I could not post the ticket panel there. Check my permissions and use /ticket again.');
        autoDeleteMessage(failureReply, 120000);
    }
});

client.on(Events.ChannelDelete, async channel => {
    if (!isTicketChannel(channel)) {
        return;
    }

    const ticketEntry = getTicketEntryByChannel(configManager, channel.id);
    if (!ticketEntry) {
        return;
    }

    const [userId] = ticketEntry;
    configManager.closeTicket(userId);
    console.log(`Cleaned up ticket for user ${userId}`);
});

console.log('Starting bot login...');

const loginTimeout = setTimeout(() => {
    console.error('❌ Login timeout after 30 seconds');
    console.error('Possible causes:');
    console.error('1. Invalid token');
    console.error('2. Discord API down');
    console.error('3. IP banned/rate limited');
    console.error('4. WebSocket connection blocked');
}, 30000);

client.login(config.token).then(() => {
    clearTimeout(loginTimeout);
    console.log('✅ Login successful');
}).catch(error => {
    clearTimeout(loginTimeout);
    console.error('❌ Login failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
});
