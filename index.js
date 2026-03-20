const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    REST, 
    Routes, 
    Events,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
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

// Deploy commands
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

    // Button clicks
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('ticket_create_')) {
            // Get button label from the clicked button
            const buttonLabel = interaction.component.label;
            
            // Create modal
            const modal = new ModalBuilder()
                .setCustomId(`ticket_modal_${interaction.customId}`)
                .setTitle(`Ticket: ${buttonLabel}`);

            const titleInput = new TextInputBuilder()
                .setCustomId('ticketTitle')
                .setLabel('Subject')
                .setPlaceholder('Brief summary...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100);

            const messageInput = new TextInputBuilder()
                .setCustomId('ticketMessage')
                .setLabel('Details')
                .setPlaceholder('Describe your issue in detail...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(messageInput)
            );

            await interaction.showModal(modal);
        }
    }

    // Modal submissions
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('ticket_modal_')) {
            const title = interaction.fields.getTextInputValue('ticketTitle');
            const message = interaction.fields.getTextInputValue('ticketMessage');
            const buttonType = interaction.customId.replace('ticket_modal_ticket_create_', '');

            // For now, just confirm
            await interaction.reply({
                embeds: [
                    {
                        title: '🎫 Ticket Submitted',
                        description: `**Type:** Button ${buttonType}\n**Subject:** ${title}\n**Details:** ${message}`,
                        color: 0x00FF00,
                        timestamp: new Date().toISOString()
                    }
                ],
                ephemeral: true
            });
        }
    }
});

client.login(config.token);
