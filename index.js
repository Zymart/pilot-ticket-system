const { Client, GatewayIntentBits, Collection, REST, Routes, Events } = require('discord.js');
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

// Deploy commands on startup (only in production)
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
        } catch (error) {
            console.error('Deploy failed:', error);
        }
    })();
}

client.once(Events.ClientReady, () => {
    console.log(`Bot ready: ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    // Slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, client);
        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: 'Error executing command.', 
                ephemeral: true 
            }).catch(() => {});
        }
    }

    // Modal submissions
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'ticketModal') {
            const title = interaction.fields.getTextInputValue('ticketTitle');
            const message = interaction.fields.getTextInputValue('ticketMessage');

            // For now, just confirm receipt
            await interaction.reply({
                content: `**Ticket Received**\n**Title:** ${title}\n**Message:** ${message}`,
                ephemeral: true
            });
        }
    }
});

client.login(config.token);
