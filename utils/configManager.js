const jsonbin = require('./jsonbin');
const fs = require('fs');
const path = require('path');

const LOCAL_BIN_ID_FILE = path.join(__dirname, '..', '.bin_ids.json');
const LOCAL_FALLBACK_FILE = path.join(__dirname, '..', 'local_data.json');

class ConfigManager {
    constructor() {
        this.configs = new Map();
        this.tickets = new Map();
        this.masterBinId = null;
        this.useLocalFallback = false;
    }

    async init() {
        // Check if JSONBin key exists
        if (!process.env.JSONBIN_MASTER_KEY) {
            console.warn('WARNING: JSONBIN_MASTER_KEY not set! Using local file fallback.');
            this.useLocalFallback = true;
            this.loadLocalFallback();
            return;
        }

        // Try to load existing bin ID
        if (fs.existsSync(LOCAL_BIN_ID_FILE)) {
            try {
                const saved = JSON.parse(fs.readFileSync(LOCAL_BIN_ID_FILE, 'utf8'));
                this.masterBinId = saved.masterBinId || null;
                console.log('Found saved master bin ID:', this.masterBinId);
            } catch (err) {
                console.error('Failed to read bin ID file:', err);
            }
        }

        // If we have a bin ID, verify it exists
        if (this.masterBinId) {
            const testRead = await jsonbin.read(this.masterBinId);
            if (!testRead) {
                console.log('Master bin not found, creating new one...');
                this.masterBinId = null;
            } else {
                console.log('Master bin verified:', this.masterBinId);
            }
        }

        // Create new master bin if needed
        if (!this.masterBinId) {
            this.masterBinId = await jsonbin.create({
                type: 'pilot-ticket-master',
                version: '1.0',
                guilds: {},
                activeTickets: {},
                updatedAt: new Date().toISOString()
            });
            
            if (this.masterBinId && !this.masterBinId.startsWith('fake-')) {
                fs.writeFileSync(LOCAL_BIN_ID_FILE, JSON.stringify({ masterBinId: this.masterBinId }, null, 2));
                console.log('Created new master bin:', this.masterBinId);
            } else {
                console.error('Failed to create master bin, using local fallback');
                this.useLocalFallback = true;
            }
        }

        // Load all data
        await this.loadAllData();
    }

    async loadAllData() {
        if (this.useLocalFallback) {
            this.loadLocalFallback();
            return;
        }

        if (!this.masterBinId) return;

        try {
            const data = await jsonbin.read(this.masterBinId);
            if (!data) {
                console.warn('Master bin empty');
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

            console.log(`Loaded ${this.configs.size} guild configs, ${this.tickets.size} tickets`);

        } catch (err) {
            console.error('Failed to load from master bin:', err);
            this.useLocalFallback = true;
            this.loadLocalFallback();
        }
    }

    async saveToMasterBin() {
        if (this.useLocalFallback) {
            this.saveLocalFallback();
            return;
        }

        if (!this.masterBinId || this.masterBinId.startsWith('fake-')) {
            console.error('Cannot save: no valid master bin');
            return;
        }

        const data = {
            type: 'pilot-ticket-master',
            version: '1.0',
            guilds: Object.fromEntries(this.configs),
            activeTickets: Object.fromEntries(this.tickets),
            updatedAt: new Date().toISOString()
        };

        try {
            const success = await jsonbin.update(this.masterBinId, data);
            if (success) {
                console.log('Saved to JSONBin successfully');
            } else {
                console.error('Failed to save to JSONBin');
                this.useLocalFallback = true;
                this.saveLocalFallback();
            }
        } catch (err) {
            console.error('Failed to save to master bin:', err);
            this.useLocalFallback = true;
            this.saveLocalFallback();
        }
    }

    loadLocalFallback() {
        if (!fs.existsSync(LOCAL_FALLBACK_FILE)) return;
        
        try {
            const data = JSON.parse(fs.readFileSync(LOCAL_FALLBACK_FILE, 'utf8'));
            
            if (data.guilds) {
                for (const [guildId, config] of Object.entries(data.guilds)) {
                    this.configs.set(guildId, config);
                }
            }
            
            if (data.activeTickets) {
                for (const [userId, ticket] of Object.entries(data.activeTickets)) {
                    this.tickets.set(userId, ticket);
                }
            }
            
            console.log(`Loaded from local fallback: ${this.configs.size} configs, ${this.tickets.size} tickets`);
        } catch (err) {
            console.error('Failed to load local fallback:', err);
        }
    }

    saveLocalFallback() {
        const data = {
            guilds: Object.fromEntries(this.configs),
            activeTickets: Object.fromEntries(this.tickets),
            updatedAt: new Date().toISOString()
        };
        
        try {
            fs.writeFileSync(LOCAL_FALLBACK_FILE, JSON.stringify(data, null, 2));
            console.log('Saved to local fallback');
        } catch (err) {
            console.error('Failed to save local fallback:', err);
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
        
        await this.saveToMasterBin();
        console.log('Saved ticket for user', userId);
    }

    async closeTicket(userId, closedData) {
        this.tickets.delete(userId);
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
