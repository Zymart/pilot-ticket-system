const fs = require('fs');
const path = require('path');
const jsonbin = require('./jsonbin');

const FILE = path.join(__dirname, '..', 'data.json');

class ConfigManager {
    constructor() {
        this.configs = new Map();
        this.tickets = new Map();
    }

    async init() {
        this.load();
        console.log(`Loaded ${this.configs.size} configs, ${this.tickets.size} tickets`);
    }

    load() {
        if (!fs.existsSync(FILE)) return;
        
        try {
            const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
            Object.entries(d.guilds || {}).forEach(([k,v]) => this.configs.set(k,v));
            Object.entries(d.tickets || {}).forEach(([k,v]) => this.tickets.set(k,v));
        } catch (err) {
            console.error('Failed to load:', err);
        }
    }

    save() {
        const data = {
            guilds: Object.fromEntries(this.configs),
            tickets: Object.fromEntries(this.tickets),
            savedAt: new Date().toISOString()
        };
        
        try {
            fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
            console.log('Saved data');
        } catch (err) {
            console.error('Failed to save:', err);
        }
    }

    async getGuildConfig(guildId) {
        return this.configs.get(guildId) || null;
    }

    async saveGuildConfig(guildId, config) {
        this.configs.set(guildId, {
            ...config,
            updatedAt: new Date().toISOString()
        });
        this.save();
    }

    async saveTicket(userId, ticketData) {
        this.tickets.set(userId, ticketData);
        this.save();
    }

    async closeTicket(userId, closedData) {
        this.tickets.delete(userId);
        this.save();
    }

    getTicket(userId) {
        return this.tickets.get(userId) || null;
    }

    hasTicket(userId) {
        return this.tickets.has(userId);
    }

    async loadAllTickets() {}
}

module.exports = new ConfigManager();
