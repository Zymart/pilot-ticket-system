const jsonbin = require('./jsonbin');
const fs = require('fs');
const path = require('path');

const LOCAL_BIN_ID_FILE = path.join(__dirname, '..', '.bin_ids.json');

class ConfigManager {
    constructor() {
        this.configs = new Map();
        this.tickets = new Map();
        this.masterBinId = null;
    }

    async init() {
        // Try to load existing bin IDs from local file
        if (fs.existsSync(LOCAL_BIN_ID_FILE)) {
            const saved = JSON.parse(fs.readFileSync(LOCAL_BIN_ID_FILE, 'utf8'));
            this.masterBinId = saved.masterBinId || null;
        }

        // If no master bin, create one
        if (!this.masterBinId) {
            this.masterBinId = await jsonbin.create({
                type: 'pilot-ticket-master',
                version: '1.0',
                guilds: {},
                activeTickets: {},
                closedTickets: [],
                updatedAt: new Date().toISOString()
            });
            
            // Save bin ID locally
            fs.writeFileSync(LOCAL_BIN_ID_FILE, JSON.stringify({ masterBinId: this.masterBinId }, null, 2));
            console.log('Created new master bin:', this.masterBinId);
        } else {
            console.log('Using existing master bin:', this.masterBinId);
        }

        // Load all data from master bin
        await this.loadAllData();
    }

    async loadAllData() {
        if (!this.masterBinId) return;

        try {
            const data = await jsonbin.read(this.masterBinId);
            if (!data) {
                console.warn('Master bin empty or not found');
                return;
            }

            // Load guild configs
            if (data.guilds) {
                for (const [guildId, config] of Object.entries(data.guilds)) {
                    this.configs.set(guildId, config);
                }
            }

            // Load active tickets
            if (data.activeTickets) {
                for (const [userId, ticket] of Object.entries(data.activeTickets)) {
                    this.tickets.set(userId, ticket);
                }
            }

            console.log(`Loaded ${this.configs.size} guild configs, ${this.tickets.size} active tickets from JSONBin`);

        } catch (err) {
            console.error('Failed to load from master bin:', err);
        }
    }

    async saveToMasterBin() {
        if (!this.masterBinId) return;

        const data = {
            type: 'pilot-ticket-master',
            version: '1.0',
            guilds: Object.fromEntries(this.configs),
            activeTickets: Object.fromEntries(this.tickets),
            updatedAt: new Date().toISOString()
        };

        try {
            await jsonbin.update(this.masterBinId, data);
        } catch (err) {
            console.error('Failed to save to master bin:', err);
        }
    }

    async getGuildConfig(guildId) {
        // Return from memory (already loaded at init)
        return this.configs.get(guildId) || null;
    }

    async saveGuildConfig(guildId, config) {
        this.configs.set(guildId, {
            ...config,
            updatedAt: new Date().toISOString()
        });
        
        // Save to JSONBin immediately
        await this.saveToMasterBin();
        console.log('Saved guild config for', guildId);
    }

    async loadAllTickets() {
        // Already loaded in init
        return;
    }

    async saveTicket(userId, ticketData) {
        this.tickets.set(userId, {
            ...ticketData,
            savedAt: new Date().toISOString()
        });
        
        // Save to JSONBin immediately
        await this.saveToMasterBin();
        console.log('Saved ticket for user', userId);
    }

    async closeTicket(userId, closedData) {
        this.tickets.delete(userId);
        
        // Save to JSONBin immediately
        await this.saveToMasterBin();
        console.log('Closed ticket for user', userId);
    }

    getTicket(userId) {
        return this.tickets.get(userId) || null;
    }

    hasTicket(userId) {
        return this.tickets.has(userId);
    }
}

module.exports = new ConfigManager();
