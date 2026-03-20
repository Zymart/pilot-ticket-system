server.js 
const express = require('express');
const config = require('./config');

const app = express();

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.json({ 
        status: 'Ticket Bot Online',
        timestamp: new Date().toISOString()
    });
});

app.listen(config.port, () => {
    console.log(`Web server running on port ${config.port}`);
});

setTimeout(() => {
    try {
        require('./index.js');
    } catch (err) {
        console.error('Bot failed to start:', err);
    }
}, 1000);

render.yaml
services:
  - type: web
    name: ticket-bot
    runtime: node
    region: oregon
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: DISCORD_TOKEN
        sync: false
      - key: CLIENT_ID
        sync: false
      - key: GUILD_ID
        sync: false
      - key: JSONBIN_MASTER_KEY
        sync: false

  - type: cron
    name: ticket-bot-ping
    runtime: node
    region: oregon
    schedule: "*/10 * * * *"
    buildCommand: echo "No build needed"
    startCommand: curl -s https://$RENDER_EXTERNAL_HOSTNAME/health || echo "Ping failed"

    package.json
    {
  "name": "ticket-bot",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node index.js"
  },
  "dependencies": {
    "discord.js": "^14.14.1",
    "express": "^4.18.2",
    "dotenv": "^16.3.1",
    "node-fetch": "^2.7.0"
  }
}

index.js
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
        } catch (e) {
            console.error('Deploy failed:', e);
        }
    })();
}

client.once(Events.ClientReady, () => {
    console.log(`Bot ready: ${client.user.tag}`);
});

// Active tickets: userId -> { channelId, binId }
const userTickets = new Map();

client.on(Events.InteractionCreate, async interaction => {
    try {
        // Slash commands
        if (interaction.isChatInputCommand()) {
            const cmd = client.commands.get(interaction.commandName);
            if (!cmd) return;
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            
            try {
                await cmd.execute(interaction);
            } catch (e) {
                console.error(e);
                await interaction.editReply({ content: '❌ Error executing command.' });
            }
        }

        // Create Ticket button → Show Modal
        else if (interaction.isButton() && interaction.customId === 'create_ticket') {
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
        else if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
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
                console.error('Ticket creation failed:', err);
                await interaction.editReply({ content: '❌ Failed to create ticket. Check bot permissions.' });
            }
        }

        // Close Ticket button
        else if (interaction.isButton() && interaction.customId.startsWith('close_')) {
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

config.js
require('dotenv').config();

module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    port: process.env.PORT || 3000
};

.gitignore
node_modules/
.env
.env.local
.DS_Store

.env.example
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here
PORT=3000

utils/jsonbin.js
const fetch = require('node-fetch');

const JSONBIN_ROOT = 'https://api.jsonbin.io/v3';
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;

class JSONBin {
    constructor() {
        if (!MASTER_KEY) {
            console.warn('WARNING: JSONBIN_MASTER_KEY not set. Using fake storage.');
        }
        this.headers = {
            'X-Master-Key': MASTER_KEY || 'fake-key',
            'Content-Type': 'application/json'
        };
    }

    async create(data) {
        if (!MASTER_KEY) return 'fake-' + Date.now();
        
        try {
            const res = await fetch(`${JSONBIN_ROOT}/b`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            return json.metadata?.id || 'fake-' + Date.now();
        } catch (err) {
            console.error('JSONBin create failed:', err.message);
            return 'fake-' + Date.now();
        }
    }

    async read(binId) {
        if (!MASTER_KEY || binId.startsWith('fake-')) return { status: 'open' };
        
        try {
            const res = await fetch(`${JSONBIN_ROOT}/b/${binId}`, {
                headers: this.headers
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            return json.record;
        } catch (err) {
            console.error('JSONBin read failed:', err.message);
            return { status: 'open' };
        }
    }

    async update(binId, data) {
        if (!MASTER_KEY || binId.startsWith('fake-')) return true;
        
        try {
            const res = await fetch(`${JSONBIN_ROOT}/b/${binId}`, {
                method: 'PUT',
                headers: this.headers,
                body: JSON.stringify(data)
            });
            return res.ok;
        } catch (err) {
            console.error('JSONBin update failed:', err.message);
            return false;
        }
    }
}

module.exports = new JSONBin();

commands/ticket.js
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Post the ticket panel (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('red, green, blue, yellow, purple, black').setRequired(false)),

    async execute(interaction) {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const colorChoice = interaction.options.getString('color') || 'blue';

        const colors = {
            red: 0xED4245,
            green: 0x57F287,
            blue: 0x5865F2,
            yellow: 0xFEE75C,
            purple: 0xEB459E,
            black: 0x23272A
        };

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(colors[colorChoice] || colors.blue)
            .setTimestamp();

        const button = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket')
                    .setLabel('Create Ticket')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎫')
            );

        await interaction.channel.send({ embeds: [embed], components: [button] });
        await interaction.editReply({ content: '✅ Ticket panel posted.' });
    }
};
