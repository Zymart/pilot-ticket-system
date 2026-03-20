const jsonbin = require('./jsonbin');

class ConfigManager {
    constructor() {
        this.configs = new Map();
        this.tickets = new Map();
        this.binIds = new Map();
    }

    async init() {
        const masterBinId = await jsonbin.getOrCreateBin('master-config', {
            type: 'master',
            guilds: {},
            createdAt: new Date().toISOString()
        });
        this.binIds.set('master', masterBinId);
        console.log('ConfigManager initialized');
    }

    async getGuildConfig(guildId) {
        if (this.configs.has(guildId)) {
            return this.configs.get(guildId);
        }

        const masterBinId = this.binIds.get('master');
        if (!masterBinId || masterBinId.startsWith('fake-')) {
            return null;
        }

        try {
            const masterData = await jsonbin.read(masterBinId);
            if (masterData?.guilds?.[guildId]) {
                this.configs.set(guildId, masterData.guilds[guildId]);
                return masterData.guilds[guildId];
            }
        } catch (err) {
            console.error('Failed to load guild config:', err);
        }
        return null;
    }

    async saveGuildConfig(guildId, config) {
        this.configs.set(guildId, config);
        
        const masterBinId = this.binIds.get('master');
        if (!masterBinId || masterBinId.startsWith('fake-')) {
            console.warn('Using local config only (no JSONBin)');
            return;
        }

        try {
            const masterData = await jsonbin.read(masterBinId) || { guilds: {} };
            masterData.guilds[guildId] = {
                ...config,
                updatedAt: new Date().toISOString()
            };
            await jsonbin.update(masterBinId, masterData);
        } catch (err) {
            console.error('Failed to save guild config:', err);
        }
    }

    async loadAllTickets() {
        const ticketsBinId = await jsonbin.getOrCreateBin('tickets-index', {
            type: 'tickets-index',
            activeTickets: {},
            closedTickets: [],
            count: 0
        });
        this.binIds.set('tickets', ticketsBinId);
        
        try {
            const data = await jsonbin.read(ticketsBinId);
            if (data?.activeTickets) {
                for (const [userId, ticketInfo] of Object.entries(data.activeTickets)) {
                    this.tickets.set(userId, ticketInfo);
                }
            }
            console.log(`Loaded ${this.tickets.size} active tickets from JSONBin`);
        } catch (err) {
            console.error('Failed to load tickets:', err);
        }
    }

    async saveTicket(userId, ticketData) {
        this.tickets.set(userId, ticketData);
        
        const ticketsBinId = this.binIds.get('tickets');
        if (!ticketsBinId || ticketsBinId.startsWith('fake-')) return;

        try {
            const data = await jsonbin.read(ticketsBinId) || { activeTickets: {}, closedTickets: [], count: 0 };
            data.activeTickets[userId] = ticketData;
            data.count = Object.keys(data.activeTickets).length;
            await jsonbin.update(ticketsBinId, data);
        } catch (err) {
            console.error('Failed to save ticket:', err);
        }
    }

    async closeTicket(userId, closedData) {
        this.tickets.delete(userId);
        
        const ticketsBinId = this.binIds.get('tickets');
        if (!ticketsBinId || ticketsBinId.startsWith('fake-')) return;

        try {
            const data = await jsonbin.read(ticketsBinId) || { activeTickets: {}, closedTickets: [], count: 0 };
            delete data.activeTickets[userId];
            data.closedTickets.push({
                ...closedData,
                closedAt: new Date().toISOString()
            });
            data.count = Object.keys(data.activeTickets).length;
            await jsonbin.update(ticketsBinId, data);
        } catch (err) {
            console.error('Failed to close ticket:', err);
        }
    }

    getTicket(userId) {
        return this.tickets.get(userId) || null;
    }

    hasTicket(userId) {
        return this.tickets.has(userId);
    }
}

module.exports = new ConfigManager();
