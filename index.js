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
const jsonbin = require('./utils/jsonbin');
const configManager = require('./utils/configManager');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
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
    
    // Init config manager and load all tickets
    await configManager.init();
    await configManager.loadAllTickets();
    
    console.log(`Bot fully initialized with ${client.commands.size} commands`);
});

// INTERACTION HANDLER
client.on(Events.InteractionCreate, async interaction => {
    try {
        // SLASH COMMANDS - AUTO HANDLED
        if (interaction.isChatInputCommand()) {
            const cmd = client.commands.get(interaction.commandName);
            if (!cmd) return;

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                // Inject configManager into command context
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
                // AUTO-LOAD GUILD CONFIG
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

                // AUTO-ADD SUPPORT ROLES FROM CONFIG
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

                // AUTO-SET CATEGORY FROM CONFIG
                if (guildConfig?.ticketCategoryId) {
                    const category = interaction.guild.channels.cache.get(guildConfig.ticketCategoryId);
                    if (category && category.type === ChannelType.GuildCategory) {
                        channelOptions.parent = guildConfig.ticketCategoryId;
                    }
                }

                const ticketChannel = await interaction.guild.channels.create(channelOptions);

                // SAVE TO JSONBIN
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
                
                // AUTO-SAVE TO CONFIG MANAGER
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
                        { name: 'Discord', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: false }
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

                await ticketChannel.send({
                    content: `<@${interaction.user.id}>`,
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
        
        // CLOSE TICKET BUTTON
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

                // AUTO-REMOVE FROM CONFIG MANAGER
                const ticket = configManager.getTicket(interaction.user.id) || 
                    Array.from(configManager.tickets.entries()).find(([k, v]) => v.binId === binId);
                
                if (ticket) {
                    const userId = Array.isArray(ticket) ? ticket[0] : interaction.user.id;
                    await configManager.closeTicket(userId, data);
                }

                await interaction.channel.permissionOverwrites.set([
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }
                ]);

                const newName = `closed-${interaction.channel.name}`.slice(0, 100);
                await interaction.channel.setName(newName);

                await interaction.editReply({ content: '🔒 Ticket closed and archived.' });

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

    } catch (err) {
        console.error('Interaction handler error:', err);
    }
});

client.login(config.token).catch(err => {
    console.error('Login failed:', err);
    process.exit(1);
});
