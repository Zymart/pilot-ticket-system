const express = require('express');
const config = require('./config');

// Start bot
require('./index.js');

const app = express();

app.get('/', (req, res) => {
    res.json({ 
        status: 'Ticket Bot Online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        bot: client?.user?.tag || 'starting...'
    });
});

app.listen(config.port, () => {
    console.log(`Web server running on port ${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/health`);
});
