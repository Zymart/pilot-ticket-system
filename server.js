const express = require('express');
const config = require('./config');

// Start bot
require('./index.js');

// Web server to keep Render alive
const app = express();

app.get('/', (req, res) => {
    res.json({ 
        status: 'Ticket Bot Online',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.listen(config.port, () => {
    console.log(`Web server running on port ${config.port}`);
});
