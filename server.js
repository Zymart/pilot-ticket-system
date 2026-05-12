const dns = require('dns');
const express = require('express');
const config = require('./config');

if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

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
