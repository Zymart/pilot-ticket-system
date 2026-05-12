const status = {
    startedAt: new Date().toISOString(),
    config: {},
    discord: {
        state: 'booting',
        ready: false,
        updatedAt: new Date().toISOString()
    }
};

function setConfig(update) {
    status.config = {
        ...status.config,
        ...update,
        updatedAt: new Date().toISOString()
    };
}

function setDiscord(update) {
    status.discord = {
        ...status.discord,
        ...update,
        updatedAt: new Date().toISOString()
    };
}

function getStatus() {
    return {
        ...status,
        uptime: process.uptime()
    };
}

module.exports = {
    getStatus,
    setConfig,
    setDiscord
};
