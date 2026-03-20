const express = require('express');
const config = require('./config');

const app = express();

// Health check endpoint
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
        bot: client?.user?.tag || 'starting...',
        timestamp: new Date().toISOString()
    });
});

// Start web server first
const server = app.listen(config.port, () => {
    console.log(`Web server running on port ${config.port}`);
});

// Then start bot
let client;
try {
    const { Client, GatewayIntentBits } = require('discord.js');
    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers
        ]
    });
    
    require('./index.js');
} catch (err) {
    console.error('Bot failed to start:', err);
}
