const fetch = require('node-fetch');
const JSONBIN_ROOT = 'https://api.jsonbin.io/v3';
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;

class JSONBin {
    constructor() {
        this.headers = {
            'X-Master-Key': MASTER_KEY,
            'Content-Type': 'application/json'
        };
    }

    async create(data) {
        const res = await fetch(`${JSONBIN_ROOT}/b`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(data)
        });
        const json = await res.json();
        return json.metadata.id;
    }

    async read(binId) {
        const res = await fetch(`${JSONBIN_ROOT}/b/${binId}`, {
            headers: this.headers
        });
        const json = await res.json();
        return json.record;
    }

    async update(binId, data) {
        const res = await fetch(`${JSONBIN_ROOT}/b/${binId}`, {
            method: 'PUT',
            headers: this.headers,
            body: JSON.stringify(data)
        });
        return res.ok;
    }
}

module.exports = new JSONBin();
