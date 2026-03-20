const fs = require('fs');
const path = require('path');
const jsonbin = require('./jsonbin');

// HARDCODE YOUR BIN ID HERE AFTER CREATING IT MANUALLY
const HARDCODED_BIN_ID = ''; // Paste your bin ID here, e.g., '65f1234567890abcdef12345'

// Fallback file if JSONBin fails
const FILE = path.join(__dirname, '..', 'data.json');

class ConfigManager {
    constructor() {
        this.configs = new Map();
        this.tickets = new Map();
        this.binId = HARDCODED_BIN_ID || null;
    }

    async init() {
        // If no hardcoded ID, try to load from file or create new
        if (!this.binId) {
            if (fs.existsSync(FILE)) {
                const saved = JSON.parse(fs.readFileSync(FILE));
                this.binId = saved.binId || null;
            }
        }

        // If still no ID, create new bin once
        if (!this.binId) {
            this.binId = await jsonbin.create({
                type: 'ticket-bot',
                guilds: {},
                tickets: {},
                created: new Date().toISOString()
            });
            
            if (this.binId && !this.binId.startsWith('fake-')) {
                fs.writeFileSync(FILE, JSON.stringify({ binId: this.binId }));
                console.log('Created new bin:', this.binId);
                console.log('SAVE THIS ID AND HARDCODE IT:', this.binId);
            }
        }

        await this.load();
    }

    async load() {
        if (!this.binId || this.binId.startsWith('fake-')) {
            // Load from local file
            if (fs.existsSync(FILE)) {
                const d = JSON.parse(fs.readFileSync(FILE));
                Object.entries(d.guilds || {}).forEach(([k,v]) => this.configs.set(k,v));
                Object.entries(d.tickets || {}).forEach(([k,v]) => this.tickets.set(k,v));
            }
            console.log(`Loaded from file: ${this.configs.size} configs, ${this.tickets.size} tickets`);
            return;
        }

        // Load from JSONBin
        const data = await jsonbin.read(this.binId);
        if (data) {
            Object.entries(data.guilds || {}).forEach(([k,v]) => this.configs.set(k,v));
            Object.entries(data.tickets || {}).forEach(([k,v]) => this.tickets.set(k,v));
            console.log(`Loaded from JSONBin: ${this.configs.size} configs, ${this.tickets.size} tickets`);
        } else {
            console.log('Bin empty or not found');
        }
    }

    async save() {
        const data = {
            guilds: Object.fromEntries(this.configs),
            tickets: Object.fromEntries(this.tickets),
            updated: new Date().toISOString()
        };

        if (!this.binId || this.binId.startsWith('fake-')) {
            // Save to local file
            const fileData = { ...data, binId: this.binId };
            fs.writeFileSync(FILE, JSON.stringify(fileData, null, 2));
            console.log('Saved to file');
            return;
        }

        // Update existing bin (never create new)
        const success = await jsonbin.update(this.binId, data);
        if (success) {
            console.log('Saved to JSONBin');
        } else {
            // Fallback to file
            fs.writeFileSync(FILE, JSON.stringify({ ...data, binId: this.binId }, null, 2));
            console.log('JSONBin failed, saved to file');
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
        await this.save();
    }

    async saveTicket(userId, ticketData) {
        this.tickets.set(userId, ticketData);
        await this.save();
    }

    async closeTicket(userId) {
        this.tickets.delete(userId);
        await this.save();
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
