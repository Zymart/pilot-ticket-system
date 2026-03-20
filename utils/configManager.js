const fs = require('fs');
const path = require('path');
const jsonbin = require('./jsonbin');

// Get bin ID from env or fallback file
const HARDCODED_BIN_ID = process.env.JSONBIN_BIN_ID || '';
const FILE = path.join(__dirname, '..', 'data.json');

class ConfigManager {
    constructor() {
        this.configs = new Map();
        this.tickets = new Map();
        this.binId = HARDCODED_BIN_ID || null;
    }

    async init() {
        // If no env ID, try to load from file
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
                console.log('ADD THIS TO ENV: JSONBIN_BIN_ID=' + this.binId);
            }
        }

        await this.load();
    }

    async load() {
        if (!this.binId || this.binId.startsWith('fake-')) {
            if (fs.existsSync(FILE)) {
                const d = JSON.parse(fs.readFileSync(FILE));
                Object.entries(d.guilds || {}).forEach(([k,v]) => this.configs.set(k,v));
                Object.entries(d.tickets || {}).forEach(([k,v]) => this.tickets.set(k,v));
            }
            console.log(`Loaded from file: ${this.configs.size} configs, ${this.tickets.size} tickets`);
            return;
        }

        const data = await jsonbin.read(this.binId);
        if (data) {
            Object.entries(data.guilds || {}).forEach(([k,v]) => this.configs.set(k,v));
            Object.entries(data.tickets || {}).forEach(([k,v]) => this.tickets.set(k,v));
            console.log(`Loaded from JSONBin: ${this.configs.size} configs, ${this.tickets.size} tickets`);
        }
    }

    async save() {
        const data = {
            guilds: Object.fromEntries(this.configs),
            tickets: Object.fromEntries(this.tickets),
            updated: new Date().toISOString()
        };

        if (!this.binId || this.binId.startsWith('fake-')) {
            const fileData = { ...data, binId: this.binId };
            fs.writeFileSync(FILE, JSON.stringify(fileData, null, 2));
            return;
        }

        const success = await jsonbin.update(this.binId, data);
        if (!success) {
            fs.writeFileSync(FILE, JSON.stringify({ ...data, binId: this.binId }, null, 2));
        }
    }

    async getGuildConfig(guildId) { return this.configs.get(guildId) || null; }
    async saveGuildConfig(guildId, config) { this.configs.set(guildId, config); await this.save(); }
    async saveTicket(userId, ticketData) { this.tickets.set(userId, ticketData); await this.save(); }
    async closeTicket(userId) { this.tickets.delete(userId); await this.save(); }
    getTicket(userId) { return this.tickets.get(userId) || null; }
    hasTicket(userId) { return this.tickets.has(userId); }
    async loadAllTickets() {}
}

module.exports = new ConfigManager();
