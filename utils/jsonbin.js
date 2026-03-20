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
