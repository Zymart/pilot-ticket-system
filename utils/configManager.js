const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

class ConfigManager {
    constructor() {
        this.configs = new Map();
        this.tickets = new Map();
        this.posts = new Map(); // New: Store post data for cleanup
        this.animeState = {};
        this.mangaState = {};
        this.suggestionState = {};
        this.anilistState = {}; // New: Store state for AniList updates
    }

    init() {
        this.load();
        console.log(`Loaded ${this.configs.size} configs, ${this.tickets.size} tickets, ${this.posts.size} posts, anime state initialized: ${!!this.animeState.lastIds}`);
    }

    load() {
        if (!fs.existsSync(DATA_FILE)) return;
        
        try {
            const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            Object.entries(d.guilds || {}).forEach(([k,v]) => this.configs.set(k,v));
            Object.entries(d.tickets || {}).forEach(([k,v]) => this.tickets.set(k,v));
            Object.entries(d.posts || {}).forEach(([k,v]) => this.posts.set(k,v)); // New: Load posts
            this.animeState = d.animeState || {};
            this.mangaState = d.mangaState || {};
            this.suggestionState = d.suggestionState || {};
            this.anilistState = d.anilistState || {}; // New: Load AniList state
        } catch (err) {
            console.error('Load failed:', err);
        }
    }

    save() {
        const data = {
            guilds: Object.fromEntries(this.configs),
            tickets: Object.fromEntries(this.tickets),
            posts: Object.fromEntries(this.posts), // New: Save posts
            animeState: this.animeState,
            mangaState: this.mangaState,
            suggestionState: this.suggestionState,
            anilistState: this.anilistState, // New: Save AniList state
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

    // New methods for managing posts
    savePost(messageId, postData) {
        this.posts.set(messageId, postData);
        this.save();
    }

    removePost(messageId) {
        this.posts.delete(messageId);
        this.save();
    }

    getAllPosts() {
        return Array.from(this.posts.entries());
    }

    getAnimeState() {
        return this.animeState;
    }

    setAnimeState(state) {
        this.animeState = state;
        this.save();
    }

    getMangaState() {
        return this.mangaState;
    }

    setMangaState(state) {
        this.mangaState = state;
        this.save();
    }

    getSuggestionState() {
        return this.suggestionState;
    }

    setSuggestionState(state) {
        this.suggestionState = state;
        this.save();
    }

    getAniListState() {
        return this.anilistState;
    }

    setAniListState(state) {
        this.anilistState = state;
        this.save();
    }
}

module.exports = new ConfigManager();
