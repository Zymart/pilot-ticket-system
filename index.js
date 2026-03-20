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
const jsonbin = require('./utils/jsonbin');
const configManager = require('./utils/configManager');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

// AUTO-LOAD ALL COMMANDS
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

// DEPLOY COMMANDS
if (process.env.NODE_ENV === 'production') {
    const rest = new REST({ version: '10' }).setToken(config.token);
    (async () => {
        try {
            console.log('Deploying commands...');
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands }
            );
            console.log('Commands deployed.');
        } catch (e) {
            console.error('Deploy failed:', e);
        }
    })();
}

// BOT READY - LOAD ALL DATA
client.once(Events.ClientReady, async () => {
    console.log(`Bot ready: ${client.user.tag}`);
    await configManager.init();
    await configManager.loadAllTickets();
    console.log(`Bot fully initialized with ${client.commands.size} commands`);
});

// INTERACTION HANDLER
client.on(Events.InteractionCreate, async interaction => {
    try {
        // SLASH COMMANDS
        if (interaction.isChatInputCommand()) {
            const cmd = client.commands.get(interaction.commandName);
            if (!cmd) return;

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                await cmd.execute(interaction, { configManager });
            } catch (e) {
                console.error(e);
                await interaction.editReply({ content: '❌ Error executing command.' });
            }
        }
        
        // CREATE TICKET BUTTON
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
        
        // MODAL SUBMIT - CREATE TICKET
        else if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const robloxUser = interaction.fields.getTextInputValue('roblox_username');
            const buying = interaction.fields.getTextInputValue('buying');
            const game = interaction.fields.getTextInputValue('game');

            const cleanName = robloxUser.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
            const channelName = `ticket-${cleanName}-${Math.floor(Math.random()*99)}`;

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

                const ticketData = {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    robloxUsername: robloxUser,
                    buying: buying,
                    game: game,
                    channelId: ticketChannel.id,
                    guildId: interaction.guild.id,
                    status: 'open',
                    createdAt: new Date().toISOString()
                };

                const binId = await jsonbin.create(ticketData);
                await configManager.saveTicket(interaction.user.id, { 
                    channelId: ticketChannel.id, 
                    binId,
                    ...ticketData
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
                            .setCustomId(`close_${binId}`)
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
        
        // OLD CLOSE BUTTON (from ticket creation)
        else if (interaction.isButton() && interaction.customId.startsWith('close_')) {
            const binId = interaction.customId.replace('close_', '');
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const data = await jsonbin.read(binId);
                data.status = 'closed';
                data.closedAt = new Date().toISOString();
                data.closedBy = interaction.user.id;
                data.closedByTag = interaction.user.tag;
                await jsonbin.update(binId, data);

                const ticket = configManager.getTicket(interaction.user.id) || 
                    Array.from(configManager.tickets.entries()).find(([k, v]) => v.binId === binId);
                
                if (ticket) {
                    const userId = Array.isArray(ticket) ? ticket[0] : interaction.user.id;
                    await configManager.closeTicket(userId, { ...ticket, status: 'closed' });
                }

                await interaction.channel.permissionOverwrites.set([
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }
                ]);

                const newName = `closed-${interaction.channel.name}`.slice(0, 100);
                await interaction.channel.setName(newName);

                // Show new buttons
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

                await interaction.editReply({
                    content: '🔒 Ticket closed.',
                    components: [actionRow]
                });

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

        // TRANSCRIPT BUTTON
        else if (interaction.isButton() && interaction.customId === 'transcript_ticket') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                // Fetch all messages
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const sortedMessages = Array.from(messages.values()).reverse();

                // Build transcript
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

                // Create file
                const fileName = `transcript-${interaction.channel.name}-${Date.now()}.txt`;
                const fileBuffer = Buffer.from(transcript, 'utf-8');

                // Get log channel
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

                // Also send to current channel
                const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });
                await interaction.editReply({
                    content: '✅ Transcript generated!',
                    files: [attachment]
                });

            } catch (err) {
                console.error('Transcript failed:', err);
                await interaction.editReply({ content: '❌ Failed to generate transcript.' });
            }
        }

        // DELETE BUTTON
        else if (interaction.isButton() && interaction.customId === 'delete_ticket') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const channelName = interaction.channel.name;
                const cleanName = channelName.replace('closed-', '').replace('ticket-', '');
                
                // Find and delete connected pilotweb channels
                const pilotwebChannels = interaction.guild.channels.cache.filter(ch => 
                    ch.name.includes(cleanName) && ch.name !== channelName && ch.type === ChannelType.GuildText
                );

                let deletedCount = 0;
                for (const [id, ch] of pilotwebChannels) {
                    try {
                        await ch.delete('Connected ticket deleted');
                        deletedCount++;
                        console.log(`Deleted pilotweb channel: ${ch.name}`);
                    } catch (err) {
                        console.error(`Failed to delete pilotweb ${ch.name}:`, err);
                    }
                }

                // Clean up ticket from memory
                const ticketEntry = Array.from(configManager.tickets.entries()).find(([k, v]) => v.channelId === interaction.channel.id);
                if (ticketEntry) {
                    const [userId, ticketData] = ticketEntry;
                    
                    // Update JSONBin
                    if (ticketData.binId && !ticketData.binId.startsWith('fake-')) {
                        const data = await jsonbin.read(ticketData.binId) || {};
                        data.status = 'deleted';
                        data.deletedAt = new Date().toISOString();
                        data.deletedBy = interaction.user.id;
                        await jsonbin.update(ticketData.binId, data);
                    }
                    
                    await configManager.closeTicket(userId, { ...ticketData, status: 'deleted' });
                }

                await interaction.editReply({
                    content: `🗑️ Deleting ticket${deletedCount > 0 ? ` and ${deletedCount} connected channel(s)` : ''}...`
                });

                // Delete the ticket channel
                setTimeout(() => {
                    interaction.channel.delete('Ticket deleted by admin').catch(console.error);
                }, 2000);

            } catch (err) {
                console.error('Delete ticket failed:', err);
                await interaction.editReply({ content: '❌ Error deleting ticket.' });
            }
        }

        // COPY WEBHOOK URL BUTTON
        else if (interaction.isButton() && interaction.customId.startsWith('copy_webhook_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            
            try {
                const webhooks = await interaction.channel.fetchWebhooks();
                const webhook = webhooks.find(wh => wh.id === interaction.customId.replace('copy_webhook_', ''));
                
                if (webhook) {
                    await interaction.editReply({
                        content: `📋 **Click to copy:**\n\`\`\`${webhook.url}\`\`\``
                    });
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

// DETECT CHANNEL DELETION - CLEAN UP TICKETS
client.on(Events.ChannelDelete, async channel => {
    if (!channel.name.startsWith('ticket-') && !channel.name.startsWith('closed-')) return;
    
    console.log(`Ticket channel deleted: ${channel.name} (${channel.id})`);
    
    let ticketUserId = null;
    let ticketData = null;
    
    for (const [userId, data] of configManager.tickets) {
        if (data.channelId === channel.id) {
            ticketUserId = userId;
            ticketData = data;
            break;
        }
    }
    
    if (!ticketUserId) {
        console.log('No ticket found for deleted channel');
        return;
    }
    
    if (ticketData.binId && !ticketData.binId.startsWith('fake-')) {
        try {
            const data = await jsonbin.read(ticketData.binId);
            if (data) {
                data.status = 'deleted';
                data.deletedAt = new Date().toISOString();
                data.deletedBy = 'manual';
                await jsonbin.update(ticketData.binId, data);
            }
        } catch (err) {
            console.error('Failed to update JSONBin on delete:', err);
        }
    }
    
    await configManager.closeTicket(ticketUserId, {
        ...ticketData,
        status: 'deleted',
        deletedAt: new Date().toISOString()
    });
    
    console.log(`Cleaned up ticket for user ${ticketUserId}`);
});

client.login(config.token).catch(err => {
    console.error('Login failed:', err);
    process.exit(1);
});
