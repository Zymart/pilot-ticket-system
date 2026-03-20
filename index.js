const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    REST, 
    Routes, 
    Events,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder
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

// In-memory cache for active tickets (binId -> channel mapping)
const activeTickets = new Map();

client.on(Events.InteractionCreate, async interaction => {
    // Slash commands
    if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) return;
        try {
            await cmd.execute(interaction);
        } catch (e) {
            console.error(e);
            await interaction.reply({ content: 'Error.', ephemeral: true }).catch(() => {});
        }
    }

    // Button = INSTANT TICKET + STORE IN JSONBIN
    if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
        const parts = interaction.customId.split('_');
        const buttonLabel = parts.slice(2).join('_').replace(/_/g, ' ');
        
        await interaction.deferReply({ ephemeral: true });

        // Check if user already has open ticket
        for (const [binId, data] of activeTickets) {
            if (data.userId === interaction.user.id && data.status === 'open') {
                return interaction.editReply({ 
                    content: `❌ You already have an open ticket.` 
                });
            }
        }

        const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)}-${Math.floor(Math.random()*9999)}`;

        try {
            // Create Discord channel
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

            // Store in JSONBin
            const ticketData = {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: ticketChannel.id,
                guildId: interaction.guild.id,
                type: buttonLabel,
                status: 'open',
                createdAt: new Date().toISOString(),
                messages: []
            };

            const binId = await jsonbin.create(ticketData);
            activeTickets.set(binId, { ...ticketData, binId });

            // Send welcome message
            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`Ticket: ${buttonLabel}`)
                .setDescription(`Hey ${interaction.user}, describe your issue here.\n\n**Ticket ID:** \`${binId}\``)
                .setColor(0x5865F2)
                .setFooter({ text: 'Click 🔒 to close this ticket' });

            const closeButton = {
                type: 1,
                components: [{
                    type: 2,
                    custom_id: `close_${binId}`,
                    label: 'Close Ticket',
                    style: 4,
                    emoji: '🔒'
                }]
            };

            await ticketChannel.send({ 
                content: `<@${interaction.user.id}>`,
                embeds: [welcomeEmbed],
                components: [closeButton]
            });

            await interaction.editReply({
                content: `✅ Ticket created: ${ticketChannel}\n**ID:** \`${binId}\``
            });

        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: '❌ Failed to create ticket.' });
        }
    }

    // Close ticket button
    if (interaction.isButton() && interaction.customId.startsWith('close_')) {
        const binId = interaction.customId.replace('close_', '');
        
        await interaction.deferReply({ ephemeral: true });

        try {
            // Update JSONBin
            const data = await jsonbin.read(binId);
            data.status = 'closed';
            data.closedAt = new Date().toISOString();
            data.closedBy = interaction.user.id;
            await jsonbin.update(binId, data);

            // Remove from memory
            activeTickets.delete(binId);

            // Delete channel or rename
            await interaction.channel.setName(`closed-${interaction.channel.name}`);
            await interaction.channel.permissionOverwrites.set([]); // Lock it

            await interaction.editReply({ content: '🔒 Ticket closed and archived.' });

            // Send final message
            await interaction.channel.send({
                embeds: [{
                    title: 'Ticket Closed',
                    description: `Closed by ${interaction.user.tag}\n**ID:** \`${binId}\``,
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
