const dns = require('dns');
const express = require('express');
const config = require('./config');
const runtimeStatus = require('./utils/runtimeStatus');

if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

const app = express();

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        bot: runtimeStatus.getStatus()
    });
});

app.get('/', (req, res) => {
    res.json({ 
        status: 'Ticket Bot Web Service Online',
        timestamp: new Date().toISOString(),
        bot: runtimeStatus.getStatus().discord
    });
});

app.listen(config.port, () => {
    console.log(`Web server running on port ${config.port}`);
});

setTimeout(() => {
    try {
        require('./index.js');
    } catch (err) {
        runtimeStatus.setDiscord({
            state: 'startup_crashed',
            ready: false,
            lastError: err.message
        });
        console.error('Bot failed to start:', err);
    }
}, 1000);
