const jsonbin = require('./jsonbin');
const fs = require('fs');
const path = require('path');

// Use /tmp for Render (persists better) or current directory
const DATA_DIR = process.env.RENDER ? '/tmp' : __dirname + '/..';
const BIN_ID_FILE = path.join(DATA_DIR, '.bin_id');
const LOCAL_FILE = path.join(DATA_DIR, 'data.json');

class ConfigManager {
    constructor() {
        this.configs = new Map();
        this.tickets = new Map();
        this.binId = null;
        this.useFile = false;
    }

    async init() {
        // Try to load existing bin ID
        if (fs.existsSync(BIN_ID_FILE)) {
            this.binId = fs.readFileSync(BIN_ID_FILE, 'utf8').trim();
            console.log('Loaded bin ID:', this.binId);
            
            // Test if bin exists
            const test = await jsonbin.read(this.binId);
            if (!test) {
                console.log('Bin not found, will create new');
                this.binId = null;
            }
        }

        // Create new bin if needed
        if (!this.binId) {
            this.binId = await jsonbin.create({
                type: 'ticket-bot',
                guilds: {},
                tickets: {},
                created: new Date().toISOString()
            });
            
            if (this.binId && !this.binId.startsWith('fake-')) {
                fs.writeFileSync(BIN_ID_FILE, this.binId);
                console.log('Created new bin:', this.binId);
            } else {
                console.log('JSONBin failed, using local file');
                this.useFile = true;
            }
        }

        // Load data
        await this.load();
    }

    async load() {
        if (this.useFile) {
            // Load from local file
            if (fs.existsSync(LOCAL_FILE)) {
                const data = JSON.parse(fs.readFileSync(LOCAL_FILE));
                Object.entries(data.guilds || {}).forEach(([k, v]) => this.configs.set(k, v));
                Object.entries(data.tickets || {}).forEach(([k, v]) => this.tickets.set(k, v));
            }
            console.log(`Loaded from file: ${this.configs.size} configs, ${this.tickets.size} tickets`);
            return;
        }

        // Load from JSONBin
        const data = await jsonbin.read(this.binId);
        if (data) {
            Object.entries(data.guilds || {}).forEach(([k, v]) => this.configs.set(k, v));
            Object.entries(data.tickets || {}).forEach(([k, v]) => this.tickets.set(k, v));
            console.log(`Loaded from JSONBin: ${this.configs.size} configs, ${this.tickets.size} tickets`);
        }
    }

    async save() {
        const data = {
            guilds: Object.fromEntries(this.configs),
            tickets: Object.fromEntries(this.tickets),
            updated: new Date().toISOString()
        };

        if (this.useFile) {
            fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2));
            console.log('Saved to file');
            return;
        }

        // Update existing bin (don't create new!)
        const success = await jsonbin.update(this.binId, data);
        if (success) {
            console.log('Saved to JSONBin');
        } else {
            console.error('Failed to save to JSONBin');
            // Fallback to file
            this.useFile = true;
            fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2));
        }
    }

    // Public methods
    async getGuildConfig(guildId) {
        return this.configs.get(guildId) || null;
    }

    async saveGuildConfig(guildId, config) {
        this.configs.set(guildId, config);
        await this.save();
    }

    async saveTicket(userId, ticket) {
        this.tickets.set(userId, ticket);
        await this.save();
    }

    async closeTicket(userId) {
        this.tickets.delete(userId);
        await this.save();
    }

    getTicket(userId) {
        return this.tickets.get(userId);
    }

    hasTicket(userId) {
        return this.tickets.has(userId);
    }

    async loadAllTickets() {
        // Already loaded
    }
}

module.exports = new ConfigManager();
