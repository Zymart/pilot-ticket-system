const fetch = require('node-fetch');

const JSONBIN_ROOT = 'https://api.jsonbin.io/v3';
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;

class JSONBin {
    constructor() {
        if (!MASTER_KEY) {
            console.error('ERROR: JSONBIN_MASTER_KEY not set!');
        }
        this.headers = {
            'X-Master-Key': MASTER_KEY,
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
            
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`HTTP ${res.status}: ${err}`);
            }
            
            const json = await res.json();
            return json.metadata?.id;
            
        } catch (err) {
            console.error('JSONBin create failed:', err.message);
            return 'fake-' + Date.now();
        }
    }

    async read(binId) {
        if (!MASTER_KEY || binId.startsWith('fake-')) return null;

        try {
            const res = await fetch(`${JSONBIN_ROOT}/b/${binId}`, {
                headers: this.headers
            });
            
            if (!res.ok) {
                if (res.status === 404) return null;
                throw new Error(`HTTP ${res.status}`);
            }
            
            const json = await res.json();
            return json.record;
            
        } catch (err) {
            console.error('JSONBin read failed:', err.message);
            return null;
        }
    }

    async update(binId, data) {
        if (!MASTER_KEY || binId.startsWith('fake-')) return false;

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
