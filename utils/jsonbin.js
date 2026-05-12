const fetch = require('node-fetch');
const config = require('../config');

const ROOT = 'https://api.jsonbin.io/v3';
const KEY = config.jsonbinMasterKey;

async function request(path, opts = {}) {
    if (!KEY) {
        console.error('No JSONBin key configured. Checked JSONBIN_MASTER_KEY, JSONBIN_API_KEY, JSONBIN_KEY, and X_MASTER_KEY.');
        return null;
    }
    
    try {
        const res = await fetch(`${ROOT}${path}`, {
            ...opts,
            headers: {
                'X-Master-Key': KEY,
                'Content-Type': 'application/json',
                ...opts.headers
            }
        });
        
        if (!res.ok) {
            console.error('JSONBin error:', res.status, await res.text());
            return null;
        }
        
        if (opts.method === 'GET') {
            const json = await res.json();
            return json.record;
        }
        
        return true;
        
    } catch (err) {
        console.error('JSONBin request failed:', err.message);
        return null;
    }
}

module.exports = {
    create: (data) => request('/b', { method: 'POST', body: JSON.stringify(data) }).then(r => r?.metadata?.id),
    read: (id) => id ? request(`/b/${id}`, { method: 'GET' }) : null,
    update: (id, data) => id ? request(`/b/${id}`, { method: 'PUT', body: JSON.stringify(data) }) : false
};
