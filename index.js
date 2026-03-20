const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    REST, 
    Routes, 
    Events,
    ChannelType,
    PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

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

client.on(Events.InteractionCreate, async interaction => {
    // Slash
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

    // Button = INSTANT TICKET
    if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
        const parts = interaction.customId.split('_');
        const buttonNum = parts[1];
        const buttonLabel = parts.slice(2).join('_').replace(/_/g, ' ');
        
        await interaction.deferReply({ ephemeral: true });

        // Create channel name
        const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;

        try {
            const ticketChannel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: null, // Set category ID if you want
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
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    }
                ]
            });

            // Send welcome message in ticket
            await ticketChannel.send({
                content: `<@${interaction.user.id}>`,
                embeds: [{
                    title: `Ticket Opened: ${buttonLabel.toUpperCase()}`,
                    description: `Hey ${interaction.user.username}, support will be with you shortly.\n\n**Type:** ${buttonLabel}\n**Opened:** <t:${Math.floor(Date.now()/1000)}:R>`,
                    color: 0x5865F2
                }]
            });

            await interaction.editReply({
                content: `✅ Ticket created: ${ticketChannel}`
            });

        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: '❌ Failed to create ticket.' });
        }
    }
});

client.login(config.token);
