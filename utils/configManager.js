const fs = require('fs');
const path = require('path');

const DATA_FILE = '/var/data/bot_data.json';

class ConfigManager {
    constructor() {
        this.configs = new Map();
        this.tickets = new Map();
    }

    init() {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        this.load();
        console.log(`Loaded ${this.configs.size} configs, ${this.tickets.size} tickets`);
    }

    load() {
        if (!fs.existsSync(DATA_FILE)) return;
        
        try {
            const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            Object.entries(d.guilds || {}).forEach(([k,v]) => this.configs.set(k,v));
            Object.entries(d.tickets || {}).forEach(([k,v]) => this.tickets.set(k,v));
        } catch (err) {
            console.error('Load failed:', err);
        }
    }

    save() {
        const data = {
            guilds: Object.fromEntries(this.configs),
            tickets: Object.fromEntries(this.tickets),
            savedAt: new Date().toISOString()
        };
        
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('Save failed:', err);
        }
    }

    getGuildConfig(id) { return this.configs.get(id); }
    saveGuildConfig(id, cfg) { this.configs.set(id, cfg); this.save(); }
    saveTicket(id, t) { this.tickets.set(id, t); this.save(); }
    closeTicket(id) { this.tickets.delete(id); this.save(); }
    getTicket(id) { return this.tickets.get(id); }
    hasTicket(id) { return this.tickets.has(id); }
    loadAllTickets() {}
}

module.exports = new ConfigManager();
