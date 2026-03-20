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
    MessageFlags
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const jsonbin = require('./utils/jsonbin');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commands = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
}

// Deploy
if (process.env.NODE_ENV === 'production') {
    const rest = new REST({ version: '10' }).setToken(config.token);
    (async () => {
        try {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands }
            );
            console.log('Deployed.');
        } catch (e) {
            console.error(e);
        }
    })();
}

client.once(Events.ClientReady, () => {
    console.log(`Ready: ${client.user.tag}`);
});

// Active tickets: userId -> { channelId, binId }
const userTickets = new Map();

client.on(Events.InteractionCreate, async interaction => {
    // Slash commands
    if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) return;
        
        // Defer first to prevent timeout
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        
        try {
            await cmd.execute(interaction);
        } catch (e) {
            console.error(e);
            await interaction.editReply({ content: 'Error.' }).catch(() => {});
        }
    }

    // Create Ticket button → Show Modal
    if (interaction.isButton() && interaction.customId === 'create_ticket') {
        if (userTickets.has(interaction.user.id)) {
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

    // Modal Submit → Create Ticket
    if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const robloxUser = interaction.fields.getTextInputValue('roblox_username');
        const buying = interaction.fields.getTextInputValue('buying');
        const game = interaction.fields.getTextInputValue('game');

        const cleanName = robloxUser.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
        const channelName = `ticket-${cleanName}-${Math.floor(Math.random()*99)}`;

        try {
            const ticketChannel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
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
                    }
                ]
            });

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
            userTickets.set(interaction.user.id, { channelId: ticketChannel.id, binId });

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
            console.error(err);
            await interaction.editReply({ content: '❌ Failed to create ticket.' });
        }
    }

    // Close Ticket
    if (interaction.isButton() && interaction.customId.startsWith('close_')) {
        const binId = interaction.customId.replace('close_', '');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const data = await jsonbin.read(binId);
            data.status = 'closed';
            data.closedAt = new Date().toISOString();
            data.closedBy = interaction.user.id;
            await jsonbin.update(binId, data);

            const entry = Array.from(userTickets.entries()).find(([k, v]) => v.binId === binId);
            if (entry) userTickets.delete(entry[0]);

            await interaction.channel.permissionOverwrites.set([
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }
            ]);
            await interaction.channel.setName(`closed-${interaction.channel.name.slice(0, 20)}`);

            await interaction.editReply({ content: '🔒 Ticket closed.' });

            await interaction.channel.send({
                embeds: [{
                    title: 'Ticket Closed',
                    description: `Closed by ${interaction.user.tag}`,
                    color: 0xED4245,
                    timestamp: new Date()
                }]
            });

        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: '❌ Error closing ticket.' });
        }
    }
});

client.login(config.token);
