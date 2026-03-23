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
    MessageFlags,
    AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const configManager = require('./utils/configManager');

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
        } catch (e) {
            console.error('Deploy failed:', e.message);
        }
    })();
}

client.once(Events.ClientReady, () => {
    console.log(`✅ Bot ready: ${client.user.tag}`);
    configManager.init();
    console.log(`Bot initialized with ${client.commands.size} commands`);
});

client.on(Events.Debug, (info) => {
    console.log('Discord Debug:', info);
});

client.on(Events.Warn, (info) => {
    console.log('Discord Warn:', info);
});

client.on(Events.Error, (error) => {
    console.error('Discord Client Error:', error.message);
    console.error('Error stack:', error.stack);
});

client.on(Events.ShardError, (error) => {
    console.error('WebSocket Error:', error.message);
});

client.on(Events.Invalidated, () => {
    console.error('Session invalidated!');
});

async function autoDeleteMessage(message, delayMs = 60000) {
    if (message.components?.length > 0) {
        const hasTicketButton = message.components.some(row => 
            row.components.some(btn => btn.customId === 'create_ticket')
        );
        if (hasTicketButton) return;
    }
    
    if (message.embeds?.length > 0) {
        const isPilotwebInfo = message.embeds.some(e => 
            e.title === '📦 New Web Channel' || e.title === '📋 Channel Info'
        );
        if (isPilotwebInfo && message.author.id === client.user.id) return;
    }
    
    setTimeout(() => {
        message.delete().catch(() => {});
    }, delayMs);
}

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const cmd = client.commands.get(interaction.commandName);
            if (!cmd) return;

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                await cmd.execute(interaction, { configManager });
                
                if (!['setup', 'ticket'].includes(interaction.commandName)) {
                    const reply = await interaction.fetchReply();
                    autoDeleteMessage(reply, 120000);
                }
            } catch (e) {
                console.error(e);
                await interaction.editReply({ content: '❌ Error executing command.' });
            }
        }
        else if (interaction.isButton() && interaction.customId === 'create_ticket') {
            if (configManager.hasTicket(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ You already have an open ticket. Close it first.',
                    flags: MessageFlags.Ephemeral
                });
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
        }
        else if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
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
                        if (role) {
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
                }

                const channelOptions = {
                    name: channelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: permissionOverwrites
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
                    buying: buying,
                    game: game,
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

                const closeRow = new ActionRowBuilder()
                    .addComponents(
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

            } catch (err) {
                console.error('Ticket creation failed:', err);
                await interaction.editReply({ content: '❌ Failed to create ticket. Check bot permissions.' });
            }
        }
        else if (interaction.isButton() && interaction.customId.startsWith('close_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const ticket = configManager.getTicket(interaction.user.id) || 
                    Array.from(configManager.tickets.entries()).find(([k, v]) => v.channelId === interaction.channel.id);
                
                if (ticket) {
                    const userId = Array.isArray(ticket) ? ticket[0] : interaction.user.id;
                    await configManager.closeTicket(userId, { status: 'closed' });
                }

                await interaction.channel.permissionOverwrites.set([
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }
                ]);

                const newName = `closed-${interaction.channel.name}`.slice(0, 100);
                await interaction.channel.setName(newName);

                const actionRow = new ActionRowBuilder()
                    .addComponents(
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

                const closeMsg = await interaction.editReply({
                    content: '🔒 Ticket closed.',
                    components: [actionRow]
                });

                autoDeleteMessage(closeMsg, 300000);

                await interaction.channel.send({
                    embeds: [{
                        title: 'Ticket Closed',
                        description: `Closed by ${interaction.user.tag}`,
                        color: 0xED4245,
                        timestamp: new Date()
                    }]
                });

            } catch (err) {
                console.error('Close ticket failed:', err);
                await interaction.editReply({ content: '❌ Error closing ticket.' });
            }
        }
        else if (interaction.isButton() && interaction.customId === 'transcript_ticket') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const sortedMessages = Array.from(messages.values()).reverse();

                let transcript = `TRANSCRIPT FOR ${interaction.channel.name}\n`;
                transcript += `Generated: ${new Date().toISOString()}\n`;
                transcript += `Generated by: ${interaction.user.tag}\n`;
                transcript += `=====================================\n\n`;

                for (const msg of sortedMessages) {
                    const time = msg.createdAt.toISOString();
                    const author = msg.author.tag;
                    const content = msg.content || '[No text]';
                    const attachments = msg.attachments.size > 0 ? 
                        `[Attachments: ${msg.attachments.map(a => a.url).join(', ')}]` : '';
                    
                    transcript += `[${time}] ${author}: ${content} ${attachments}\n`;
                    
                    if (msg.embeds.length > 0) {
                        transcript += `[Embed: ${msg.embeds[0].title || 'No title'}]\n`;
                    }
                }

                const fileName = `transcript-${interaction.channel.name}-${Date.now()}.txt`;
                const fileBuffer = Buffer.from(transcript, 'utf-8');

                const guildConfig = await configManager.getGuildConfig(interaction.guild.id);
                const logChannelId = guildConfig?.logChannelId;

                if (logChannelId) {
                    const logChannel = interaction.guild.channels.cache.get(logChannelId);
                    if (logChannel) {
                        const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });
                        await logChannel.send({
                            content: `📄 Transcript for ${interaction.channel.name} generated by ${interaction.user.tag}`,
                            files: [attachment]
                        });
                    }
                }

                const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });
                const reply = await interaction.editReply({
                    content: '✅ Transcript generated!',
                    files: [attachment]
                });

                autoDeleteMessage(reply, 120000);

            } catch (err) {
                console.error('Transcript failed:', err);
                await interaction.editReply({ content: '❌ Failed to generate transcript.' });
            }
        }
        else if (interaction.isButton() && interaction.customId === 'delete_ticket') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const channelName = interaction.channel.name;
                const cleanName = channelName.replace('closed-', '').replace('ticket-', '');
                
                const pilotwebChannels = interaction.guild.channels.cache.filter(ch => 
                    ch.name.includes(cleanName) && ch.name !== channelName && ch.type === ChannelType.GuildText
                );

                let deletedCount = 0;
                for (const [id, ch] of pilotwebChannels) {
                    try {
                        await ch.delete('Connected ticket deleted');
                        deletedCount++;
                    } catch (err) {
                        console.error(`Failed to delete pilotweb ${ch.name}:`, err);
                    }
                }

                const ticketEntry = Array.from(configManager.tickets.entries()).find(([k, v]) => v.channelId === interaction.channel.id);
                if (ticketEntry) {
                    const [userId, ticketData] = ticketEntry;
                    await configManager.closeTicket(userId, { ...ticketData, status: 'deleted' });
                }

                await interaction.editReply({
                    content: `🗑️ Deleting ticket${deletedCount > 0 ? ` and ${deletedCount} connected channel(s)` : ''}...`
                });

                setTimeout(() => {
                    interaction.channel.delete('Ticket deleted by admin').catch(console.error);
                }, 2000);

            } catch (err) {
                console.error('Delete ticket failed:', err);
                await interaction.editReply({ content: '❌ Error deleting ticket.' });
            }
        }
        else if (interaction.isButton() && interaction.customId.startsWith('copy_webhook_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            
            try {
                const webhooks = await interaction.channel.fetchWebhooks();
                const webhook = webhooks.find(wh => wh.id === interaction.customId.replace('copy_webhook_', ''));
                
                if (webhook) {
                    const reply = await interaction.editReply({
                        content: `📋 **Click to copy:**\n\`\`\`${webhook.url}\`\`\``
                    });
                    
                    autoDeleteMessage(reply, 60000);
                } else {
                    await interaction.editReply({ content: '❌ Webhook not found.' });
                }
            } catch (err) {
                console.error('Copy webhook failed:', err);
                await interaction.editReply({ content: '❌ Failed to retrieve webhook URL.' });
            }
        }

    } catch (err) {
        console.error('Interaction handler error:', err);
    }
});

client.on(Events.ChannelDelete, async channel => {
    if (!channel.name.startsWith('ticket-') && !channel.name.startsWith('closed-')) return;
    
    let ticketUserId = null;
    let ticketData = null;
    
    for (const [userId, data] of configManager.tickets) {
        if (data.channelId === channel.id) {
            ticketUserId = userId;
            ticketData = data;
            break;
        }
    }
    
    if (!ticketUserId) return;
    
    await configManager.closeTicket(ticketUserId, {
        ...ticketData,
        status: 'deleted',
        deletedAt: new Date().toISOString()
    });
    
    console.log(`Cleaned up ticket for user ${ticketUserId}`);
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
}).catch(err => {
    clearTimeout(loginTimeout);
    console.error('❌ Login failed:', err.message);
    console.error('Error code:', err.code);
    console.error('Full error:', err);
});
