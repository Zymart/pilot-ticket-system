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
    removeTicketByChannel,
    sendTranscriptToLog
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

client.once(Events.ClientReady, () => {
    console.log(`✅ Bot ready: ${client.user.tag}`);
    configManager.init();
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

            const shouldDeferReply = command.deferReply !== false;

            if (shouldDeferReply) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            }

            try {
                await command.execute(interaction, { configManager });

                if (shouldDeferReply && !['setup', 'ticket'].includes(interaction.commandName)) {
                    const reply = await interaction.fetchReply();
                    autoDeleteMessage(reply, 120000);
                }
            } catch (error) {
                console.error(error);
                await interaction.editReply({ content: '❌ Error executing command.' });
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
                expiresAt: Date.now() + 300000
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
                const guildConfig = await configManager.getGuildConfig(interaction.guild.id);
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

                await interaction.editReply({
                    content: `✅ Ticket created: ${ticketChannel}\n**Roblox:** ${robloxUser}`
                });
            } catch (error) {
                console.error('Ticket creation failed:', error);
                await interaction.editReply({ content: '❌ Failed to create ticket. Check bot permissions.' });
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

                await sendTranscriptToLog(
                    interaction.guild,
                    configManager,
                    fileName,
                    fileBuffer,
                    `📄 Transcript for ${interaction.channel.name} generated by ${interaction.user.tag}`
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

    const draft = client.ticketPanelDrafts.get(message.author.id);
    if (!draft) {
        return;
    }

    if (draft.guildId !== message.guild.id || draft.sourceChannelId !== message.channel.id) {
        return;
    }

    if (draft.expiresAt < Date.now()) {
        client.ticketPanelDrafts.delete(message.author.id);
        const expiredReply = await message.channel.send('Ticket panel setup expired. Use /ticket again.');
        autoDeleteMessage(expiredReply, 120000);
        return;
    }

    const targetChannel = message.guild.channels.cache.get(draft.targetChannelId);
    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
        client.ticketPanelDrafts.delete(message.author.id);
        const missingChannelReply = await message.channel.send('I could not find the selected channel. Use /ticket again.');
        autoDeleteMessage(missingChannelReply, 120000);
        return;
    }

    try {
        await targetChannel.send({
            embeds: [buildTicketPanelEmbedFromMessage(message)],
            components: [buildTicketPanelActionRow()]
        });

        client.ticketPanelDrafts.delete(message.author.id);

        const successReply = await message.channel.send(`Ticket panel posted in ${targetChannel}.`);
        autoDeleteMessage(successReply, 120000);
    } catch (error) {
        client.ticketPanelDrafts.delete(message.author.id);
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
